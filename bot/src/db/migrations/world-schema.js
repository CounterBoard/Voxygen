const WORLD_SCHEMA_VERSION = '2026-11-v41';

export async function initializeWorldTables(env, {
  ensureManagerChangeTables,
  cleanupCustomizationCategories,
  ensureUserDirectoryTable,
} = {}) {
  // Schema migration and historical cleanup must not run on every cold Worker isolate.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS voxygen_schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const versionRow = await env.DB.prepare(`SELECT value FROM voxygen_schema_meta WHERE key='world_schema_version' LIMIT 1`).first();
  if (versionRow?.value === WORLD_SCHEMA_VERSION) return;

  // The app is upgraded in-place. This migration runs once per schema version, not on every launch.
  const territoryCols = await env.DB.prepare(`PRAGMA table_info(territories)`).all();
  const territoryNames = new Set((territoryCols.results || []).map(r => r.name));
  if (!territoryNames.has('is_government')) { try { await env.DB.prepare(`ALTER TABLE territories ADD COLUMN is_government INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!territoryNames.has('additional_info')) { try { await env.DB.prepare(`ALTER TABLE territories ADD COLUMN additional_info TEXT NOT NULL DEFAULT ''`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN xuid TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column') && !String(e).toLowerCase().includes('no such table')) throw e; }
  try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN skin_texture_id TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column') && !String(e).toLowerCase().includes('no such table')) throw e; }
  try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN skin_checked_at INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column') && !String(e).toLowerCase().includes('no such table')) throw e; }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pre_registered_users (
      id TEXT PRIMARY KEY,
      telegram_username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      mc_nickname TEXT NOT NULL,
      xuid TEXT,
      skin_texture_id TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pre_registered_username ON pre_registered_users(telegram_username COLLATE NOCASE)`).run();

  const customizationItemCols = await env.DB.prepare(`PRAGMA table_info(customization_items)`).all();
  const customizationItemNames = new Set((customizationItemCols.results || []).map(r => r.name));
  if (!customizationItemNames.has('government_marker')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN government_marker INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!customizationItemNames.has('hidden_from_users')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN hidden_from_users INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY, territory_id TEXT NOT NULL, telegram_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'user', integrity REAL NOT NULL, comfort REAL NOT NULL, atmosphere REAL NOT NULL, detail REAL NOT NULL, created_at INTEGER NOT NULL, UNIQUE (territory_id, telegram_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, territory_id TEXT NOT NULL, telegram_id INTEGER NOT NULL, telegram_username TEXT, text TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, territory_id TEXT NOT NULL, telegram_id INTEGER NOT NULL, telegram_username TEXT, file_id TEXT NOT NULL, file_unique_id TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, moderated_by INTEGER, moderated_at INTEGER)`).run();
  const reviewCols = await env.DB.prepare(`PRAGMA table_info(ratings)`).all();
  const reviewNames = new Set((reviewCols.results || []).map(r => r.name));
  if (!reviewNames.has('role')) { try { await env.DB.prepare(`ALTER TABLE ratings ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inspector_ratings (id TEXT PRIMARY KEY, territory_id TEXT NOT NULL, telegram_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'inspector', integrity REAL NOT NULL, comfort REAL NOT NULL, atmosphere REAL NOT NULL, detail REAL NOT NULL, created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO inspector_ratings (id,territory_id,telegram_id,role,integrity,comfort,atmosphere,detail,created_at) SELECT id,territory_id,telegram_id,role,integrity,comfort,atmosphere,detail,created_at FROM ratings WHERE role IN ('inspector','main_inspector')`).run();
  await env.DB.prepare(`DELETE FROM ratings WHERE role IN ('inspector','main_inspector')`).run();
  await env.DB.prepare(`
    DELETE FROM inspector_ratings
    WHERE id IN (
      SELECT old.id
      FROM inspector_ratings old
      JOIN inspector_ratings newer
        ON newer.territory_id=old.territory_id
       AND newer.telegram_id=old.telegram_id
       AND (newer.created_at>old.created_at OR (newer.created_at=old.created_at AND newer.id>old.id))
    )
  `).run().catch(error=>console.error('Inspector rating dedupe error:',error));
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inspector_ratings_territory_user ON inspector_ratings(territory_id,telegram_id)`).run();
  try { await env.DB.prepare(`ALTER TABLE comments ADD COLUMN author_mc_nickname TEXT`).run(); } catch(e) { if(!String(e).toLowerCase().includes('duplicate column') && !String(e).toLowerCase().includes('no such table')) throw e; }
  try { await env.DB.prepare(`ALTER TABLE screenshots ADD COLUMN author_mc_nickname TEXT`).run(); } catch(e) { if(!String(e).toLowerCase().includes('duplicate column') && !String(e).toLowerCase().includes('no such table')) throw e; }
  try { await env.DB.prepare(`UPDATE comments SET author_mc_nickname=(SELECT mc_nickname FROM users u WHERE u.telegram_id=comments.telegram_id) WHERE author_mc_nickname IS NULL AND telegram_id IS NOT NULL`).run(); } catch(e) { console.error('Backfill comment author nickname error:',e); }
  try { await env.DB.prepare(`UPDATE screenshots SET author_mc_nickname=(SELECT mc_nickname FROM users u WHERE u.telegram_id=screenshots.telegram_id) WHERE author_mc_nickname IS NULL AND telegram_id IS NOT NULL`).run(); } catch(e) { console.error('Backfill screenshot author nickname error:',e); }
  const commentCols = await env.DB.prepare(`PRAGMA table_info(comments)`).all();
  const commentNames = new Set((commentCols.results || []).map(r => r.name));
  if (!commentNames.has('role')) { try { await env.DB.prepare(`ALTER TABLE comments ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  const screenshotCols = await env.DB.prepare(`PRAGMA table_info(screenshots)`).all();
  const screenshotNames = new Set((screenshotCols.results || []).map(r => r.name));
  if (!screenshotNames.has('image_data')) { try { await env.DB.prepare(`ALTER TABLE screenshots ADD COLUMN image_data TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!screenshotNames.has('file_unique_id')) { try { await env.DB.prepare(`ALTER TABLE screenshots ADD COLUMN file_unique_id TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!screenshotNames.has('moderated_by')) { try { await env.DB.prepare(`ALTER TABLE screenshots ADD COLUMN moderated_by INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!screenshotNames.has('moderated_at')) { try { await env.DB.prepare(`ALTER TABLE screenshots ADD COLUMN moderated_at INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_memberships (
      telegram_id INTEGER NOT NULL,
      territory_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (telegram_id, territory_id),
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )
  `).run();
  // Migrate the old single-city membership table to the composite key used for multi-city residents.
  const membershipInfo = await env.DB.prepare(`PRAGMA table_info(city_memberships)`).all();
  const membershipPk = (membershipInfo.results||[]).filter(r=>Number(r.pk||0)>0).sort((a,b)=>Number(a.pk)-Number(b.pk));
  if(membershipPk.length===1 && membershipPk[0].name==='telegram_id'){
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS city_memberships_multi (
      telegram_id INTEGER NOT NULL,
      territory_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (telegram_id, territory_id),
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )`).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO city_memberships_multi(telegram_id,territory_id,joined_at) SELECT telegram_id,territory_id,joined_at FROM city_memberships`).run();
    await env.DB.prepare(`DROP TABLE city_memberships`).run();
    await env.DB.prepare(`ALTER TABLE city_memberships_multi RENAME TO city_memberships`).run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS territory_managers (
    territory_id TEXT NOT NULL,
    telegram_id INTEGER NOT NULL,
    granted_by INTEGER NOT NULL,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (territory_id, telegram_id),
    FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
  )`).run();
  await ensureManagerChangeTables(env);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_invites (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      target_telegram_id INTEGER,
      target_nickname TEXT NOT NULL,
      invited_by INTEGER NOT NULL,
      invite_type TEXT NOT NULL DEFAULT 'join',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      responded_at INTEGER,
      notification_sent_at INTEGER,
      notification_claimed_at INTEGER
    )
  `).run();
  const cityInviteCols = await env.DB.prepare(`PRAGMA table_info(city_invites)`).all();
  const cityInviteColumnNames = new Set((cityInviteCols.results || []).map(row => row.name));
  if (!cityInviteColumnNames.has('notification_sent_at')) {
    try { await env.DB.prepare(`ALTER TABLE city_invites ADD COLUMN notification_sent_at INTEGER`).run(); }
    catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
  }
  if (!cityInviteColumnNames.has('notification_claimed_at')) {
    try { await env.DB.prepare(`ALTER TABLE city_invites ADD COLUMN notification_claimed_at INTEGER`).run(); }
    catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
  }
  // Existing duplicate pending invitations are normalized before unique indexes are added.
  await env.DB.prepare(`UPDATE city_invites AS duplicate
    SET status='cancelled',responded_at=COALESCE(responded_at,?)
    WHERE duplicate.status='pending' AND duplicate.target_telegram_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM city_invites AS keeper
        WHERE keeper.status='pending' AND keeper.territory_id=duplicate.territory_id
          AND keeper.target_telegram_id=duplicate.target_telegram_id
          AND (keeper.created_at<duplicate.created_at OR (keeper.created_at=duplicate.created_at AND keeper.id<duplicate.id))
      )`).bind(Date.now()).run();
  await env.DB.prepare(`UPDATE city_invites AS duplicate
    SET status='cancelled',responded_at=COALESCE(responded_at,?)
    WHERE duplicate.status='pending' AND duplicate.target_telegram_id IS NULL
      AND EXISTS (
        SELECT 1 FROM city_invites AS keeper
        WHERE keeper.status='pending' AND keeper.territory_id=duplicate.territory_id
          AND keeper.target_telegram_id IS NULL
          AND lower(keeper.target_nickname)=lower(duplicate.target_nickname)
          AND (keeper.created_at<duplicate.created_at OR (keeper.created_at=duplicate.created_at AND keeper.id<duplicate.id))
      )`).bind(Date.now()).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_city_invites_pending_user_unique
    ON city_invites(territory_id,target_telegram_id)
    WHERE status='pending' AND target_telegram_id IS NOT NULL`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_city_invites_pending_nickname_unique
    ON city_invites(territory_id,lower(target_nickname))
    WHERE status='pending' AND target_telegram_id IS NULL`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customization_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customization_items (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      image_data TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_currency (
      telegram_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_treasury (
      territory_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )
  `).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS financial_operations (
    operation_id TEXT PRIMARY KEY,
    telegram_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_financial_operations_user_created ON financial_operations(telegram_id,created_at)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS customization_discounts (
    item_id TEXT PRIMARY KEY, percent INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, updated_by_telegram_id INTEGER
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customization_discounts_expires ON customization_discounts(expires_at)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS visual_discount_operations (
    update_id INTEGER PRIMARY KEY, actor_telegram_id INTEGER NOT NULL, mode TEXT NOT NULL,
    target_summary TEXT NOT NULL, percent INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS territory_awards (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      emoji TEXT NOT NULL,
      awarded_by_telegram_id INTEGER NOT NULL,
      awarded_at INTEGER NOT NULL,
      slot_index INTEGER,
      UNIQUE(territory_id,name_key),
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_territory_awards_slots ON territory_awards(territory_id,slot_index)`).run();
  const awardCols = await env.DB.prepare(`PRAGMA table_info(territory_awards)`).all();
  const awardColNames = new Set((awardCols.results || []).map(row => row.name));
  const awardExtraCols = [
    ['sticker_file_id', 'TEXT'],
    ['sticker_file_unique_id', 'TEXT'],
    ['sticker_format', 'TEXT'],
    ['sticker_thumbnail_file_id', 'TEXT'],
    ['sticker_set_name', 'TEXT'],
    ['custom_emoji_id', 'TEXT'],
  ];
  for (const [column, type] of awardExtraCols) {
    if (!awardColNames.has(column)) {
      try { await env.DB.prepare(`ALTER TABLE territory_awards ADD COLUMN ${column} ${type}`).run(); }
      catch (error) { if (!String(error).toLowerCase().includes('duplicate column')) throw error; }
    }
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS telegram_award_packs (
    id TEXT PRIMARY KEY,
    set_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    title TEXT NOT NULL,
    added_by_telegram_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS telegram_award_pack_stickers (
    id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_unique_id TEXT NOT NULL,
    emoji TEXT,
    custom_emoji_id TEXT,
    format TEXT NOT NULL,
    thumbnail_file_id TEXT,
    width INTEGER,
    height INTEGER,
    UNIQUE(pack_id,file_unique_id),
    FOREIGN KEY (pack_id) REFERENCES telegram_award_packs(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_telegram_award_pack_stickers_pack ON telegram_award_pack_stickers(pack_id)`).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_items (
      telegram_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'purchase',
      PRIMARY KEY (telegram_id, item_id)
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_customization (
      territory_id TEXT PRIMARY KEY,
      marker_item_id TEXT,
      banner_color TEXT NOT NULL DEFAULT 'none',
      banner_gradient TEXT NOT NULL DEFAULT 'aurora',
      effects_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    )
  `).run();
  const cityCustomizationCols = await env.DB.prepare(`PRAGMA table_info(city_customization)`).all();
  const cityCustomizationNames = new Set((cityCustomizationCols.results || []).map(r => r.name));
  if (!cityCustomizationNames.has('banner_color')) { try { await env.DB.prepare(`ALTER TABLE city_customization ADD COLUMN banner_color TEXT NOT NULL DEFAULT 'none'`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!cityCustomizationNames.has('banner_gradient')) { try { await env.DB.prepare(`ALTER TABLE city_customization ADD COLUMN banner_gradient TEXT NOT NULL DEFAULT 'aurora'`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS comment_replies (
      comment_id TEXT PRIMARY KEY,
      telegram_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_items (
      territory_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'achievement',
      PRIMARY KEY (territory_id, item_id),
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES customization_items(id) ON DELETE CASCADE
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_city_items_territory ON city_items(territory_id)`).run();
  await env.DB.prepare(`UPDATE vox_grid SET state='' WHERE state='?' AND COALESCE(updated_by,0)=0`).run().catch(()=>{});
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS vox_grid (
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      updated_by INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (row_index, col_index)
    )
  `).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_city_memberships_territory ON city_memberships(territory_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_city_invites_target ON city_invites(target_telegram_id, status)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_city_invites_city ON city_invites(territory_id, status)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_customization_items_category ON customization_items(category_id, active)`).run();
  const itemCols = await env.DB.prepare(`PRAGMA table_info(customization_items)`).all();
  const colNames = new Set((itemCols.results || []).map(r => r.name));
  if (!colNames.has('categories_text')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN categories_text TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('color')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN color TEXT NOT NULL DEFAULT 'white'`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('sort_order')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_enabled')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_enabled INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_residents')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_residents INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_gems')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_gems INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_inspector_score')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_inspector_score REAL`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_player_score')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_player_score REAL`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_screenshots')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_screenshots INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_comments')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_comments INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  if (!colNames.has('achievement_visuals')) { try { await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN achievement_visuals INTEGER`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gem_spend_log (
    id TEXT PRIMARY KEY,
    territory_id TEXT NOT NULL,
    telegram_id INTEGER NOT NULL,
    item_id TEXT,
    amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS achievement_awards (
    territory_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    awarded_at INTEGER NOT NULL,
    PRIMARY KEY (territory_id,item_id)
  )`).run();
  const catCols = await env.DB.prepare(`PRAGMA table_info(customization_categories)`).all();
  const catNames = new Set((catCols.results || []).map(r => r.name));
  if (!catNames.has('sort_order')) { try { await env.DB.prepare(`ALTER TABLE customization_categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }

  // Remove legacy built-in flags created by older versions. Flags/marks are now ordinary visuals
  // created by the main inspector, so no default item is injected by the backend.
  const legacyMarkerIds=['default-marker-black','default-marker-brown','default-marker-white'];
  const legacyPh=legacyMarkerIds.map(()=>'?').join(',');
  await env.DB.prepare(`DELETE FROM city_items WHERE item_id IN (${legacyPh})`).bind(...legacyMarkerIds).run().catch(()=>{});
  await env.DB.prepare(`DELETE FROM user_items WHERE item_id IN (${legacyPh})`).bind(...legacyMarkerIds).run().catch(()=>{});
  await env.DB.prepare(`DELETE FROM achievement_awards WHERE item_id IN (${legacyPh})`).bind(...legacyMarkerIds).run().catch(()=>{});
  await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL WHERE marker_item_id IN (${legacyPh})`).bind(...legacyMarkerIds).run().catch(()=>{});
  await env.DB.prepare(`DELETE FROM customization_items WHERE id IN (${legacyPh})`).bind(...legacyMarkerIds).run().catch(()=>{});
  await cleanupCustomizationCategories(env).catch(error => console.error('Customization tag cleanup error:',error));

  // The account directory is also protected: list synchronization and administrative flows must not recreate it during deletion.
  await ensureUserDirectoryTable(env);

  // Ensure the role table exists before installing its deletion-lock triggers.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inspectors (
    telegram_id INTEGER PRIMARY KEY,
    telegram_username TEXT,
    added_by INTEGER,
    created_at INTEGER NOT NULL
  )`).run();

  // Durable account-removal barrier: relational writes cannot resurrect an account while cleanup is running.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_deletion_locks (
    telegram_id INTEGER PRIMARY KEY,
    locked_at INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT 'managed_delete'
  )`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_directory_deletion_lock_insert
    BEFORE INSERT ON user_directory WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_directory_deletion_lock_update
    BEFORE UPDATE ON user_directory WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_inspectors_deletion_lock_insert
    BEFORE INSERT ON inspectors WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_inspectors_deletion_lock_update
    BEFORE UPDATE ON inspectors WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_users_deletion_lock_insert
    BEFORE INSERT ON users WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_users_deletion_lock_update
    BEFORE UPDATE ON users WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_city_memberships_deletion_lock_insert
    BEFORE INSERT ON city_memberships WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_city_memberships_deletion_lock_update
    BEFORE UPDATE OF telegram_id ON city_memberships WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_managers_deletion_lock_insert
    BEFORE INSERT ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_managers_deletion_lock_update
    BEFORE UPDATE OF telegram_id ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territories_deletion_lock_owner
    BEFORE UPDATE OF owner_telegram_id ON territories WHEN NEW.owner_telegram_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.owner_telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_currency_deletion_lock_insert
    BEFORE INSERT ON user_currency WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_currency_deletion_lock_update
    BEFORE UPDATE ON user_currency WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_items_deletion_lock_insert
    BEFORE INSERT ON user_items WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_user_items_deletion_lock_update
    BEFORE UPDATE ON user_items WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_financial_operations_deletion_lock_insert
    BEFORE INSERT ON financial_operations WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_financial_operations_deletion_lock_update
    BEFORE UPDATE ON financial_operations WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_city_invites_deletion_lock_insert_v36
    BEFORE INSERT ON city_invites WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.target_telegram_id OR telegram_id=NEW.invited_by)
      OR EXISTS(SELECT 1 FROM users u JOIN account_deletion_locks l ON l.telegram_id=u.telegram_id WHERE lower(u.mc_nickname)=lower(NEW.target_nickname))
      OR EXISTS(SELECT 1 FROM user_directory d JOIN account_deletion_locks l ON l.telegram_id=d.telegram_id WHERE lower(d.mc_nickname)=lower(NEW.target_nickname))
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_city_invites_deletion_lock_identity_update_v36
    BEFORE UPDATE OF target_telegram_id,invited_by,target_nickname ON city_invites WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.target_telegram_id OR telegram_id=NEW.target_telegram_id OR telegram_id=OLD.invited_by OR telegram_id=NEW.invited_by)
      OR EXISTS(SELECT 1 FROM users u JOIN account_deletion_locks l ON l.telegram_id=u.telegram_id WHERE lower(u.mc_nickname) IN (lower(OLD.target_nickname),lower(NEW.target_nickname)))
      OR EXISTS(SELECT 1 FROM user_directory d JOIN account_deletion_locks l ON l.telegram_id=d.telegram_id WHERE lower(d.mc_nickname) IN (lower(OLD.target_nickname),lower(NEW.target_nickname)))
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_requests_deletion_lock_insert
    BEFORE INSERT ON territories WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.requested_by_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_requests_deletion_lock_update
    BEFORE UPDATE OF requested_by_id ON territories WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.requested_by_id OR telegram_id=NEW.requested_by_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_ratings_deletion_lock_insert
    BEFORE INSERT ON ratings WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_comments_deletion_lock_insert
    BEFORE INSERT ON comments WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_screenshots_deletion_lock_insert
    BEFORE INSERT ON screenshots WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_gem_spend_log_deletion_lock_insert
    BEFORE INSERT ON gem_spend_log WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_gem_spend_log_deletion_lock_update
    BEFORE UPDATE OF telegram_id ON gem_spend_log WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_inspector_ratings_deletion_lock_insert
    BEFORE INSERT ON inspector_ratings WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_comment_replies_deletion_lock_insert
    BEFORE INSERT ON comment_replies WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_city_memberships_deletion_lock_update_all_v31
    BEFORE UPDATE ON city_memberships WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_managers_deletion_lock_update_all_v31
    BEFORE UPDATE ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_manager_granter_deletion_lock_insert
    BEFORE INSERT ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.granted_by)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS guard_territory_manager_granter_deletion_lock_update
    BEFORE UPDATE OF granted_by ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.granted_by OR telegram_id=NEW.granted_by)
    BEGIN SELECT RAISE(ABORT,'account deletion in progress'); END`).run();

  // Indexes used by the most common initial-screen and detail queries.
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_territories_status_created_at ON territories(status,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_territory_created_at ON comments(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_screenshots_territory_status_created_at ON screenshots(territory_id,status,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ratings_territory_created_at ON ratings(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inspector_ratings_territory_created_at ON inspector_ratings(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`INSERT INTO voxygen_schema_meta(key,value,updated_at) VALUES('world_schema_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(WORLD_SCHEMA_VERSION,Date.now()).run();
}
