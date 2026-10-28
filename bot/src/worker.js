// Voxygen-Version: v29
// ============================================================
// VOXYGEN BACKEND
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

const TELEGRAM_API = "https://api.telegram.org";
const EVENT_TABLES_INIT_CACHE = new WeakMap();

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "X-Request-ID, Server-Timing");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data, status = 200) {
  // Never expose raw SQL/runtime details to Mini App clients. Detailed context is
  // kept in structured server logs and correlated with X-Request-ID.
  let safeData = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    safeData = { ...data };
    delete safeData.details;
    if (safeData.ok === false && !safeData.code) {
      safeData.code = status === 400 ? "INVALID_INPUT"
        : status === 401 ? "AUTHENTICATION_REQUIRED"
        : status === 403 ? "FORBIDDEN"
        : status === 404 ? "NOT_FOUND"
        : status === 409 ? "CONFLICT"
        : status === 413 ? "PAYLOAD_TOO_LARGE"
        : status === 429 ? "RATE_LIMITED"
        : status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED";
    }
  }
  return withCors(new Response(JSON.stringify(safeData), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function stripMinecraftFormatting(value) {
  return String(value ?? '')
    .replace(/§x(?:§[0-9a-fA-F]){6}/gi, '')
    .replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fA-Fk-oK-OrR])/g, '');
}

function formatTerritoryCoords(raw) {
  const value=String(raw??'').trim().replace(/−/g,'-');
  const parsed=parseRequestCoords(value);
  if(parsed)return `${parsed.x} / ${parsed.z}`;
  return value||'Координаты не указаны';
}

