import { initializeWorldTables } from './migrations/world-schema.js';

const RECRUITMENT_SCHEMA_VERSION = '2026-10-v25';

export function createDatabaseInitialization({
  cleanupCustomizationCategories,
} = {}) {
  const userPreferenceTablesInitCache = new WeakMap();
  const globalSettingsInitCache = new WeakMap();

  async function ensureManagerChangeTables(env) {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_deletion_locks (
      telegram_id INTEGER PRIMARY KEY,
      locked_at INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'managed_delete'
    )`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS manager_change_requests (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      target_telegram_id INTEGER NOT NULL,
      initiator_telegram_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      required_votes INTEGER NOT NULL DEFAULT 1,
      voter_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      decided_at INTEGER,
      finalizing_at INTEGER
    )`).run();
    const columns=await env.DB.prepare(`PRAGMA table_info(manager_change_requests)`).all();
    if(!(columns.results||[]).some(column=>column.name==='finalizing_at')){
      try{await env.DB.prepare(`ALTER TABLE manager_change_requests ADD COLUMN finalizing_at INTEGER`).run()}
      catch(error){if(!/duplicate column/i.test(String(error)))throw error}
    }
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS manager_change_votes (
      request_id TEXT NOT NULL,
      voter_telegram_id INTEGER NOT NULL,
      approve INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (request_id,voter_telegram_id)
    )`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_manager_change_requests_deletion_lock_insert
      BEFORE INSERT ON manager_change_requests WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.target_telegram_id OR telegram_id=NEW.initiator_telegram_id)
      BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_manager_change_requests_deletion_lock_identity_update
      BEFORE UPDATE OF target_telegram_id,initiator_telegram_id ON manager_change_requests WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.target_telegram_id OR telegram_id=NEW.target_telegram_id OR telegram_id=OLD.initiator_telegram_id OR telegram_id=NEW.initiator_telegram_id)
      BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_manager_change_votes_deletion_lock_insert
      BEFORE INSERT ON manager_change_votes WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.voter_telegram_id)
      BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_manager_change_votes_deletion_lock_update
      BEFORE UPDATE ON manager_change_votes WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.voter_telegram_id OR telegram_id=NEW.voter_telegram_id)
      BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  }

  async function ensureApprovalSessionsTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS territory_approval_sessions (
        territory_id TEXT PRIMARY KEY,
        inspector_chat_id TEXT NOT NULL,
        step INTEGER NOT NULL DEFAULT 1,
        city_name TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        x TEXT NOT NULL DEFAULT '',
        z TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      )
    `).run();
    // A chat can have only one active approval conversation. Keep the most recently
    // updated session before enforcing this invariant for all future writes.
    await env.DB.prepare(`DELETE FROM territory_approval_sessions AS older
      WHERE EXISTS (
        SELECT 1 FROM territory_approval_sessions AS newer
        WHERE newer.inspector_chat_id=older.inspector_chat_id
          AND (newer.updated_at>older.updated_at
            OR (newer.updated_at=older.updated_at AND newer.territory_id>older.territory_id))
      )`).run();
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_territory_approval_sessions_chat
      ON territory_approval_sessions(inspector_chat_id)`).run();
  }

  async function ensureUserDirectoryTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_directory (
        id TEXT PRIMARY KEY,
        telegram_id INTEGER NOT NULL UNIQUE,
        telegram_username TEXT,
        mc_nickname TEXT NOT NULL DEFAULT '',
        auto_linked INTEGER NOT NULL DEFAULT 1,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    const cols = await env.DB.prepare(`PRAGMA table_info(user_directory)`).all();
    const names = new Set((cols.results || []).map(r => r.name));
    if (!names.has('hidden')) {
      try { await env.DB.prepare(`ALTER TABLE user_directory ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; }
    }
  }

  async function ensureUserPreferenceTables(env) {
    await ensureWorldTables(env);
    let promise = userPreferenceTablesInitCache.get(env);
    if (!promise) {
      promise = (async () => {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_preferences (
          telegram_id INTEGER PRIMARY KEY,
          default_theme TEXT NOT NULL DEFAULT 'vox',
          timezone TEXT NOT NULL DEFAULT 'UTC+3',
          all_notifications INTEGER NOT NULL DEFAULT 1,
          event_notifications INTEGER NOT NULL DEFAULT 0,
          map_zoom_percent INTEGER NOT NULL DEFAULT 88,
          updated_at INTEGER NOT NULL DEFAULT 0
        )`).run();
        const preferenceColumns = await env.DB.prepare(`PRAGMA table_info(user_preferences)`).all();
        const preferenceColumnNames = new Set((preferenceColumns.results || []).map(column => column.name));
        // The table can predate the user timezone preference. CREATE TABLE IF NOT EXISTS
        // does not retrofit columns on existing installations, so migrate it in place.
        // Reconcile every column consumed by settings/event endpoints. CREATE TABLE IF
        // NOT EXISTS does not update an existing D1 table, so installations that
        // skipped an earlier migration otherwise fail with "no such column".
        const requiredPreferenceColumns = [
          ['default_theme', "TEXT NOT NULL DEFAULT 'vox'"],
          ['timezone', "TEXT NOT NULL DEFAULT 'UTC+3'"],
          ['all_notifications', 'INTEGER NOT NULL DEFAULT 1'],
          ['event_notifications', 'INTEGER NOT NULL DEFAULT 0'],
          ['map_zoom_percent', 'INTEGER NOT NULL DEFAULT 88'],
          ['updated_at', 'INTEGER NOT NULL DEFAULT 0'],
          ['map_zoom_global_updated_at', 'INTEGER NOT NULL DEFAULT 0'],
          ['theme_global_updated_at', 'INTEGER NOT NULL DEFAULT 0'],
        ];
        for (const [column, definition] of requiredPreferenceColumns) {
          if (preferenceColumnNames.has(column)) continue;
          try {
            await env.DB.prepare(`ALTER TABLE user_preferences ADD COLUMN ${column} ${definition}`).run();
          } catch (error) {
            // Concurrent cold isolates may apply the same additive migration.
            if (!String(error).toLowerCase().includes('duplicate column')) throw error;
          }
        }
        // Keep the legacy default_map column in place when present. It is no longer
        // read or written; preserving it avoids a destructive migration.
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_notification_preferences (
          telegram_id INTEGER NOT NULL,
          territory_id TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (telegram_id, territory_id)
        )`).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_territory_notification_preferences_territory ON territory_notification_preferences(territory_id)`).run();
        await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_preferences_deletion_lock_insert BEFORE INSERT ON user_preferences WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
        await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_preferences_deletion_lock_update BEFORE UPDATE ON user_preferences WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
        await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_notification_preferences_deletion_lock_insert BEFORE INSERT ON territory_notification_preferences WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
        await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_notification_preferences_deletion_lock_update BEFORE UPDATE ON territory_notification_preferences WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
      })().catch(error => { USER_PREFERENCE_TABLES_INIT_CACHE.delete(env); throw error; });
      USER_PREFERENCE_TABLES_INIT_CACHE.set(env, promise);
    }
    return promise;
  }

  const globalSettingsInitCache = new WeakMap();
  
  async function ensureGlobalSettingsTable(env) {
    let promise = GLOBAL_SETTINGS_INIT_CACHE.get(env);
    if (!promise) {
      promise = env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS theme_access_settings (
          theme_id TEXT PRIMARY KEY,
          visibility TEXT NOT NULL DEFAULT 'public',
          usernames_json TEXT NOT NULL DEFAULT '[]',
          updated_at INTEGER NOT NULL DEFAULT 0,
          updated_by INTEGER NOT NULL DEFAULT 0
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS global_setting_overrides (
          setting_key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER,
          updated_at INTEGER NOT NULL,
          updated_by INTEGER NOT NULL
        )`)
      ]).catch(error => {
        GLOBAL_SETTINGS_INIT_CACHE.delete(env);
        throw error;
      });
      GLOBAL_SETTINGS_INIT_CACHE.set(env, promise);
    }
    return promise;
  }

  const worldTableInitPromises = new WeakMap();

  async function ensureWorldTables(env) {
    const cached = worldTableInitPromises.get(env);
    if (cached) return cached;
    const promise = initializeWorldTables(env, {
      ensureManagerChangeTables,
      cleanupCustomizationCategories,
      ensureUserDirectoryTable,
    }).catch(error => {
      worldTableInitPromises.delete(env);
      throw error;
    });
    worldTableInitPromises.set(env, promise);
    return promise;
  }

  const recruitmentTableInitPromises = new WeakMap();
  const mapSettingsTableInitPromises = new WeakMap();

  async function ensureRecruitmentTable(env) {
    const cached = recruitmentTableInitPromises.get(env);
    if (cached) return cached;
    const promise = initializeRecruitmentTable(env).catch(error => {
      recruitmentTableInitPromises.delete(env);
      throw error;
    });
    recruitmentTableInitPromises.set(env, promise);
    return promise;
  }

  async function initializeRecruitmentTable(env) {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS voxygen_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    const versionRow = await env.DB.prepare(`SELECT value FROM voxygen_schema_meta WHERE key='recruitment_schema_version' LIMIT 1`).first();
    if (versionRow?.value === RECRUITMENT_SCHEMA_VERSION) return;

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS recruitment (
        territory_id TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
      )
    `).run();
    const recruitmentCols = await env.DB.prepare(`PRAGMA table_info(recruitment)`).all();
    const recruitmentNames = new Set((recruitmentCols.results||[]).map(r=>r.name));
    if(!recruitmentNames.has('contact_username')) {
      try {
        await env.DB.prepare(`ALTER TABLE recruitment ADD COLUMN contact_username TEXT`).run();
      } catch(error) {
        if(!String(error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
    await env.DB.prepare(`INSERT INTO voxygen_schema_meta(key,value,updated_at) VALUES('recruitment_schema_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(RECRUITMENT_SCHEMA_VERSION,Date.now()).run();
  }

  async function ensureMapSettingsTable(env) {
    const cached = mapSettingsTableInitPromises.get(env);
    if (cached) return cached;
    const promise = env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run().catch(error => {
      mapSettingsTableInitPromises.delete(env);
      throw error;
    });
    mapSettingsTableInitPromises.set(env, promise);
    return promise;
  }

  const eventTablesInitPromises = new WeakMap();

  async function initializeEventsTables(env) {
    await ensureWorldTables(env);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      territory_id TEXT,
      place TEXT NOT NULL DEFAULT '',
      event_at INTEGER NOT NULL,
      coords TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image_data TEXT,
      page_url TEXT,
      event_timezone TEXT NOT NULL DEFAULT 'UTC',
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`).run();
    const eventCols = await env.DB.prepare(`PRAGMA table_info(events)`).all();
    const eventColumnNames = new Set((eventCols.results || []).map(row => row.name));
    if (!eventColumnNames.has('event_timezone')) { try { await env.DB.prepare(`ALTER TABLE events ADD COLUMN event_timezone TEXT NOT NULL DEFAULT 'UTC'`).run(); } catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; } }
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_events_active_date ON events(active,event_at)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_events_date_cleanup ON events(event_at)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS event_reminders (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      telegram_id INTEGER NOT NULL,
      lead_value INTEGER NOT NULL,
      lead_unit TEXT NOT NULL DEFAULT 'minutes',
      remind_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      claim_token TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER,
      UNIQUE(event_id,telegram_id)
    )`).run();
    const reminderCols = await env.DB.prepare(`PRAGMA table_info(event_reminders)`).all();
    const reminderColumnNames = new Set((reminderCols.results || []).map(row => row.name));
    if (!reminderColumnNames.has('next_attempt_at')) {
      try { await env.DB.prepare(`ALTER TABLE event_reminders ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0`).run(); }
      catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
    }
    if (!reminderColumnNames.has('claim_token')) {
      try { await env.DB.prepare(`ALTER TABLE event_reminders ADD COLUMN claim_token TEXT`).run(); }
      catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
    }
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_event_reminders_retry_due ON event_reminders(status,next_attempt_at,remind_at)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS event_create_requests (
      telegram_id INTEGER NOT NULL,
      request_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      payload_hash TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(telegram_id,request_key)
    )`).run();
    const requestCols = await env.DB.prepare(`PRAGMA table_info(event_create_requests)`).all();
    const requestColumnNames = new Set((requestCols.results || []).map(row => row.name));
    if (!requestColumnNames.has('payload_hash')) {
      try { await env.DB.prepare(`ALTER TABLE event_create_requests ADD COLUMN payload_hash TEXT`).run(); }
      catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
    }
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_event_create_requests_created ON event_create_requests(created_at)`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_events_deletion_lock_insert BEFORE INSERT ON events WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.created_by) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_events_deletion_lock_update BEFORE UPDATE ON events WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.created_by OR telegram_id=NEW.created_by) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_event_reminders_deletion_lock_insert BEFORE INSERT ON event_reminders WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_event_reminders_deletion_lock_update BEFORE UPDATE ON event_reminders WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_event_create_requests_deletion_lock_insert BEFORE INSERT ON event_create_requests WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_event_create_requests_deletion_lock_update BEFORE UPDATE ON event_create_requests WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id) BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      update_id INTEGER NOT NULL UNIQUE,
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      actor_telegram_id INTEGER NOT NULL,
      target_telegram_id INTEGER,
      target_query TEXT NOT NULL,
      amount INTEGER NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      balance_after INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      note TEXT
    )`).run();
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_bank_transactions_deletion_lock_insert
      BEFORE INSERT ON bank_transactions WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.actor_telegram_id OR telegram_id=NEW.target_telegram_id)
      BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  }

  async function ensureEventsTables(env) {
    let promise = eventTablesInitPromises.get(env);
    if (!promise) {
      promise = initializeEventsTables(env).catch(error => {
        eventTablesInitPromises.delete(env);
        throw error;
      });
      eventTablesInitPromises.set(env, promise);
    }
    return promise;
  }

  return {
    ensureWorldTables,
    ensureManagerChangeTables,
    ensureRecruitmentTable,
    ensureMapSettingsTable,
    ensureApprovalSessionsTable,
    ensureUserPreferenceTables,
    ensureGlobalSettingsTable,
    ensureUserDirectoryTable,
    ensureEventsTables,
  };
}
