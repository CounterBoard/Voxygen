import { initializeWorldTables } from './migrations/world-schema.js';

const RECRUITMENT_SCHEMA_VERSION = '2026-10-v25';

export function createDatabaseInitialization({
  ensureManagerChangeTables,
  cleanupCustomizationCategories,
  ensureUserDirectoryTable,
} = {}) {
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

  return {
    ensureWorldTables,
    ensureRecruitmentTable,
    ensureMapSettingsTable,
  };
}