function parseRequestCoords(raw) {
  const s = String(raw || "").trim().replace(/−/g, "-");
  let m = s.match(/X\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:\/|,|;|\s+)\s*Z\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  if (!m) m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(?:[,;\/]|\s+)\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const x = Number(String(m[1]).replace(",", "."));
  const z = Number(String(m[2]).replace(",", "."));
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

async function telegram(env, method, payload) {
  const token = String(env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("BOT_TOKEN is not configured");
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return { response, data };
}

async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    if (!receivedHash) return null;
    params.delete("hash");

    const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
    const encoder = new TextEncoder();

    const webAppDataKey = await crypto.subtle.importKey(
      "raw", encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const secretKeyBytes = await crypto.subtle.sign(
      "HMAC", webAppDataKey, encoder.encode(botToken)
    );
    const secretKey = await crypto.subtle.importKey(
      "raw", secretKeyBytes,
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC", secretKey, encoder.encode(dataCheckString)
    );
    const calculatedHash = [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");

    if (calculatedHash !== receivedHash) return null;
    const userJson = params.get("user");
    if (!userJson) return null;
    return JSON.parse(userJson);
  } catch (error) {
    console.error("verifyInitData error:", error);
    return null;
  }
}

async function getCurrentUser(request, env) {
  let body = null;
  try { body = await request.clone().json(); } catch {}
  const initData = String(
    body?.initData ||
    request.headers.get("X-Telegram-Init-Data") ||
    new URL(request.url).searchParams.get("initData") ||
    ""
  ).trim();

  const user = await verifyInitData(initData, String(env.BOT_TOKEN || "").trim());
  if (!user) return null;
  return { ...user, initData };
}

function parseTwoCoordinates(raw) {
  const s = String(raw || '').trim().replace(/−/g, '-');
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const x = Number(String(m[1]).replace(',', '.'));
  const z = Number(String(m[2]).replace(',', '.'));
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function normalizeUsername(username) {
  const value = String(username || "").trim().replace(/^@+/, "");
  return value ? `@${value}` : "";
}

async function getRoleByTelegramId(env, telegramId, telegramUsername = "") {
  const id = String(telegramId);
  const username = String(telegramUsername || "").replace(/^@+/, "").trim().toLowerCase();
  const main = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (main && (id === main || (!/^[-]?\d+$/.test(main) && main.replace(/^@+/, "").toLowerCase() === username))) return "main_inspector";

  const row = await env.DB.prepare(
    "SELECT telegram_id FROM inspectors WHERE telegram_id = ?"
  ).bind(Number(telegramId)).first();

  return row ? "inspector" : "user";
}

async function requireUser(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  return { user };
}

async function requireVerifiedUser(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  const row = await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,status,xuid,skin_texture_id FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first();
  if (row?.status !== 'verified' || !String(row?.mc_nickname || '').trim()) {
    return { error: json({ ok:false, error:'Для этого действия нужен подтверждённый никнейм Minecraft' },403) };
  }
  return { user:auth.user, profile:row };
}

async function requireMainInspector(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  const main = String(env.INSPECTOR_CHAT_ID || "").trim();
  const userName = String(auth.user.username || "").replace(/^@+/, "").trim().toLowerCase();
  const mainName = main.replace(/^@+/, "").trim().toLowerCase();
  const allowed = main && (String(auth.user.id) === main || (!/^[-]?\d+$/.test(main) && mainName === userName));
  if (!allowed) {
    return { error: json({ ok: false, error: "Forbidden" }, 403) };
  }
  return auth;
}

async function isInspector(env, telegramId) {
  const role = await getRoleByTelegramId(env, telegramId);
  return role === "inspector" || role === "main_inspector";
}

async function isTerritoryManager(env, territoryId, telegramId) {
  const tid=String(territoryId||'').trim(), uid=Number(telegramId||0);
  if(!tid||!uid)return false;
  const owner=await env.DB.prepare(`SELECT 1 FROM territories WHERE id=? AND status='approved' AND owner_telegram_id=? LIMIT 1`).bind(tid,uid).first();
  if(owner)return true;
  const manager=await env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(tid,uid).first();
  return !!manager;
}

async function getTerritoryManagerRows(env, territoryId) {
  const tid=String(territoryId||'').trim();
  if(!tid)return [];
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(tid).first();
  if(!territory)return [];
  const rows=await env.DB.prepare(`
    SELECT tm.telegram_id,tm.granted_by,tm.granted_at,u.telegram_username,u.mc_nickname,u.xuid,u.skin_texture_id
    FROM territory_managers tm LEFT JOIN users u ON u.telegram_id=tm.telegram_id
    WHERE tm.territory_id=? ORDER BY tm.granted_at ASC
  `).bind(tid).all();
  const result=[];
  if(territory.owner_telegram_id){
    const owner=await env.DB.prepare(`SELECT telegram_username,mc_nickname,xuid,skin_texture_id FROM users WHERE telegram_id=?`).bind(Number(territory.owner_telegram_id)).first();
    result.push({telegram_id:Number(territory.owner_telegram_id),telegram_username:owner?.telegram_username||territory.owner_telegram_username||null,mc_nickname:owner?.mc_nickname||null,xuid:owner?.xuid||null,skin_texture_id:owner?.skin_texture_id||null,skin_url:skinUrlFromTexture(owner?.skin_texture_id,owner?.mc_nickname),role:'founder'});
  }
  for(const r of rows.results||[]) if(!result.some(x=>String(x.telegram_id)===String(r.telegram_id))) result.push({...r,skin_url:skinUrlFromTexture(r.skin_texture_id,r.mc_nickname),role:'founder'});
  return result;
}

async function notifyTerritoryManagers(env, territoryId, text, excludeId = null, options = {}) {
  const managers=await getTerritoryManagerRows(env, territoryId);
  for(const manager of managers){
    if(excludeId!==null && excludeId!==undefined && String(manager.telegram_id)===String(excludeId)) continue;
    try { await telegram(env,'sendMessage',{chat_id:Number(manager.telegram_id),text,parse_mode:options.parse_mode||'HTML',reply_markup:options.reply_markup}); }
    catch(error){ console.error('Territory manager notification error:',territoryId,manager.telegram_id,error); }
  }
}

async function ensureManagerChangeTables(env) {
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
    decided_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS manager_change_votes (
    request_id TEXT NOT NULL,
    voter_telegram_id INTEGER NOT NULL,
    approve INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (request_id,voter_telegram_id)
  )`).run();
}

// v9: active territorial rights are derived only from the current Telegram ID; identity transfers must move owner/manager/currency relations atomically.
async function getTreasuryManagerCities(env, telegramId) {
  const uid=Number(telegramId||0); if(!uid)return [];
  const rows=await env.DB.prepare(`
    SELECT t.id,t.name FROM territories t
    WHERE t.status='approved' AND (t.owner_telegram_id=? OR EXISTS(SELECT 1 FROM territory_managers tm WHERE tm.territory_id=t.id AND tm.telegram_id=?))
    ORDER BY t.created_at ASC
  `).bind(uid,uid).all();
  return rows.results||[];
}

const RECRUITMENT_SCHEMA_VERSION = '2026-10-v25';
const recruitmentTableInitPromises = new WeakMap();
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
  if(!recruitmentNames.has('contact_username')) { try { await env.DB.prepare(`ALTER TABLE recruitment ADD COLUMN contact_username TEXT`).run(); } catch(e) { if(!String(e).toLowerCase().includes('duplicate column')) throw e; } }
  await env.DB.prepare(`INSERT INTO voxygen_schema_meta(key,value,updated_at) VALUES('recruitment_schema_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(RECRUITMENT_SCHEMA_VERSION,Date.now()).run();
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
}

const mapSettingsTableInitPromises = new WeakMap();
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

const WORLD_SCHEMA_VERSION = '2026-10-v25';
const worldTableInitPromises = new WeakMap();

async function ensureWorldTables(env) {
  const cached = worldTableInitPromises.get(env);
  if (cached) return cached;
  const promise = initializeWorldTables(env).catch(error => {
    worldTableInitPromises.delete(env);
    throw error;
  });
  worldTableInitPromises.set(env, promise);
  return promise;
}

const mapSettingsCache = new WeakMap();
const MAP_SETTINGS_CACHE_TTL_MS = 30_000;

async function getMapSettings(request, env) {
  const startedAt = Date.now();
  try {
    const now = Date.now();
    let cached = mapSettingsCache.get(env);
    if (!cached || now - cached.fetchedAt >= MAP_SETTINGS_CACHE_TTL_MS) {
      await ensureMapSettingsTable(env);
      const result = await env.DB.prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('vox_map_image','jorick_map_image')"
      ).all();
      const rows = result?.results || [];
      cached = {
        vox: rows.find(x => x.key === 'vox_map_image')?.value || null,
        jorick: rows.find(x => x.key === 'jorick_map_image')?.value || null,
        fetchedAt: Date.now(),
      };
      mapSettingsCache.set(env, cached);
    }
    const requestedType = new URL(request.url).searchParams.get('type');
    let payload;
    if (requestedType === 'vox' || requestedType === 'jorick') {
      payload = { ok: true, mapType: requestedType, mapImage: requestedType === 'jorick' ? cached.jorick : cached.vox };
    } else {
      payload = { ok: true, mapImage: cached.vox, jorickMapImage: cached.jorick };
    }
    const response = json(payload);
    // These are public map assets; a short browser cache avoids repeatedly downloading large Base64 JSON.
    response.headers.set('Cache-Control', 'public, max-age=30');
    response.headers.set('Server-Timing', `map-settings;dur=${Math.max(0, Date.now() - startedAt)}`);
    return response;
  } catch (error) {
    console.error("GET map settings error:", error);
    const response = json({ ok: false, error: "Database error", details: String(error) }, 500);
    response.headers.set('Server-Timing', `map-settings;dur=${Math.max(0, Date.now() - startedAt)}`);
    return response;
  }
}

async function saveMapSettings(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const mapImage = String(body?.mapImage || "").trim();
  const mapType = String(body?.mapType || 'vox').toLowerCase() === 'jorick' ? 'jorick' : 'vox';
  const mapKey = mapType === 'jorick' ? 'jorick_map_image' : 'vox_map_image';
  if (!mapImage.startsWith("data:image/")) {
    return json({ ok: false, error: "Invalid map image" }, 400);
  }
  if (mapImage.length > 4_500_000) {
    return json({ ok: false, error: "Map image is too large" }, 413);
  }

  try {
    await ensureMapSettingsTable(env);
    await env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(mapKey, mapImage, Date.now()).run();
    mapSettingsCache.delete(env);
    return json({ ok: true, mapType });
  } catch (error) {
    console.error("SAVE map settings error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}


async function initializeWorldTables(env) {
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
      responded_at INTEGER
    )
  `).run();
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
      background_item_id TEXT,
      effects_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    )
  `).run();
  const cityCustomizationCols = await env.DB.prepare(`PRAGMA table_info(city_customization)`).all();
  const cityCustomizationNames = new Set((cityCustomizationCols.results || []).map(r => r.name));
  if (!cityCustomizationNames.has('background_item_id')) { try { await env.DB.prepare(`ALTER TABLE city_customization ADD COLUMN background_item_id TEXT`).run(); } catch (e) { if (!String(e).toLowerCase().includes('duplicate column')) throw e; } }
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

  // Indexes used by the most common initial-screen and detail queries.
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_territories_status_created_at ON territories(status,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_territory_created_at ON comments(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_screenshots_territory_status_created_at ON screenshots(territory_id,status,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ratings_territory_created_at ON ratings(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inspector_ratings_territory_created_at ON inspector_ratings(territory_id,created_at DESC)`).run();
  await env.DB.prepare(`INSERT INTO voxygen_schema_meta(key,value,updated_at) VALUES('world_schema_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(WORLD_SCHEMA_VERSION,Date.now()).run();
}

function visualHasTag(row, target) {
  const wanted = String(target || '').trim().toLocaleLowerCase('ru-RU');
  const fields = [row?.category_name, row?.categories_text];
  return fields.some(value => String(value || '').split(',').map(x => x.trim()).some(tag => tag.toLocaleLowerCase('ru-RU') === wanted));
}

async function ensureFirstCityMarker(env, territoryId) {
  const id = String(territoryId || '').trim();
  if (!id) return null;

  const territory = await env.DB.prepare(`SELECT id,is_government FROM territories WHERE id=? AND status='approved'`).bind(id).first();
  if (!territory) return null;
  const isGovernment = Number(territory.is_government || 0) === 1;
  const current = await env.DB.prepare(`SELECT marker_item_id,background_item_id FROM city_customization WHERE territory_id=?`).bind(id).first();

  const managers = await getTerritoryManagerRows(env, id);
  const managerIds = managers.map(m => Number(m.telegram_id)).filter(Boolean);
  const members = await env.DB.prepare(`SELECT telegram_id FROM city_memberships WHERE territory_id=?`).bind(id).all();
  const ids = [...new Set([...managerIds, ...(members.results || []).map(m => Number(m.telegram_id)).filter(Boolean)])];
  const ph = ids.length ? ids.map(() => '?').join(',') : 'NULL';

  if (current?.marker_item_id) {
    const active = await env.DB.prepare(`
      SELECT i.id,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
      FROM customization_items i
      LEFT JOIN customization_categories c ON c.id=i.category_id
      WHERE i.id=? AND i.active=1
    `).bind(current.marker_item_id).first();
    const markerTypeMatches = active && (isGovernment
      ? Number(active.government_marker || 0) === 1
      : Number(active.government_marker || 0) !== 1);

    if (active && markerTypeMatches && visualHasTag(active, 'метка')) {
      if (isGovernment) return active;
      const [cityOwned, residentOwned] = await Promise.all([
        env.DB.prepare(`SELECT 1 AS owned FROM city_items WHERE territory_id=? AND item_id=? LIMIT 1`).bind(id, current.marker_item_id).first(),
        ids.length
          ? env.DB.prepare(`SELECT 1 AS owned FROM user_items WHERE item_id=? AND telegram_id IN (${ph}) LIMIT 1`).bind(current.marker_item_id, ...ids).first()
          : Promise.resolve(null),
      ]);
      if (cityOwned || residentOwned) return active;
    }
    // Do not leave a city equipped with an inactive, mismatched, or no-longer-accessible visual.
    await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE territory_id=?`).bind(Date.now(), id).run();
  }

  // Government territories use only the visuals explicitly marked for government use.
  // syncGovernmentVisual assigns those automatically; never borrow a regular resident's marker.
  if (isGovernment) return null;

  const [cityItems, userItems] = await Promise.all([
    env.DB.prepare(`
      SELECT ci.item_id,ci.acquired_at,i.sort_order,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
      FROM city_items ci
      JOIN customization_items i ON i.id=ci.item_id
      LEFT JOIN customization_categories c ON c.id=i.category_id
      WHERE ci.territory_id=? AND i.active=1 AND COALESCE(i.government_marker,0)=0
    `).bind(id).all(),
    env.DB.prepare(`
      SELECT ui.item_id,ui.acquired_at,i.sort_order,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
      FROM user_items ui
      JOIN customization_items i ON i.id=ui.item_id
      LEFT JOIN customization_categories c ON c.id=i.category_id
      WHERE ui.telegram_id IN (${ph}) AND i.active=1 AND COALESCE(i.government_marker,0)=0
    `).bind(...ids).all(),
  ]);

  const candidates = [...(cityItems.results || []), ...(userItems.results || [])]
    .filter(row => visualHasTag(row, 'метка'))
    .sort((a,b) => Number(a.acquired_at||0)-Number(b.acquired_at||0) || Number(a.sort_order||0)-Number(b.sort_order||0) || String(a.item_id).localeCompare(String(b.item_id)));
  const first = candidates[0];
  if (!first) return null;

  await env.DB.prepare(`
    INSERT INTO city_customization(territory_id,marker_item_id,updated_at) VALUES(?,?,?)
    ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at
  `).bind(id, first.item_id, Date.now()).run();

  return { ...first, id: first.item_id };
}
function normalizeMcNickname(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

function makeEmptyVoxGrid() {
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) => ({ row, col, state: '' }))
  ).flat();
}

async function getVoxGrid(env) {
  await ensureWorldTables(env);
  const rows = await env.DB.prepare(
    'SELECT row_index, col_index, state FROM vox_grid ORDER BY row_index, col_index'
  ).all();
  const cells = makeEmptyVoxGrid();
  for (const row of rows.results || []) {
    const cell = cells.find((c) => c.row === Number(row.row_index) && c.col === Number(row.col_index));
    if (cell) cell.state = row.state === '?' ? '?' : '';
  }
  return cells;
}

async function resetVoxGrid(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  await env.DB.prepare(`UPDATE vox_grid SET state='', updated_by=?, updated_at=?`).bind(Number(auth.user.id), Date.now()).run();
  return json({ ok: true });
}

async function saveVoxCell(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const row = Number(body?.row);
  const col = Number(body?.col);
  const state = body?.state === '?' ? '?' : '';
  if (!Number.isInteger(row) || row < 0 || row > 7 || !Number.isInteger(col) || col < 0 || col > 8) {
    return json({ ok: false, error: 'Invalid grid cell' }, 400);
  }
  await env.DB.prepare(`
    INSERT INTO vox_grid (row_index, col_index, state, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(row_index, col_index) DO UPDATE SET state = excluded.state, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).bind(row, col, state, Number(auth.user.id), Date.now()).run();
  return json({ ok: true, row, col, state });
}


async function cleanupCustomizationCategories(env) {
  // Tags are derived from active visuals. A tag without at least one visual is removed.
  const cats = await env.DB.prepare('SELECT id,name FROM customization_categories').all();
  for (const cat of cats.results || []) {
    const found = await env.DB.prepare(`
      SELECT 1 FROM customization_items
      WHERE active=1
        AND (
          instr(
            ',' || replace(lower(COALESCE(categories_text,'')),' ','') || ',',
            ',' || replace(lower(?),' ','') || ','
          ) > 0
          OR category_id = ?
        )
      LIMIT 1
    `).bind(cat.name, cat.id).first();
    if (!found) await env.DB.prepare('DELETE FROM customization_categories WHERE id=?').bind(cat.id).run();
  }
  // Keep category order compact and stable.
  const ordered = await env.DB.prepare('SELECT id FROM customization_categories ORDER BY sort_order ASC, created_at ASC, name ASC').all();
  let n = 0;
  for (const row of ordered.results || []) {
    await env.DB.prepare('UPDATE customization_categories SET sort_order=? WHERE id=?').bind(n++, row.id).run();
  }
}

function parseAchievementRequirement(value, max=2147483647, integer=false) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) return NaN;
  return n;
}

function achievementPayload(body) {
  const enabled = body?.achievementEnabled === true || body?.achievementEnabled === 1 || body?.achievementEnabled === '1' || body?.achievementEnabled === 'true';
  const requirements = {
    residents: enabled ? parseAchievementRequirement(body?.achievementResidents, 1000000, true) : null,
    gems: enabled ? parseAchievementRequirement(body?.achievementGems, 2147483647, true) : null,
    inspectorScore: enabled ? parseAchievementRequirement(body?.achievementInspectorScore, 10) : null,
    playerScore: enabled ? parseAchievementRequirement(body?.achievementPlayerScore, 10) : null,
    screenshots: enabled ? parseAchievementRequirement(body?.achievementScreenshots, 1000000, true) : null,
    comments: enabled ? parseAchievementRequirement(body?.achievementComments, 1000000, true) : null,
    visuals: enabled ? parseAchievementRequirement(body?.achievementVisuals, 1000000, true) : null,
  };
  const invalid = Object.entries(requirements).filter(([, value]) => Number.isNaN(value)).map(([key]) => key);
  return { enabled, ...requirements, invalid };
}

function achievementRequirementError(achievement) {
  if (!achievement?.invalid?.length) return null;
  const labels = {
    residents: 'жители (целое число)', gems: 'самоцветы (целое число)',
    inspectorScore: 'оценка инспектора от 0 до 10', playerScore: 'оценка игроков от 0 до 10',
    screenshots: 'скриншоты (целое число)', comments: 'комментарии (целое число)', visuals: 'визуалы (целое число)',
  };
  return `Проверьте условия достижения: ${achievement.invalid.map(key => labels[key] || key).join(', ')}.`;
}

function meetsAchievementRequirements(actual, requirements) {
  const specified = Object.entries(requirements).filter(([, threshold]) => threshold !== null && threshold !== undefined);
  if (!specified.length) return false;
  return specified.every(([key, threshold]) => {
    const needed = Number(threshold);
    const current = Number(actual[key]);
    return Number.isFinite(needed) && needed >= 0 && Number.isFinite(current) && current >= needed;
  });
}

async function countTerritoryVisuals(env, territoryId, inventoryIds) {
  const inventoryPh = inventoryIds.length ? inventoryIds.map(() => '?').join(',') : 'NULL';
  const row = await env.DB.prepare(`
    SELECT COUNT(DISTINCT item_id) AS value FROM (
      SELECT ci.item_id FROM city_items ci
      JOIN customization_items i ON i.id=ci.item_id AND i.active=1
      WHERE ci.territory_id=?
      UNION ALL
      SELECT ui.item_id FROM user_items ui
      JOIN customization_items i ON i.id=ui.item_id AND i.active=1
      WHERE ui.telegram_id IN (${inventoryPh})
    ) inventory
  `).bind(territoryId, ...inventoryIds).first();
  return Number(row?.value || 0);
}

async function evaluateAchievementsForTerritory(env, territoryId) {
  const territory = await env.DB.prepare(`
    SELECT id,name,owner_telegram_id,status FROM territories WHERE id=? AND status='approved'
  `).bind(territoryId).first();
  if (!territory || !(Number(territory.owner_telegram_id || 0) > 0)) return { checked: false, skipped: 'no_founder', awarded: 0 };

  const itemsResult = await env.DB.prepare(`
    SELECT id,name,achievement_residents,achievement_gems,achievement_inspector_score,
           achievement_player_score,achievement_screenshots,achievement_comments,
           achievement_visuals
    FROM customization_items
    WHERE active=1 AND achievement_enabled=1
    ORDER BY created_at ASC, id ASC
  `).all();
  const items = itemsResult.results || [];
  if (!items.length) return { checked: true, awarded: 0 };

  const residentsRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT telegram_id) AS value FROM (
      SELECT telegram_id FROM city_memberships WHERE territory_id=?
      UNION
      SELECT telegram_id FROM territory_managers WHERE territory_id=?
      UNION
      SELECT owner_telegram_id AS telegram_id FROM territories WHERE id=? AND owner_telegram_id IS NOT NULL
    ) people
  `).bind(territoryId, territoryId, territoryId).first();
  const gemsRow = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount),0) AS value FROM gem_spend_log WHERE territory_id=?
  `).bind(territoryId).first();
  const calculatedScores = await calculateTerritoryScores(env, territoryId);
  const screenshotsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS value FROM screenshots WHERE territory_id=? AND status='approved'
  `).bind(territoryId).first();
  const commentsRow = await env.DB.prepare(`
    SELECT COUNT(*) AS value FROM comments WHERE territory_id=?
  `).bind(territoryId).first();
  const managerIds = (await getTerritoryManagerRows(env, territoryId)).map(m => Number(m.telegram_id)).filter(Boolean);
  const memberRows = await env.DB.prepare(`SELECT telegram_id FROM city_memberships WHERE territory_id=?`).bind(territoryId).all();
  const inventoryIds = [...new Set([...managerIds, ...(memberRows.results || []).map(r => Number(r.telegram_id)).filter(Boolean)])];

  const actual = {
    residents: Number(residentsRow?.value || 0),
    gems: Number(gemsRow?.value || 0),
    inspector_score: Number(calculatedScores?.curator || 0),
    player_score: Number(calculatedScores?.community || 0),
    screenshots: Number(screenshotsRow?.value || 0),
    comments: Number(commentsRow?.value || 0),
    visuals: 0,
  };
  let newlyAwarded = 0;
  let repeat = true;
  let passes = 0;
  // Awarding one achievement adds that visual to the city inventory. Re-check in passes
  // so another achievement that depends on the newly acquired visual can unlock in the same run.
  while (repeat && passes <= items.length) {
    repeat = false;
    passes++;
    actual.visuals = await countTerritoryVisuals(env, territoryId, inventoryIds);

    for (const item of items) {
      const requirements = {
        residents: item.achievement_residents,
        gems: item.achievement_gems,
        inspector_score: item.achievement_inspector_score,
        player_score: item.achievement_player_score,
        screenshots: item.achievement_screenshots,
        comments: item.achievement_comments,
        visuals: item.achievement_visuals,
      };
      if (!meetsAchievementRequirements(actual, requirements)) continue;

      // Make reward delivery self-healing: an old award row must not prevent repair of a
      // missing city_items row if a prior request partially failed.
      const cityItem = await env.DB.prepare(`
        INSERT OR IGNORE INTO city_items(territory_id,item_id,acquired_at,source)
        VALUES(?,?,?,'achievement')
      `).bind(territoryId, item.id, Date.now()).run();
      if (cityItem.meta?.changes) {
        repeat = true;
        try { await ensureFirstCityMarker(env, territoryId); }
        catch (error) { console.error('Achievement marker initialization error:', error); }
      }

      const award = await env.DB.prepare(`
        INSERT OR IGNORE INTO achievement_awards(territory_id,item_id,awarded_at)
        VALUES(?,?,?)
      `).bind(territoryId, item.id, Date.now()).run();
      if (award.meta?.changes) {
        newlyAwarded++;
        try {
          await telegram(env, 'sendMessage', {
            chat_id: Number(territory.owner_telegram_id),
            text: `🏆 Достижение выполнено!\n\n🏙 ${escapeHtml(territory.name)}\n✨ Получен визуал: <b>${escapeHtml(item.name)}</b>`,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Achievement notification error:', error);
        }
      }
    }
  }
  return { checked: true, awarded: newlyAwarded, passes };
}

async function recheckAchievements(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  const rows = await env.DB.prepare(`SELECT id FROM territories WHERE status='approved' ORDER BY created_at ASC, id ASC`).all();
  let checked = 0, awarded = 0, skipped = 0, errors = 0;
  for (const row of rows.results || []) {
    try {
      const result = await evaluateAchievementsForTerritory(env, row.id);
      if (result.checked) checked++;
      else skipped++;
      awarded += Number(result.awarded || 0);
    } catch (error) {
      errors++;
      console.error('Achievement recheck failed for territory:', String(row.id).slice(0, 80), error);
    }
  }
  return json({ ok: true, checked, skipped, awarded, errors });
}

async function getCustomization(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth;
  await ensureWorldTables(env);
  const userId=Number(auth.user.id);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency (telegram_id,balance) VALUES (?,0)`).bind(userId).run();
  const managerCities=await getTreasuryManagerCities(env,userId);
  const url=new URL(request.url);
  if(String(url.searchParams.get('lite')||'')==='1'){
    const requested=String(url.searchParams.get('account')||'personal').toLowerCase();
    const requestedTerritoryId=requested.startsWith('treasury:')?requested.slice(9):'';
    let accountScope='personal',accountCity=null;
    if(requestedTerritoryId && managerCities.some(c=>String(c.id)===requestedTerritoryId)) { accountScope=`treasury:${requestedTerritoryId}`; accountCity=managerCities.find(c=>String(c.id)===requestedTerritoryId); }
    const currentUser=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1').bind(userId).first();
    let balance=Number((await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first())?.balance||0);
    if(accountCity){
      await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
      balance=Number((await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first())?.balance||0);
    }
    return json({ok:true,balance,personalBalance:Number((await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first())?.balance||0),accountScope,accountLabel:accountScope==='personal'?(currentUser?.mc_nickname||'Ник не указан'):`Казна: ${accountCity?.name||'город'}`});
  }
  const requested=String(url.searchParams.get('account')||'personal').toLowerCase();
  const requestedTerritoryId=requested.startsWith('treasury:')?requested.slice(9):'';
  let accountScope='personal',accountCity=null;
  if(requestedTerritoryId && managerCities.some(c=>String(c.id)===requestedTerritoryId)) { accountScope=`treasury:${requestedTerritoryId}`; accountCity=managerCities.find(c=>String(c.id)===requestedTerritoryId); }
  let profileTerritoryId=String(url.searchParams.get('territoryId')||'').trim();
  if(profileTerritoryId && !managerCities.some(c=>String(c.id)===profileTerritoryId)) profileTerritoryId='';
  if(!profileTerritoryId && accountCity) profileTerritoryId=String(accountCity.id);
  if(accountCity) await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
  const currentUser=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1').bind(userId).first();
  await cleanupCustomizationCategories(env);
  const [cats,items,owned,personalBalance]=await Promise.all([
    env.DB.prepare('SELECT id,name,sort_order FROM customization_categories ORDER BY sort_order ASC, created_at ASC, name ASC').all(),
    env.DB.prepare(`SELECT i.id,i.category_id,c.name AS category_name,i.name,i.price,i.image_data,i.categories_text,i.color,i.active,i.sort_order,i.achievement_enabled,i.achievement_residents,i.achievement_gems,i.achievement_inspector_score,i.achievement_player_score,i.achievement_screenshots,i.achievement_comments,i.achievement_visuals,i.government_marker,i.hidden_from_users FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id WHERE i.active=1 ORDER BY i.sort_order ASC, i.created_at ASC`).all(),
    env.DB.prepare('SELECT item_id,source,acquired_at FROM user_items WHERE telegram_id=?').bind(userId).all(),
    env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first(),
  ]);
  let balance=Number(personalBalance?.balance||0);
  if(accountCity){ const row=await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first(); balance=Number(row?.balance||0); }
  const viewerRole=await getRoleByTelegramId(env,userId,auth.user.username);
  const visibleItems=viewerRole==='main_inspector' ? (items.results||[]) : (items.results||[]).filter(i=>Number(i.government_marker||0)!==1 && Number(i.hidden_from_users||0)!==1);
  const itemMap=new Map(visibleItems.map(i=>[i.id,i]));
  const myItems=(owned.results||[]).map(x=>({...x,...(itemMap.get(x.item_id)||{})})).filter(x=>x.item_id&&itemMap.has(x.item_id));
  let cityInventory=[],equippedMarkerItemId=null,equippedBackgroundItemId=null;
  if(profileTerritoryId){
    const city=await env.DB.prepare('SELECT marker_item_id,background_item_id FROM city_customization WHERE territory_id=?').bind(profileTerritoryId).first();
    equippedMarkerItemId=city?.marker_item_id||null;
    equippedBackgroundItemId=city?.background_item_id||null;
    const managerIds=(await getTerritoryManagerRows(env,profileTerritoryId)).map(x=>Number(x.telegram_id)).filter(Boolean);
    const members=await env.DB.prepare('SELECT telegram_id FROM city_memberships WHERE territory_id=?').bind(profileTerritoryId).all();
    const ids=[...managerIds,...(members.results||[]).map(x=>Number(x.telegram_id)).filter(Boolean)].filter((x,i,a)=>a.indexOf(x)===i);
    const ph=ids.map(()=>'?').join(',')||'NULL';
    const [cityOnly,userOwned]=await Promise.all([
      env.DB.prepare(`SELECT ci.territory_id,ci.item_id,i.name,i.price,i.image_data,c.name AS category_name,i.categories_text,i.color,i.government_marker,i.hidden_from_users,ci.source FROM city_items ci JOIN customization_items i ON i.id=ci.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ci.territory_id=?`).bind(profileTerritoryId).all(),
      env.DB.prepare(`SELECT ui.telegram_id,ui.item_id,i.name,i.price,i.image_data,c.name AS category_name,i.categories_text,i.color,i.government_marker,i.hidden_from_users,ui.source FROM user_items ui JOIN customization_items i ON i.id=ui.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ui.telegram_id IN (${ph})`).bind(...ids).all(),
    ]);
    cityInventory=[...(cityOnly.results||[]),...(userOwned.results||[])].filter((x,i,a)=>a.findIndex(y=>y.item_id===x.item_id)===i);
    if(!equippedMarkerItemId){const first=await ensureFirstCityMarker(env,profileTerritoryId);equippedMarkerItemId=first?.id||null;}
  }
  return json({ok:true,balance,personalBalance:Number(personalBalance?.balance||0),accountScope,accountLabel:accountScope==='personal'?(currentUser?.mc_nickname||'Ник не указан'):`Казна: ${accountCity?.name||'город'}`,accountOptions:[{scope:'personal',label:currentUser?.mc_nickname||'Ник не указан'},...managerCities.map(c=>({scope:`treasury:${c.id}`,label:`Казна: ${c.name}`}))],managerCities,cityName:accountCity?.name||null,categories:cats.results||[],items:visibleItems,owned:owned.results||[],myItems,cityId:profileTerritoryId||null,cityRole:profileTerritoryId?'manager':null,cityInventory,equippedMarkerItemId,equippedBackgroundItemId});
}

function decodeDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  try { return { mime: m[1].toLowerCase(), bytes: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) }; }
  catch { return null; }
}

function imageDimensions(dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const b = decoded.bytes;
  if (decoded.mime === 'image/png' && b.length >= 24 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) {
    return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  }
  if ((decoded.mime === 'image/webp') && b.length >= 30 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70) {
    if (b[12] === 86 && b[13] === 80 && b[14] === 56 && b[15] === 88 && b.length >= 30) {
      const width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      const height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
      return { width, height };
    }
  }
  if (decoded.mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]; i += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (i + 1 >= b.length) break;
      const len = (b[i] << 8) | b[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3 && i + 7 < b.length) {
        return { height: (b[i + 3] << 8) | b[i + 4], width: (b[i + 5] << 8) | b[i + 6] };
      }
      i += len;
    }
  }
  return null;
}

function isCoverTag(categories){return categories.some(x=>String(x).trim().toLowerCase()==='обложка');}
function isMarkerTag(categories){return categories.some(x=>String(x).trim().toLowerCase()==='метка');}
function isEightToThree(width,height){return Number.isFinite(width)&&Number.isFinite(height)&&height>0&&Math.abs((width/height)-(8/3))<=0.001;}
async function syncGovernmentVisual(env,itemId,categories,governmentEnabled){const id=String(itemId||'').trim(),isMarker=isMarkerTag(categories),isCover=isCoverTag(categories);const govs=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved' AND is_government=1`).all();if(!governmentEnabled){await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();await env.DB.prepare(`UPDATE city_customization SET background_item_id=NULL,updated_at=? WHERE background_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();return;}for(const row of govs.results||[]){if(isMarker)await env.DB.prepare(`INSERT INTO city_customization(territory_id,marker_item_id,updated_at) VALUES(?,?,?) ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at`).bind(row.id,id,Date.now()).run();if(isCover)await env.DB.prepare(`INSERT INTO city_customization(territory_id,background_item_id,updated_at) VALUES(?,?,?) ON CONFLICT(territory_id) DO UPDATE SET background_item_id=excluded.background_item_id,updated_at=excluded.updated_at`).bind(row.id,id,Date.now()).run();}if(!isMarker)await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();if(!isCover)await env.DB.prepare(`UPDATE city_customization SET background_item_id=NULL,updated_at=? WHERE background_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();}

function normalizeTagList(value) {
  const arr = Array.isArray(value)
    ? value.map(x=>String(x||'').trim()).filter(Boolean)
    : String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
  const seen=new Set();
  return arr.filter(x=>{
    const key=x.toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

async function upsertTags(env, categories, createdBy) {
  const categoryIds=[];
  for(const categoryName of categories){
    const existing=await env.DB.prepare('SELECT id FROM customization_categories WHERE lower(name)=lower(?)').bind(categoryName).first();
    const categoryId=existing?.id||crypto.randomUUID();
    if(!existing){
      const maxRow=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_categories').first();
      await env.DB.prepare('INSERT INTO customization_categories (id,name,created_by,created_at,sort_order) VALUES (?,?,?,?,?)')
        .bind(categoryId,categoryName,createdBy,Date.now(),Number(maxRow?.max_order??-1)+1).run();
    }
    categoryIds.push(categoryId);
  }
  return categoryIds;
}

async function createCustomizationItem(request, env) {
  const auth=await requireMainInspector(request,env); if(auth.error)return auth;
  await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const name=String(body?.name||'').trim();
  const categories=normalizeTagList(body?.categories||body?.tags);
  const price=Number(body?.price);
  const imageData=String(body?.imageData||'').trim();
  const color=String(body?.color||'white').trim().toLowerCase();
  const governmentMarker=!!body?.governmentMarker;
  const achievement=achievementPayload(body);
  const achievementError=achievementRequirementError(achievement); if(achievementError)return json({ok:false,error:achievementError},400);
  if(achievement.enabled && !categories.some(x=>x.toLowerCase()==='за достижение')) categories.push('За достижение');
  if(!achievement.enabled) {
    for(let i=categories.length-1;i>=0;i--) if(categories[i].toLowerCase()==='за достижение') categories.splice(i,1);
  }
  const allowedColors=new Set(['none','red','orange','yellow','green','turquoise','blue','purple','magenta','white','black']);
  const isMarker=isMarkerTag(categories), isCover=isCoverTag(categories);
  if(!name||!categories.length||!Number.isSafeInteger(price)||price<0)return json({ok:false,error:'Название, теги и корректная цена обязательны'},400);
  if(!allowedColors.has(color))return json({ok:false,error:'Некорректный цвет'},400);
  if(!imageData.startsWith('data:image/'))return json({ok:false,error:'Загрузите изображение визуала'},400);
  if(governmentMarker&&!isMarker&&!isCover)return json({ok:false,error:'Для государственной метки или обложки визуал должен иметь тег «Метка» или «Обложка»'},400);
  if(isCover){const dim=imageDimensions(imageData);if(!dim||!isEightToThree(dim.width,dim.height))return json({ok:false,error:'Для визуала с тегом «Обложка» изображение должно иметь соотношение 8:3'},400);}
  if(imageData.length>1_000_000)return json({ok:false,error:'Изображение слишком большое'},413);
  if(achievement.enabled && ![achievement.residents,achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals].some(v=>v!==null)){
    return json({ok:false,error:'Укажите хотя бы одно условие достижения'},400);
  }
  try{
    const categoryIds=await upsertTags(env,categories,Number(auth.user.id));
    const maxRow=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_items WHERE active=1').first();
    const itemId=crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO customization_items
      (id,category_id,name,price,image_data,active,created_by,created_at,categories_text,color,sort_order,
       achievement_enabled,achievement_residents,achievement_gems,achievement_inspector_score,achievement_player_score,
       achievement_screenshots,achievement_comments,achievement_visuals,government_marker)
      VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      itemId,categoryIds[0],name,price,imageData,Number(auth.user.id),Date.now(),categories.join(', '),color,
      Number(maxRow?.max_order??-1)+1,achievement.enabled?1:0,achievement.residents,achievement.gems,
      achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals,governmentMarker?1:0
    ).run();
    await cleanupCustomizationCategories(env);
    await syncGovernmentVisual(env,itemId,categories,governmentMarker);
    if(achievement.enabled){
      const territories=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved'`).all();
      for(const t of territories.results||[]) await evaluateAchievementsForTerritory(env,t.id);
    }
    return json({ok:true,item:{id,category_id:categoryIds[0],categories_text:categories.join(', '),name,price,image_data:imageData,color,sort_order:Number(maxRow?.max_order??-1)+1,achievement_enabled:achievement.enabled?1:0,government_marker:governmentMarker?1:0}});
  }catch(error){
    console.error('Create customization item error:',error);
    return json({ok:false,error:'Не удалось добавить визуал'},500);
  }
}

async function updateCustomizationItem(request,env,itemId){
  const auth=await requireMainInspector(request,env);if(auth.error)return auth;
  await ensureWorldTables(env);
  const id=String(itemId||'').trim();
  if(!id)return json({ok:false,error:'Визуал не найден'},404);
  const current=await env.DB.prepare(`
    SELECT id,name,price,image_data,category_id,color,categories_text,sort_order,achievement_enabled,
           achievement_residents,achievement_gems,achievement_inspector_score,achievement_player_score,
           achievement_screenshots,achievement_comments,achievement_visuals,government_marker
    FROM customization_items WHERE id=? AND active=1
  `).bind(id).first();
  if(!current)return json({ok:false,error:'Визуал не найден'},404);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const name=String(body?.name??current.name).trim();
  const categories=normalizeTagList(body?.categories??body?.tags??current.categories_text);
  const price=Number(body?.price??current.price);
  const imageData=String(body?.imageData??current.image_data??'').trim();
  const color=String(body?.color??current.color??'white').trim().toLowerCase();
  const enabled=body?.achievementEnabled===undefined?!!current.achievement_enabled:!!body.achievementEnabled;
  const governmentMarker=body?.governmentMarker===undefined?!!current.government_marker:!!body.governmentMarker;
  const isMarker=isMarkerTag(categories), isCover=isCoverTag(categories);
  if(governmentMarker&&!isMarker&&!isCover)return json({ok:false,error:'Для государственной метки или обложки визуал должен иметь тег «Метка» или «Обложка»'},400);
  const achievement=achievementPayload({...body,achievementEnabled:enabled,
    achievementResidents:body?.achievementResidents??current.achievement_residents,
    achievementGems:body?.achievementGems??current.achievement_gems,
    achievementInspectorScore:body?.achievementInspectorScore??current.achievement_inspector_score,
    achievementPlayerScore:body?.achievementPlayerScore??current.achievement_player_score,
    achievementScreenshots:body?.achievementScreenshots??current.achievement_screenshots,
    achievementComments:body?.achievementComments??current.achievement_comments,
    achievementVisuals:body?.achievementVisuals??current.achievement_visuals});
  const achievementError=achievementRequirementError(achievement); if(achievementError)return json({ok:false,error:achievementError},400);
  if(achievement.enabled && !categories.some(x=>x.toLowerCase()==='за достижение')) categories.push('За достижение');
  if(!achievement.enabled) {
    for(let i=categories.length-1;i>=0;i--) if(categories[i].toLowerCase()==='за достижение') categories.splice(i,1);
  }
  if(!name||!categories.length||!Number.isSafeInteger(price)||price<0)return json({ok:false,error:'Название, теги и корректная цена обязательны'},400);
  if(!imageData.startsWith('data:image/'))return json({ok:false,error:'Загрузите изображение визуала'},400);
  if(imageData.length>1_000_000)return json({ok:false,error:'Изображение слишком большое'},413);
  if(isCover){const dim=imageDimensions(imageData);if(!dim||!isEightToThree(dim.width,dim.height))return json({ok:false,error:'Для визуала с тегом «Обложка» изображение должно иметь соотношение 8:3'},400);}
  if(achievement.enabled && ![achievement.residents,achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals].some(v=>v!==null)){
    return json({ok:false,error:'Укажите хотя бы одно условие достижения'},400);
  }
  const categoryIds=await upsertTags(env,categories,Number(auth.user.id));
  await env.DB.prepare(`
    UPDATE customization_items SET category_id=?,name=?,price=?,image_data=?,categories_text=?,color=?,
      achievement_enabled=?,achievement_residents=?,achievement_gems=?,achievement_inspector_score=?,
      achievement_player_score=?,achievement_screenshots=?,achievement_comments=?,achievement_visuals=?,government_marker=?
    WHERE id=?
  `).bind(categoryIds[0],name,price,imageData,categories.join(', '),color,achievement.enabled?1:0,achievement.residents,
    achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals,governmentMarker?1:0,id).run();
  await cleanupCustomizationCategories(env);
  await syncGovernmentVisual(env,id,categories,governmentMarker);
  if(achievement.enabled) {
    const territories=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved'`).all();
    for(const t of territories.results||[]) await evaluateAchievementsForTerritory(env,t.id);
  }
  return json({ok:true,item:{id,name,price,image_data:imageData,category_id:categoryIds[0],categories_text:categories.join(', '),color,achievement_enabled:achievement.enabled?1:0}});
}

async function setCustomizationItemVisibility(request, env) {
  const auth=await requireMainInspector(request,env); if(auth.error)return auth;
  await ensureWorldTables(env);
  let body; try { body=await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
  const itemId=String(body?.itemId||'').trim();
  const flag=body?.hiddenFromUsers;
  if(!itemId || ![true,false,0,1].includes(flag)) return json({ok:false,error:'Укажите визуал и состояние видимости'},400);
  const item=await env.DB.prepare(`SELECT id FROM customization_items WHERE id=? AND active=1 LIMIT 1`).bind(itemId).first();
  if(!item) return json({ok:false,error:'Визуал не найден'},404);
  const hidden=(flag===true||flag===1)?1:0;
  await env.DB.prepare(`UPDATE customization_items SET hidden_from_users=? WHERE id=?`).bind(hidden,itemId).run();
  return json({ok:true,itemId,hidden_from_users:hidden});
}

async function deleteCustomizationItem(request,env,itemId){
  const auth=await requireMainInspector(request,env);if(auth.error)return auth;
  await ensureWorldTables(env);
  const id=String(itemId||'').trim();
  const item=await env.DB.prepare('SELECT id FROM customization_items WHERE id=? AND active=1').bind(id).first();
  if(!item)return json({ok:false,error:'Визуал не найден'},404);
  await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=?`).bind(Date.now(),id).run();
  await env.DB.prepare(`UPDATE city_customization SET background_item_id=NULL,updated_at=? WHERE background_item_id=?`).bind(Date.now(),id).run();
  await env.DB.prepare(`DELETE FROM city_items WHERE item_id=?`).bind(id).run();
  // Keep achievement_awards history: an achievement must never notify the founder twice.
  await env.DB.prepare(`UPDATE customization_items SET active=0 WHERE id=?`).bind(id).run();
  await cleanupCustomizationCategories(env);
  return json({ok:true});
}

async function reorderCustomizationItems(request,env){
  const auth=await requireMainInspector(request,env);if(auth.error)return auth;
  await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const ids=Array.isArray(body?.itemIds)?body.itemIds.map(String):[];
  for(let i=0;i<ids.length;i++) await env.DB.prepare('UPDATE customization_items SET sort_order=? WHERE id=? AND active=1').bind(i,ids[i]).run();
  return json({ok:true});
}

async function reorderCustomizationTags(request,env){
  const auth=await requireMainInspector(request,env);if(auth.error)return auth;
  await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const ids=Array.isArray(body?.tagIds)?body.tagIds.map(String):[];
  for(let i=0;i<ids.length;i++) await env.DB.prepare('UPDATE customization_categories SET sort_order=? WHERE id=?').bind(i,ids[i]).run();
  return json({ok:true});
}

async function purchaseCustomizationItem(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth;
  await ensureWorldTables(env);
  const userId=Number(auth.user.id); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const itemId=String(body?.itemId||'').trim(),requested=String(body?.accountScope||'personal').toLowerCase();
  const managerCities=await getTreasuryManagerCities(env,userId); const territoryId=requested.startsWith('treasury:')?requested.slice(9):'';
  const accountCity=managerCities.find(c=>String(c.id)===territoryId)||null; const accountScope=accountCity?`treasury:${accountCity.id}`:'personal';
  if(accountCity) await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
  const item=await env.DB.prepare('SELECT id,price,government_marker,hidden_from_users FROM customization_items WHERE id=? AND active=1').bind(itemId).first(); if(!item)return json({ok:false,error:'Товар не найден'},404); if(Number(item.government_marker||0)===1)return json({ok:false,error:'Этот визуал недоступен для покупки'},403); const buyerRole=await getRoleByTelegramId(env,Number(auth.user.id),auth.user.username||''); if(Number(item.hidden_from_users||0)===1 && buyerRole!=='main_inspector')return json({ok:false,error:'Этот визуал недоступен для покупки'},403);
  const already=await env.DB.prepare('SELECT item_id FROM user_items WHERE telegram_id=? AND item_id=?').bind(userId,itemId).first(); if(already)return json({ok:true,alreadyOwned:true});
  await env.DB.prepare('INSERT OR IGNORE INTO user_currency(telegram_id,balance) VALUES(?,0)').bind(userId).run();
  const balance=accountCity?await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first():await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first();
  if(Number(balance?.balance||0)<Number(item.price))return json({ok:false,error:'Недостаточно самоцветов'},400);
  const charged=accountCity
    ?await env.DB.prepare('UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=?').bind(Number(item.price),Date.now(),accountCity.id,Number(item.price)).run()
    :await env.DB.prepare('UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=?').bind(Number(item.price),userId,Number(item.price)).run();
  if(!charged.meta?.changes)return json({ok:false,error:'Недостаточно самоцветов'},400);
  const acquiredAt=Date.now(); await env.DB.prepare("INSERT INTO user_items (telegram_id,item_id,acquired_at,source) VALUES(?,?,?,'purchase')").bind(userId,itemId,acquiredAt).run();
  const attributedCity=accountCity||managerCities[0]||((await env.DB.prepare(`SELECT t.id,t.name FROM city_memberships cm JOIN territories t ON t.id=cm.territory_id WHERE cm.telegram_id=? AND t.status='approved' ORDER BY t.created_at ASC LIMIT 1`).bind(userId).first())||null);
  if(attributedCity){
    if(Number(item.price)>0){
      await ensureFirstCityMarker(env,attributedCity.id);
      await env.DB.prepare(`INSERT INTO gem_spend_log(id,territory_id,telegram_id,item_id,amount,created_at) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),attributedCity.id,userId,itemId,Number(item.price),acquiredAt).run();
    }
    await evaluateAchievementsForTerritory(env,attributedCity.id).catch(error=>console.error('Achievement evaluation after visual purchase:',error));
  }
  const finalBalance=accountCity?await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first():await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first();
  return json({ok:true,balance:Number(finalBalance?.balance||0),accountScope});
}

async function getTreasury(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  const userId=Number(auth.user.id),url=new URL(request.url),territoryId=String(url.searchParams.get('territoryId')||'').trim(); if(!territoryId)return json({ok:false,error:'territoryId is required'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  if(!(await isTerritoryManager(env,territoryId,userId)) && !(await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE telegram_id=? AND territory_id=?`).bind(userId,territoryId).first()))return json({ok:false,error:'Только жители города имеют доступ к казне'},403);
  await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run(); await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) VALUES(?,0)`).bind(userId).run();
  const [treasury,personal]=await Promise.all([env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first()]);
  return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:await isTerritoryManager(env,territoryId,userId),cityName:territory.name});
}
async function treasuryDeposit(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Math.floor(Number(body?.amount||0)); if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Введите положительное количество самоцветов'},400);
  const territory=await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  const allowed=await isTerritoryManager(env,territoryId,userId) || !!(await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE telegram_id=? AND territory_id=?`).bind(userId,territoryId).first()); if(!allowed)return json({ok:false,error:'Только жители города могут пополнять казну'},403);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) VALUES(?,0)`).bind(userId).run(); await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
  const charged=await env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=?`).bind(amount,userId,amount).run(); if(!charged.meta?.changes)return json({ok:false,error:'Недостаточно самоцветов'},400);
  await env.DB.prepare(`UPDATE city_treasury SET balance=balance+?,updated_at=? WHERE territory_id=?`).bind(amount,Date.now(),territoryId).run();
  const [treasury,personal]=await Promise.all([env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first()]); return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:await isTerritoryManager(env,territoryId,userId)});
}
async function treasuryDonate(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Math.floor(Number(body?.amount||0));
  if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Укажите положительное количество самоцветов'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.is_government||0)===1)return json({ok:false,error:'Для государственной территории донат недоступен'},400);
  const managers=await getTerritoryManagerRows(env,territoryId); if(!managers.length)return json({ok:false,error:'У города пока нет основателя/мэра'},409);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) VALUES(?,0)`).bind(userId).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
  const now=Date.now();
  const charged=await env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=?`).bind(amount,userId,amount).run();
  if(!charged.meta?.changes)return json({ok:false,error:'Недостаточно самоцветов'},400);
  try {
    await env.DB.prepare(`UPDATE city_treasury SET balance=balance+?,updated_at=? WHERE territory_id=?`).bind(amount,now,territoryId).run();
  } catch(error) {
    await env.DB.prepare(`UPDATE user_currency SET balance=balance+? WHERE telegram_id=?`).bind(amount,userId).run().catch(()=>{});
    throw error;
  }
  const personal=await env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first();
  const donorName=auth.user.username?`@${String(auth.user.username).replace(/^@/,'')}`:(await env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=?`).bind(userId).first())?.mc_nickname||`id${userId}`;
  await notifyTerritoryManagers(env,territoryId,`💎 <b>Новое пожертвование в казну</b>\n\n🏙 <b>${escapeHtml(territory.name)}</b>\n👤 Отправитель: <b>${escapeHtml(donorName)}</b>\n💎 Сумма: <b>${amount}</b>`,null);
  return json({ok:true,personal_balance:Number(personal?.balance||0),amount});
}

async function treasuryWithdraw(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Math.floor(Number(body?.amount||0)); if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Введите положительное количество самоцветов'},400);
  const territory=await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404); if(!(await isTerritoryManager(env,territoryId,userId)))return json({ok:false,error:'Только основатель/мэр может тратить средства казны'},403);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) VALUES(?,0)`).bind(userId).run(); await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
  const changed=await env.DB.prepare(`UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=?`).bind(amount,Date.now(),territoryId,amount).run(); if(!changed.meta?.changes)return json({ok:false,error:'Недостаточно средств в казне'},400);
  await env.DB.prepare(`UPDATE user_currency SET balance=balance+? WHERE telegram_id=?`).bind(amount,userId).run(); const [treasury,personal]=await Promise.all([env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first()]); return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:true});
}

async function updateCityCustomization(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim();
  const hasMarkerField=Object.prototype.hasOwnProperty.call(body,'markerItemId');
  const hasBackgroundField=Object.prototype.hasOwnProperty.call(body,'backgroundItemId');
  const markerItemId=hasMarkerField && body?.markerItemId ? String(body.markerItemId) : null;
  const backgroundItemId=hasBackgroundField && body?.backgroundItemId ? String(body.backgroundItemId) : null;
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.is_government||0)===1)return json({ok:false,error:'Государственной территорией нельзя управлять через оформление города'},403);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Только основатель/мэр может менять оформление города'},403);
  async function validateItem(itemId,tag,label){
    const item=await env.DB.prepare(`SELECT i.id,i.categories_text,c.name AS category_name,i.government_marker,i.hidden_from_users FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id WHERE i.id=? AND i.active=1`).bind(itemId).first();
    if(!item)throw new Error(`${label} не найден`);
    if(Number(item.government_marker||0)===1)throw new Error('Государственный визуал нельзя экипировать на обычный город');
    if(!visualHasTag(item,tag))throw new Error(`${label} должен иметь тег «${tag}»`);
    const allowed=await env.DB.prepare(`
      SELECT 1 FROM city_items WHERE territory_id=? AND item_id=?
      UNION SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=?
      UNION SELECT 1 FROM user_items ui JOIN city_memberships cm ON cm.telegram_id=ui.telegram_id WHERE cm.territory_id=? AND ui.item_id=?
      UNION SELECT 1 FROM user_items ui JOIN territory_managers tm ON tm.telegram_id=ui.telegram_id WHERE tm.territory_id=? AND ui.item_id=?
      UNION SELECT 1 FROM user_items ui JOIN territories ot ON ot.owner_telegram_id=ui.telegram_id WHERE ot.id=? AND ot.status='approved' AND ui.item_id=?
      LIMIT 1
    `).bind(territoryId,itemId,Number(auth.user.id),itemId,territoryId,itemId,territoryId,itemId,territoryId,itemId).first();
    if(!allowed)throw new Error(`${label} недоступен вашему городу`);
  }
  try{
    if(!hasMarkerField&&!hasBackgroundField)return json({ok:false,error:'Нужно выбрать метку или обложку'},400);
    const columns=['territory_id'];
    const values=['?'];
    const insertBinds=[territoryId];
    const updates=[];
    if(hasMarkerField){
      if(markerItemId)await validateItem(markerItemId,'метка','Метка');
      columns.push('marker_item_id'); values.push('?'); insertBinds.push(markerItemId); updates.push('marker_item_id=excluded.marker_item_id');
    }
    if(hasBackgroundField){
      if(backgroundItemId)await validateItem(backgroundItemId,'обложка','Обложка');
      columns.push('background_item_id'); values.push('?'); insertBinds.push(backgroundItemId); updates.push('background_item_id=excluded.background_item_id');
    }
    columns.push('updated_at'); values.push('?'); insertBinds.push(Date.now()); updates.push('updated_at=excluded.updated_at');
    await env.DB.prepare(`INSERT INTO city_customization(${columns.join(',')}) VALUES(${values.join(',')}) ON CONFLICT(territory_id) DO UPDATE SET ${updates.join(',')}`).bind(...insertBinds).run();
    return json({ok:true,markerItemId:markerItemId,backgroundItemId:backgroundItemId});
  }catch(error){return json({ok:false,error:error?.message||'Не удалось обновить оформление'},400)}
}
async function inviteResident(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  let body; try { body = await request.json(); } catch { return json({ ok:false,error:'Invalid JSON' },400); }
  const territoryId=String(body?.territoryId||'').trim(), nickname=normalizeMcNickname(body?.nickname);
  if(!territoryId||!nickname) return json({ok:false,error:'territoryId и ник обязательны'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory||!(await isTerritoryManager(env,territoryId,auth.user.id))) return json({ok:false,error:'Только основатель/мэр может приглашать жителей'},403);
  const target=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE lower(mc_nickname)=lower(?) LIMIT 1`).bind(nickname).first();
  if(!target) {
    const inviteId=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO city_invites (id,territory_id,target_telegram_id,target_nickname,invited_by,invite_type,status,created_at) VALUES (?,?,NULL,?,?, 'join','pending',?)`).bind(inviteId,territoryId,nickname,Number(auth.user.id),Date.now()).run();
    return json({ok:true,pendingNickname:true,inviteId,message:'Приглашение сохранено. Оно будет отправлено после подтверждения этого никнейма.'});
  }
  if(String(target.telegram_id)===String(auth.user.id)) return json({ok:false,error:'Нельзя пригласить самого себя'},400);
  const membership=await env.DB.prepare('SELECT territory_id FROM city_memberships WHERE telegram_id=? AND territory_id=?').bind(Number(target.telegram_id),territoryId).first();
  const inviteType='join';
  await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE target_telegram_id=? AND status='pending'`).bind(Date.now(),Number(target.telegram_id)).run();
  const inviteId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO city_invites (id,territory_id,target_telegram_id,target_nickname,invited_by,invite_type,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)`).bind(inviteId,territoryId,Number(target.telegram_id),nickname,Number(auth.user.id),inviteType,Date.now()).run();
  if(target.status==='verified') await sendResidentInvite(env,{id:inviteId,territory_id:territoryId,target_telegram_id:Number(target.telegram_id),target_nickname:nickname,invite_type:inviteType},territory.name);
  return json({ok:true,inviteId,inviteType,pendingNickname:target.status!=='verified'});
}

async function sendResidentInvite(env, invite, cityName) {
  if (!invite.target_telegram_id) return;
  const title = invite.invite_type === 'transfer' ? '🔄 Приглашение сменить город' : '🏙 Приглашение в город';
  const text = `${title}\n\nВас приглашают в город «${escapeHtml(cityName)}».\n\nВыберите действие:`;
  try {
    await telegram(env, 'sendMessage', {
      chat_id: invite.target_telegram_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Согласиться', callback_data: `resident_accept:${invite.id}` },
        { text: '❌ Отказаться', callback_data: `resident_reject:${invite.id}` },
      ]] },
    });
  } catch (error) { console.error('Resident invite notification error:', error); }
}

async function hideRecruitmentIfContactLost(env, territoryId, targetId, usernameHint='') {
  await ensureRecruitmentTable(env);
  const recruitment=await env.DB.prepare(`SELECT contact_username,enabled FROM recruitment WHERE territory_id=?`).bind(territoryId).first();
  if(!recruitment || Number(recruitment.enabled||0)!==1 || !recruitment.contact_username) return false;
  const target=await env.DB.prepare(`SELECT telegram_username FROM users WHERE telegram_id=?`).bind(Number(targetId)).first();
  const contact=normalizeUsername(recruitment.contact_username).toLowerCase();
  const candidates=[target?.telegram_username,usernameHint].map(v=>normalizeUsername(v).toLowerCase()).filter(Boolean);
  if(!candidates.includes(contact)) return false;
  await env.DB.prepare(`UPDATE recruitment SET enabled=0,contact_username=NULL,updated_at=? WHERE territory_id=?`).bind(Date.now(),territoryId).run();
  return true;
}

async function getCityManagement(request, env, url) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  const territoryId=String(url.searchParams.get('territoryId')||'').trim(); const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  const [members,invites,managers,recruitment]=await Promise.all([
    env.DB.prepare(`SELECT cm.telegram_id,u.mc_nickname,u.telegram_username,u.xuid,u.skin_texture_id,cm.joined_at FROM city_memberships cm LEFT JOIN users u ON u.telegram_id=cm.telegram_id WHERE cm.territory_id=? ORDER BY cm.joined_at ASC`).bind(territoryId).all(),
    env.DB.prepare(`SELECT ci.id,ci.target_telegram_id,ci.target_nickname,ci.invite_type,ci.created_at FROM city_invites ci WHERE ci.territory_id=? AND ci.status='pending' ORDER BY ci.created_at DESC`).bind(territoryId).all(),
    getTerritoryManagerRows(env,territoryId),
    env.DB.prepare(`SELECT contact_username FROM recruitment WHERE territory_id=?`).bind(territoryId).first(),
  ]);
  return json({ok:true,owner:true,isManager:true,members:(members.results||[]).map(m=>({...m,skin_url:skinUrlFromTexture(m.skin_texture_id,m.mc_nickname)})),invites:invites.results||[],managers,managerCount:managers.length,recruitmentUsername:recruitment?.contact_username||''});
}

async function cancelResidentInvite(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const inviteId=String(body?.inviteId||'').trim(); const invite=await env.DB.prepare(`SELECT ci.id,ci.territory_id FROM city_invites ci WHERE ci.id=? AND ci.status='pending'`).bind(inviteId).first(); if(!invite)return json({ok:false,error:'Приглашение не найдено'},404);
  if(!(await isTerritoryManager(env,invite.territory_id,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403); await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE id=?`).bind(Date.now
