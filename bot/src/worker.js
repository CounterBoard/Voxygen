// ============================================================
// VOXYGEN BACKEND
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

const TELEGRAM_API = "https://api.telegram.org";

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data, status = 200) {
  return withCors(new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
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

async function getRoleByTelegramId(env, telegramId) {
  const id = String(telegramId);
  const main = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (main && id === main) return "main_inspector";

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

async function requireMainInspector(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  const main = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (!main || String(auth.user.id) !== main) {
    return { error: json({ ok: false, error: "Forbidden" }, 403) };
  }
  return auth;
}

async function isInspector(env, telegramId) {
  const role = await getRoleByTelegramId(env, telegramId);
  return role === "inspector" || role === "main_inspector";
}

async function ensureRecruitmentTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS recruitment (
      territory_id TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )
  `).run();
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

async function ensureMapSettingsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

async function getMapSettings(env) {
  try {
    await ensureMapSettingsTable(env);
    const row = await env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'vox_map_image'"
    ).first();
    return json({ ok: true, mapImage: row?.value || null });
  } catch (error) {
    console.error("GET map settings error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}

async function saveMapSettings(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const mapImage = String(body?.mapImage || "").trim();
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
      VALUES ('vox_map_image', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(mapImage, Date.now()).run();
    return json({ ok: true });
  } catch (error) {
    console.error("SAVE map settings error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}


const DEFAULT_MARKER_IMAGES = {
  black: "data:image/webp;base64,UklGRm4DAABXRUJQVlA4WAoAAAAQAAAA1wAA7wAAQUxQSK4AAAABgFXbTsUoQhASIwhBCEYQEiExkt+e1UBfwyQiJkAeGHlbk70n5uW/q4qzJpufrDEemVsCsO4rsuvlv/tZW+jIrSmaANskN3M0Ocku0PLfHWwYenSy9fLfPzWWo0fngR6dlf/+3vM3jS4jl6UGJ9CDXcIOTNhxMvO5ZvnvPuFsco4mIMr2xTo2FzqUzQBWD9bhgLtsHXvu8t9to70soh0dDs3Ots3RBqmce/nv0gRWUDggmgIAANAkAJ0BKtgA8AA+GQyFQaEEmzkkBABhLS3cGAAM7OvP9Rjnyxs+Yex92oMA8BFLkhT5gBJSfFREHLm6srtsrtby/9PENM9W03Sh7Y4XaDzIYqtFLvv7HP/RTBciChZwyik8Nts1TDvKKBnMPPE69P4qNPSyf6Ip8eCK1KrnTD5png8Fxgg+99fe7vRjranEtg9nyq9ovcK3W2OgIJjhs9bOz++P465hDlU3cPv/XXWegZW4n5ZMrdXC2oORUX83ASSKVJXWf8kiPPCFFgfwiIDJSw5ni2VPPuZEGT9xJIXG/9/5Cqag+5KNYp6fOwkSQOsHYxQPaWWvf2XzYAgf0i0saG2bkPu6ph75S3McNW9uN4seo2Dy/gXxpw8OwWptMAC9K95xVW9ugJ60areEAAD+9pUv8yNSd8frqgbEIIYWS+iekXqnXYb903X3d6+TZbKfxqM1n2zP1ZzdncZt/twfSWZtnI7qCgu+TzA5hS+zY6HtfuPlwhzwtghgPeQ/K1tV61FhhQGO8/ytjul88Pl5Pn/6EbGJf56Op6t3msZapeeWcyLVWTk6lRD9fdJ8S/QZVIfCMPOLU+NqFrKKli2mFK7FFgSCbA75Lx2/5pG/6SYYkPQjcAQQe/FeTVZn//fn+/QamVATxVUvHmnSr+dnbWeOw1GAHxmEanQ9u/+uM3piA6ra9xDVdtJg69vAitwlNyb0vc679ILJyJFWzUvpulKu53L6aPu4GJ6HsNOwq9hwcPihdgKD+l+D+mnlltfdXxx4YdSyWTY+kXHQPf0K8CNDh0z8uI8zYAbLGW3Uuat83qw3IpO4gnbupXr/2/6YN430Sx2H9q/+JHBWkABDfAF/3xbVGRCU/GKxB9N/k0xX0dnhoAAAAA==",
  brown: "data:image/webp;base64,UklGRiAFAABXRUJQVlA4WAoAAAAQAAAA1wAA7wAAQUxQSOUAAAABv2C0bdvUqAPXiIijWd8kkgQItm21qV56Jz4kYf6z9Swf6C8sIvo/AfLCaLd2knbDQvXf/3tXn2+3V9I7SfzGKhOi6QbAA6M5NzG++q8I1jnyXGxrx4E0gG3EtiMG0jgxzkW0+q+scn4sc1Ay66SVhBuX9Oq/UlL3qWxXILNOI1r9V0pqsm5wSrpgGmzAFNlT2B0TdkmbaxnPtciWOGEfHFv9949XYCl9t4AaIAM7OTbiq0OXgbUAHkJk/UNf7/V5R3aSpFNXpO9se/Pqv//Kuo9FhgldArRNbJc4WqFB8r36r9AEAFZQOCAUBAAAsCsAnQEq2ADwAD4ZCoRBoQS/fR4EAGEtLd8L1QHMVjOUwv+5b4C8BEC4x/bd9QfQb9qukA/WD9cvds6Gb+q+rX6wnoAeVf7PX3Ae0Nq0nkL/KdWauziW7VAAwQjG+EzbaApw6FxlxZ8/AMyQ72Y5pKM4F5ukKHq5FxlqOQgyj1rKawVG6AZfP5JS6jtkx6vAAcKOSJqXRxYCZbWwQQxLteW7TP+aWRc9+46uT49q5I9hft3bGtcPjmWW+mUUOjB/FpRyWqUq2xu+1lHOVyKIVqggn7dixViKhofCE/vXYMjk7B9wwgVXZ0uXFO7nwCdog6r4ndL0CMsdkwkp4mcAEIbiA6iOvfAgqVi6EqnASbhYKCa9x61wjgiKyI4lJ6lKNYuafO12WZ3iWy5sPdxwYoln5YR5i39cheiuu1CoQ/A1ROIRAkd37lzA7YrImpZ81BD7aQ5/m4HBFU/RuRdQJFCm0An2gAD+/i8r/wAguwCKUnLPUWdRzarL6J6OeFntfpzr6/fMdgQRsNtsOQl1LO1PJgJKt8cv8fFg8QAOwU4N4K6cecr2D/nq7NvokkFd9Eby52hGuigeWD21DJt6Kk8+CCl3lvKWw69FcZRcIhBHThWsnbn2yXyvPdbak6UX1x7ybqjDernmGfssxnNnJ3AF6rjdu6uVIP+UegUPkFXsX+MGy1t49SKsE3aZroB+iHvVyOXHEaf/+04XTPmbbAJ1L0VNpjVdNu4JQKtwst8g05NRfYmie2FRNSIIj8vqkgeakW4j8AfZDcb5yge5fkvKD0hVZW3BAkcjoA9+CURlg4S93A3oInkUBmgYRlnRglJE86+BBtnNRpHOhMc0ClhzHgSb7cshWOZOXybE/vLIshCfwFJrEBOndq7q+nNoMAITV8IB2oEZbR3WxpUGUWqcLc73gCyBr0YYo8LmTv0K/5XTdLoDZgr3DTykOD9qbBDzoWJIQ7fn0iB+rZIsHfdJeuxpVRNtcv+V3cgt4h+javBY7dJn49QLzGg/Z+Xd93ynsnzsvZ0FRlzppsieDb/woqHsmr03aMgcN3f9PfGjNqS+ueRGBdDxdzxPYGRJLw+xQxhXq/MM2htox7H/DWyKVZpLqhVeCfAcFmLPa9QmA8h/t/PV+SbAtKEgY4X6U3f9JTgwP8uR00qDC0x4bJz2U6A/X5O6Zw/zPiIcivx7gZfiKYRQQKMVD5X1nsOHHSRTD5KxK42PMGf85Sdl5eii8IVjdqpTNej/OqtX8wplaiR2TD6rM1k3Ao5DKh57+5heO7V4Bb26z9WdvQIZ1flD/VrL1Ewa3Ha942DUhjmIaxRJMT/7O+w221OK0l+G/LHZTIwAeGUgdmhXGhf3T+8xiZracfOiEeBmj2c45tgAAAAA",
  white: "data:image/webp;base64,UklGRkIEAABXRUJQVlA4WAoAAAAQAAAA1wAA7wAAQUxQSMAAAAABgFXbaiUGIQjBCEJGCEYiJEIwwm/PlKTPrETEBMgHVt9TZe2N5fXf/3tl+5bBuiw+2MnMar0B2JjYOb/+O5/pIKc150Y2wKr05pVkc9LcU+j13xnMcpJbJyoLb27p13+nJP2qWCW5dVHo9d8pSbfOxiSjt2zOix3CcsJ6rU0JfYMisThhX8Be//3jlSyjb1Ao0QbEWB9ocDHQx9gOYMti42GzWJelY5/7+u+0oV8WMUefhMJZXRw9IZN9v/47NAFWUDggXAMAALApAJ0BKtgA8AA+GQqEQaEE/2M/BABhLS3dA/hRAwQCI352/mb+9dYSvA/tddDnbu4lugD+Z/2DymeYX/m3+o4AAMuAaQTdHmlvM7eV6MMZnQECorr6oWMvi77Z3PBywG0N7rUfq21TZ1uGpefwkQrzuA8Pa4rDWsFV3NW2eW8rapAAtTdtcD/GMuwwLnHO1r1dVd+3qzOodV2oLJ9pBmYBL+T6qBkhpmJnp27IDYTv7xT2+PUOzZrhk+dhjN2kGdrS9hkj28zZABS7BJJB6izBnhC3Hrld11VAnfHq80S2YTnsTRHTF8NIgoLP0aDwz7nKHWgtw5wngBw0auoI1Nv4Xs7GWSD2cukQU09RZop2n/ysC5dx+dDjAeuEIDy/+H1LiP5QvDIMROoI/jFdRh8g95FCui+VwtNmjx/7KU110qqYfa2mJOqVxKON0gG7Uy7vn01LwAD+95Ov+gCC9+eZa02tSIYObVBfRPSL7vf6Qf/KVTzlHEnc94INGqrHlgOkeWATTzwBv4cK/3zcOf7T4JQf6ATVxDQNPIHsibOyJPubrW9thzwmEyCGL7O95hjDxO8ZOYJ37VpT31n9sQLNxrar1qLE7wZMU/JJgBqcn4fyaz5jhJLj8rRiGvj8q/waBO/+KMZ1uWMV0Mxjayr+fRQSrTNrV/vnv/yNU28HAGx4i3+lRn/iUZYzM3vNoCxsqlMQK+/3WP9/Qznqvfep7XThm90WFWINy/ESzML1yX/Ra//y5QXmgnPkceB49KgEl7w7QugmO7Vib1/1nK32PfGffLWZpbcfotbP+5bAAKfSxO/w+m6XNMD+SWWp/4ckA28ifY33PSjYUyZHosg0FAjyoCOINVVcsAgtv/HfOdtpr/lSC81v1lN9NFrGHfhz6qZ7KrJYQLFN++zF85oTMy+4se/U8PxyaKz/cPBPc1rtkH8KDXeFq8NlCv9KlSS60WLMsL3t68N2D/z4pFPJHSEgereJnIewFTxZQzxV8S5pAX7C/bqtp/JAOkjoORhYL1OEAYQge6EGuAw+aPf2DuMvNkTLBnWi3yWDtz/Aw+/YNtEc7IwKpBppxubwdX+MU7E4yVuiYzPqA/ml2Pi99CfXguXZ9y2epGU46fNwYNpEirXkzhgAAAAA"
};

async function ensureWorldTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS city_memberships (
      telegram_id INTEGER PRIMARY KEY,
      territory_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE
    )
  `).run();
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
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS vox_grid (
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT '?',
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
  if (!colNames.has('categories_text')) await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN categories_text TEXT`).run();
  if (!colNames.has('color')) await env.DB.prepare(`ALTER TABLE customization_items ADD COLUMN color TEXT NOT NULL DEFAULT 'none'`).run();
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

async function ensureDefaultCityVisuals(env, territoryId) {
  const categoryId='default-category-marker';
  await env.DB.prepare(`INSERT OR IGNORE INTO customization_categories (id,name,created_by,created_at) VALUES (?,?,?,?)`).bind(categoryId,'Метка',0,Date.now()).run();
  const defaults=[
    ['default-marker-black','Чёрная метка',DEFAULT_MARKER_IMAGES.black,'black'],
    ['default-marker-brown','Коричневая метка',DEFAULT_MARKER_IMAGES.brown,'brown'],
    ['default-marker-white','Белая метка',DEFAULT_MARKER_IMAGES.white,'white'],
  ];
  for(const [itemId,name,image,color] of defaults){
    await env.DB.prepare(`INSERT OR IGNORE INTO customization_items (id,category_id,name,price,image_data,active,created_by,created_at,categories_text,color) VALUES (?,?,?,?,?,1,?,?,?,?)`).bind(itemId,categoryId,name,0,image,0,Date.now(),'Метка',color).run();
    await env.DB.prepare(`UPDATE customization_items SET image_data=?,active=1,categories_text='Метка',color=? WHERE id=?`).bind(image,color,itemId).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO city_items (territory_id,item_id,acquired_at,source) VALUES (?,?,?,'default')`).bind(territoryId,itemId,Date.now()).run();
  }
  await env.DB.prepare(`INSERT INTO city_customization (territory_id,marker_item_id,updated_at) VALUES (?, 'default-marker-white', ?) ON CONFLICT(territory_id) DO NOTHING`).bind(territoryId,Date.now()).run();
}
async function getCustomization(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth;
  await ensureWorldTables(env);
  const userId=Number(auth.user.id);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency (telegram_id,balance) VALUES (?,0)`).bind(userId).run();
  const founderCity=await env.DB.prepare(`SELECT id,name FROM territories WHERE owner_telegram_id=? AND status='approved' LIMIT 1`).bind(userId).first();
  const membership=await env.DB.prepare(`SELECT territory_id FROM city_memberships WHERE telegram_id=? LIMIT 1`).bind(userId).first();
  const cityId=founderCity?.id||membership?.territory_id||null;
  if(founderCity?.id)await ensureDefaultCityVisuals(env,founderCity.id);
  const [cats,items,owned,balance]=await Promise.all([
    env.DB.prepare('SELECT id,name FROM customization_categories ORDER BY name').all(),
    env.DB.prepare(`SELECT i.id,i.category_id,c.name AS category_name,i.name,i.price,i.image_data,i.categories_text,i.color,i.active FROM customization_items i JOIN customization_categories c ON c.id=i.category_id WHERE i.active=1 ORDER BY i.created_at DESC`).all(),
    env.DB.prepare('SELECT item_id,source,acquired_at FROM user_items WHERE telegram_id=?').bind(userId).all(),
    env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first(),
  ]);
  const itemMap=new Map((items.results||[]).map(i=>[i.id,i]));
  const myItems=(owned.results||[]).map(x=>({...x,...(itemMap.get(x.item_id)||{})}));
  let cityInventory=[],equippedMarkerItemId=null;
  if(cityId){
    const city=await env.DB.prepare('SELECT marker_item_id FROM city_customization WHERE territory_id=?').bind(cityId).first();
    equippedMarkerItemId=city?.marker_item_id||'default-marker-white';
    const ownerRow=await env.DB.prepare('SELECT owner_telegram_id FROM territories WHERE id=?').bind(cityId).first();
    const members=await env.DB.prepare('SELECT telegram_id FROM city_memberships WHERE territory_id=?').bind(cityId).all();
    const ids=[Number(ownerRow?.owner_telegram_id||0),...(members.results||[]).map(x=>Number(x.telegram_id))].filter(Boolean);
    const ph=ids.map(()=>'?').join(',')||'NULL';
    const [cityOnly,userOwned]=await Promise.all([
      env.DB.prepare(`SELECT ci.territory_id,ci.item_id,i.name,i.image_data,c.name AS category_name,ci.source FROM city_items ci JOIN customization_items i ON i.id=ci.item_id JOIN customization_categories c ON c.id=i.category_id WHERE ci.territory_id=? AND lower(c.name)='метка'`).bind(cityId).all(),
      ids.length?env.DB.prepare(`SELECT ui.telegram_id,ui.item_id,i.name,i.image_data,c.name AS category_name,ui.source FROM user_items ui JOIN customization_items i ON i.id=ui.item_id JOIN customization_categories c ON c.id=i.category_id WHERE ui.telegram_id IN (${ph}) AND lower(c.name)='метка'`).bind(...ids).all():Promise.resolve({results:[]}),
    ]);
    cityInventory=[...(cityOnly.results||[]),...(userOwned.results||[])].filter((x,i,a)=>a.findIndex(y=>y.item_id===x.item_id)===i);
  }
  return json({ok:true,balance:Number(balance?.balance||0),categories:cats.results||[],items:items.results||[],owned:owned.results||[],myItems,cityId,cityRole:founderCity?'founder':membership?'resident':null,cityInventory,equippedMarkerItemId});
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

async function createCustomizationItem(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const name = String(body?.name || '').trim();
  const categories = Array.isArray(body?.categories) ? body.categories.map(x=>String(x||'').trim()).filter(Boolean) : String(body?.categories||body?.category||'').split(',').map(x=>x.trim()).filter(Boolean);
  const price = Number(body?.price);
  const imageData = String(body?.imageData || '').trim();
  const color = String(body?.color || 'none').trim().toLowerCase();
  const allowedColors = new Set(['none','red','orange','yellow','green','turquoise','blue','purple','magenta','white','black','brown']);
  if (!name || !categories.length || !Number.isSafeInteger(price) || price < 0) return json({ ok: false, error: 'Название, категории и корректная цена обязательны' }, 400);
  if (!allowedColors.has(color)) return json({ ok:false,error:'Некорректный цвет' },400);
  if (imageData && imageData.length > 1_200_000) return json({ ok: false, error: 'Изображение слишком большое' }, 413);
  if (categories.some(c=>c.toLowerCase()==='метка')) {
    if (!imageData.startsWith('data:image/')) return json({ ok: false, error: 'Для категории «Метка» нужно изображение 216×240' }, 400);
    const dim = imageDimensions(imageData);
    if (!dim || dim.width !== 216 || dim.height !== 240) return json({ ok: false, error: 'Для категории «Метка» изображение должно быть ровно 216×240' }, 400);
  }
  const categoryIds=[];
  for(const categoryName of categories){
    const existing=await env.DB.prepare('SELECT id FROM customization_categories WHERE lower(name)=lower(?)').bind(categoryName).first();
    const categoryId=existing?.id||crypto.randomUUID();
    if(!existing) await env.DB.prepare('INSERT INTO customization_categories (id,name,created_by,created_at) VALUES (?,?,?,?)').bind(categoryId,categoryName,Number(auth.user.id),Date.now()).run();
    categoryIds.push(categoryId);
  }
  const itemId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO customization_items (id,category_id,name,price,image_data,active,created_by,created_at,categories_text,color) VALUES (?,?,?,?,?,1,?,?,?,?,?)`).bind(itemId,categoryIds[0],name,price,imageData||null,Number(auth.user.id),Date.now(),categories.join(', '),color).run();
  return json({ ok:true,item:{id:itemId,category_id:categoryIds[0],categories_text:categories.join(', '),name,price,image_data:imageData||null,color} });
}
async function deleteCustomizationItem(request, env, itemId) {
  const auth=await requireMainInspector(request,env); if(auth.error)return auth;
  await ensureWorldTables(env);
  const id=String(itemId||'').trim();
  if(!id||id.startsWith('default-marker-'))return json({ok:false,error:'Эту метку удалить нельзя'},400);
  const item=await env.DB.prepare('SELECT id FROM customization_items WHERE id=?').bind(id).first();
  if(!item)return json({ok:false,error:'Визуал не найден'},404);
  await env.DB.prepare(`UPDATE city_customization SET marker_item_id='default-marker-white',updated_at=? WHERE marker_item_id=?`).bind(Date.now(),id).run();
  await env.DB.prepare(`DELETE FROM city_items WHERE item_id=?`).bind(id).run();
  await env.DB.prepare(`UPDATE customization_items SET active=0 WHERE id=?`).bind(id).run();
  return json({ok:true});
}
async function purchaseCustomizationItem(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  const userId = Number(auth.user.id);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const itemId = String(body?.itemId || '').trim();
  const item = await env.DB.prepare('SELECT id, price FROM customization_items WHERE id = ? AND active = 1').bind(itemId).first();
  if (!item) return json({ ok: false, error: 'Товар не найден' }, 404);
  if (String(itemId).startsWith('default-marker-')) return json({ ok: false, error: 'Обычные метки не продаются' }, 400);
  const already = await env.DB.prepare('SELECT item_id FROM user_items WHERE telegram_id = ? AND item_id = ?').bind(userId, itemId).first();
  if (already) return json({ ok: true, alreadyOwned: true });
  await env.DB.prepare('INSERT OR IGNORE INTO user_currency (telegram_id, balance) VALUES (?, 0)').bind(userId).run();
  const balance = await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id = ?').bind(userId).first();
  if (Number(balance?.balance || 0) < Number(item.price)) return json({ ok: false, error: 'Недостаточно игровой валюты' }, 400);
  const charged = await env.DB.prepare('UPDATE user_currency SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?').bind(Number(item.price), userId, Number(item.price)).run();
  if (!charged.meta?.changes) return json({ ok: false, error: 'Недостаточно игровой валюты' }, 400);
  await env.DB.prepare('INSERT INTO user_items (telegram_id, item_id, acquired_at, source) VALUES (?, ?, ?, \'purchase\')').bind(userId, itemId, Date.now()).run();
  return json({ ok: true, balance: Number(balance.balance) - Number(item.price) });
}

async function updateCityCustomization(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),markerItemId=body?.markerItemId?String(body.markerItemId):null;
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(String(territory.owner_telegram_id||'')!==String(auth.user.id))return json({ok:false,error:'Только основатель/мэр может менять оформление города'},403);
  await ensureDefaultCityVisuals(env,territoryId);
  if(!markerItemId)return json({ok:false,error:'Нужно выбрать визуал'},400);
  const item=await env.DB.prepare(`SELECT i.id FROM customization_items i JOIN customization_categories c ON c.id=i.category_id WHERE i.id=? AND i.active=1 AND lower(c.name)='метка'`).bind(markerItemId).first();
  if(!item)return json({ok:false,error:'Метка не найдена'},404);
  const allowed=await env.DB.prepare(`SELECT 1 FROM city_items WHERE territory_id=? AND item_id=? UNION SELECT 1 FROM user_items ui JOIN city_memberships cm ON cm.telegram_id=ui.telegram_id WHERE cm.territory_id=? AND ui.item_id=? UNION SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=? LIMIT 1`).bind(territoryId,markerItemId,territoryId,markerItemId,Number(auth.user.id),markerItemId).first();
  if(!allowed)return json({ok:false,error:'Этот визуал недоступен вашему городу'},403);
  await env.DB.prepare(`INSERT INTO city_customization(territory_id,marker_item_id,updated_at) VALUES(?,?,?) ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at`).bind(territoryId,markerItemId,Date.now()).run();
  return json({ok:true,markerItemId});
}
async function inviteResident(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  let body; try { body = await request.json(); } catch { return json({ ok:false,error:'Invalid JSON' },400); }
  const territoryId=String(body?.territoryId||'').trim(), nickname=normalizeMcNickname(body?.nickname);
  if(!territoryId||!nickname) return json({ok:false,error:'territoryId и ник обязательны'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory||String(territory.owner_telegram_id)!==String(auth.user.id)) return json({ok:false,error:'Только основатель/мэр может приглашать жителей'},403);
  const target=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE lower(mc_nickname)=lower(?) LIMIT 1`).bind(nickname).first();
  if(!target) {
    const inviteId=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO city_invites (id,territory_id,target_telegram_id,target_nickname,invited_by,invite_type,status,created_at) VALUES (?,?,NULL,?,?, 'join','pending',?)`).bind(inviteId,territoryId,nickname,Number(auth.user.id),Date.now()).run();
    return json({ok:true,pendingNickname:true,inviteId,message:'Приглашение сохранено. Оно будет отправлено после подтверждения этого никнейма.'});
  }
  if(String(target.telegram_id)===String(auth.user.id)) return json({ok:false,error:'Нельзя пригласить самого себя'},400);
  const founderCity=await env.DB.prepare(`SELECT id FROM territories WHERE owner_telegram_id=? AND status='approved' LIMIT 1`).bind(Number(target.telegram_id)).first();
  if(founderCity) return json({ok:false,error:'Этот игрок является основателем/мэром другого города'},400);
  const membership=await env.DB.prepare('SELECT territory_id FROM city_memberships WHERE telegram_id=?').bind(Number(target.telegram_id)).first();
  const inviteType=membership?'transfer':'join';
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

async function getCityManagement(request, env, url) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  const territoryId = String(url.searchParams.get('territoryId') || '').trim();
  const territory = await env.DB.prepare('SELECT id, name, owner_telegram_id FROM territories WHERE id = ? AND status = \'approved\'').bind(territoryId).first();
  if (!territory) return json({ ok: false, error: 'City not found' }, 404);
  const ownerId = Number(territory.owner_telegram_id || 0);
  const [members, invites] = await Promise.all([
    env.DB.prepare(`SELECT cm.telegram_id, u.mc_nickname, u.telegram_username, cm.joined_at FROM city_memberships cm LEFT JOIN users u ON u.telegram_id = cm.telegram_id WHERE cm.territory_id = ? ORDER BY cm.joined_at ASC`).bind(territoryId).all(),
    env.DB.prepare(`SELECT ci.id, ci.target_telegram_id, ci.target_nickname, ci.invite_type, ci.created_at FROM city_invites ci WHERE ci.territory_id = ? AND ci.status = 'pending' ORDER BY ci.created_at DESC`).bind(territoryId).all(),
  ]);
  return json({ ok: true, owner: String(auth.user.id) === String(ownerId), members: members.results || [], invites: invites.results || [] });
}

async function cancelResidentInvite(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  await ensureWorldTables(env);
  let body; try { body = await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
  const inviteId=String(body?.inviteId||'').trim();
  const invite=await env.DB.prepare(`SELECT ci.id FROM city_invites ci JOIN territories t ON t.id=ci.territory_id WHERE ci.id=? AND ci.status='pending' AND t.owner_telegram_id=?`).bind(inviteId,Number(auth.user.id)).first();
  if(!invite)return json({ok:false,error:'Приглашение не найдено'},404);
  await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE id=?`).bind(Date.now(),inviteId).run();
  return json({ok:true});
}

async function removeResident(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(), targetId=Number(body?.telegramId);
  if(!territoryId||!Number.isSafeInteger(targetId)||targetId<=0)return json({ok:false,error:'territoryId и telegramId обязательны'},400);
  const territory=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory||String(territory.owner_telegram_id)!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare('DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?').bind(territoryId,targetId).run();
  const current=await env.DB.prepare('SELECT marker_item_id FROM city_customization WHERE territory_id=?').bind(territoryId).first();
  await ensureDefaultCityVisuals(env,territoryId);if(current?.marker_item_id){const ownedByMember=await env.DB.prepare('SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=?').bind(targetId,current.marker_item_id).first();if(ownedByMember) await env.DB.prepare(`UPDATE city_customization SET marker_item_id='default-marker-white',updated_at=? WHERE territory_id=?`).bind(Date.now(),territoryId).run();}
  return json({ok:true});
}

async function handleResidentInviteCallback(env, callbackQuery) {
  const [action, inviteId] = String(callbackQuery.data || '').split(':');
  if (!inviteId || !['resident_accept', 'resident_reject'].includes(action)) return json({ ok: true });
  await ensureWorldTables(env);
  const actorId = Number(callbackQuery.from?.id);
  const invite = await env.DB.prepare(`SELECT * FROM city_invites WHERE id = ? AND target_telegram_id = ? AND status = 'pending'`).bind(inviteId, actorId).first();
  if (!invite) {
    await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Приглашение уже обработано', show_alert: true });
    return json({ ok: true });
  }
  if (action === 'resident_reject') {
    await env.DB.prepare('UPDATE city_invites SET status = \'rejected\', responded_at = ? WHERE id = ?').bind(Date.now(), inviteId).run();
    await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Приглашение отклонено' });
  } else {
    const founder = await env.DB.prepare('SELECT id FROM territories WHERE owner_telegram_id = ? AND status = \'approved\' LIMIT 1').bind(actorId).first();
    if (founder) {
      await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Вы являетесь основателем/мэром города', show_alert: true });
      return json({ ok: true });
    }
    const oldMembership=await env.DB.prepare('SELECT territory_id FROM city_memberships WHERE telegram_id=?').bind(actorId).first();
    if(oldMembership?.territory_id){
      const oldCustomization=await env.DB.prepare('SELECT marker_item_id FROM city_customization WHERE territory_id=?').bind(oldMembership.territory_id).first();
      if(oldCustomization?.marker_item_id){
        const ownedByLeavingMember=await env.DB.prepare('SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=?').bind(actorId,oldCustomization.marker_item_id).first();
        if(ownedByLeavingMember) await env.DB.prepare(`UPDATE city_customization SET marker_item_id='default-marker-white',updated_at=? WHERE territory_id=?`).bind(Date.now(),oldMembership.territory_id).run();
      }
    }
    await env.DB.prepare('DELETE FROM city_memberships WHERE telegram_id = ?').bind(actorId).run();
    await env.DB.prepare('INSERT INTO city_memberships (telegram_id, territory_id, joined_at) VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET territory_id = excluded.territory_id, joined_at = excluded.joined_at').bind(actorId, invite.territory_id, Date.now()).run();
    await env.DB.prepare('UPDATE city_invites SET status = \'accepted\', responded_at = ? WHERE id = ?').bind(Date.now(), inviteId).run();
    await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Вы присоединились к городу' });
  }
  try { await telegram(env, 'editMessageReplyMarkup', { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
  return json({ ok: true });
}

async function notifyPendingInvitesForUser(env, userId) {
  await ensureWorldTables(env);
  const user = await env.DB.prepare('SELECT telegram_id, mc_nickname, status FROM users WHERE telegram_id = ?').bind(Number(userId)).first();
  if (!user?.mc_nickname) return;
  await env.DB.prepare(`UPDATE city_invites SET target_telegram_id = ? WHERE target_telegram_id IS NULL AND lower(target_nickname) = lower(?) AND status = 'pending'`).bind(Number(userId), user.mc_nickname).run();
  if (user.status !== 'verified') return;
  const invites = await env.DB.prepare(`SELECT ci.*, t.name AS city_name FROM city_invites ci JOIN territories t ON t.id = ci.territory_id WHERE ci.target_telegram_id = ? AND ci.status = 'pending'`).bind(Number(userId)).all();
  for (const invite of invites.results || []) await sendResidentInvite(env, invite, invite.city_name);
}

async function getCityCustomizationData(request, env, url) {
  const auth=await requireUser(request,env); if(auth.error)return auth; await ensureWorldTables(env);
  const territoryId=String(url.searchParams.get('territoryId')||'').trim();
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(String(territory.owner_telegram_id||'')!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
  await ensureDefaultCityVisuals(env,territoryId);
  const city=await env.DB.prepare('SELECT marker_item_id FROM city_customization WHERE territory_id=?').bind(territoryId).first();
  const members=await env.DB.prepare('SELECT telegram_id FROM city_memberships WHERE territory_id=?').bind(territoryId).all();
  const ids=[Number(territory.owner_telegram_id),...(members.results||[]).map(r=>Number(r.telegram_id))].filter(Boolean),ph=ids.map(()=>'?').join(',')||'NULL';
  const [cityItems,userItems]=await Promise.all([
    env.DB.prepare(`SELECT ci.item_id,i.name,i.image_data,c.name AS category_name,ci.source FROM city_items ci JOIN customization_items i ON i.id=ci.item_id JOIN customization_categories c ON c.id=i.category_id WHERE ci.territory_id=?`).bind(territoryId).all(),
    env.DB.prepare(`SELECT ui.telegram_id,ui.item_id,i.name,i.image_data,c.name AS category_name,ui.source FROM user_items ui JOIN customization_items i ON i.id=ui.item_id JOIN customization_categories c ON c.id=i.category_id WHERE ui.telegram_id IN (${ph})`).bind(...ids).all(),
  ]);
  return json({ok:true,markerItemId:city?.marker_item_id||'default-marker-white',availableMarkers:[...(cityItems.results||[]),...(userItems.results||[])]});
}
async function getTerritories(env) {
  try{
    await ensureRecruitmentTable(env);await ensureWorldTables(env);
    const [result,members,comments,screens]=await Promise.all([
      env.DB.prepare(`SELECT t.*,r.description AS recruitment_description,COALESCE(r.enabled,0) AS recruitment_enabled,cc.marker_item_id,mi.name AS marker_name,mi.image_data AS marker_image,ou.mc_nickname AS owner_mc_nickname FROM territories t LEFT JOIN recruitment r ON r.territory_id=t.id LEFT JOIN city_customization cc ON cc.territory_id=t.id LEFT JOIN customization_items mi ON mi.id=cc.marker_item_id LEFT JOIN users ou ON ou.telegram_id=t.owner_telegram_id WHERE t.status='approved' ORDER BY t.created_at DESC`).all(),
      env.DB.prepare(`SELECT cm.territory_id,cm.telegram_id,u.mc_nickname,u.telegram_username FROM city_memberships cm LEFT JOIN users u ON u.telegram_id=cm.telegram_id ORDER BY cm.joined_at ASC`).all(),
      env.DB.prepare(`SELECT c.id,c.territory_id,c.telegram_id,c.telegram_username,u.mc_nickname,c.text,c.role,c.created_at,cr.text AS reply_text FROM comments c LEFT JOIN users u ON u.telegram_id=c.telegram_id LEFT JOIN comment_replies cr ON cr.comment_id=c.id ORDER BY CASE WHEN c.role IN ('inspector','main_inspector') THEN 0 ELSE 1 END,c.created_at DESC`).all(),
      env.DB.prepare(`SELECT id,territory_id,telegram_id,telegram_username,status,created_at FROM screenshots WHERE status='approved' ORDER BY created_at DESC`).all(),
      env.DB.prepare(`SELECT territory_id,AVG(CASE WHEN role IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS curator,AVG(CASE WHEN role NOT IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS community,SUM(CASE WHEN role NOT IN ('inspector','main_inspector') THEN 1 ELSE 0 END) AS votes FROM ratings GROUP BY territory_id`).all(),
    ]);
    const byCity={},commentsByCity={},screensByCity={},scoresByCity={};for(const m of members.results||[])(byCity[m.territory_id]||=[]).push(m);for(const c of comments.results||[])(commentsByCity[c.territory_id]||=[]).push({...c,author:c.mc_nickname||c.telegram_username||`id${c.telegram_id}`,reply:c.reply_text||null,likes:0,dislikes:0});for(const s of screens.results||[])(screensByCity[s.territory_id]||=[]).push({...s,author:s.telegram_username?`@${String(s.telegram_username).replace(/^@/,'')}`:`id${s.telegram_id}`,url:`/api/screenshots/${s.id}`});for(const r of ratings.results||[])scoresByCity[r.territory_id]={curator:Number(r.curator||0),community:Number(r.community||0),votes:Number(r.votes||0)};
    const territories=(result.results||[]).map(row=>{const parsed=parseRequestCoords(row.coords),ms=byCity[row.id]||[],sc=scoresByCity[row.id]||{};let x=null,y=null;if(parsed){x=((parsed.x+2000)/4000)*100;y=((parsed.z+2000)/4000)*100}return {...row,x,y,vox_x:parsed?.x??null,vox_z:parsed?.z??null,curator:Number(sc.curator??row.curator_score??0),community:Number(sc.community??row.community_score??0),votes:Number(sc.votes??row.votes??0),owner:normalizeUsername(row.owner_telegram_username||row.owner_input)||row.owner_input||'Неизвестно',residents:ms.map(m=>m.mc_nickname).filter(Boolean),resident_telegram_ids:ms.map(m=>Number(m.telegram_id)),resident_count:ms.length,reviews:commentsByCity[row.id]||[],screenshots:screensByCity[row.id]||[],marker_url:row.marker_image||null}});
    return json({ok:true,territories});
  }catch(error){console.error('GET territories error:',error);return json({ok:false,error:'Database error',details:String(error)},500)}
}
async function createTerritory(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const initData = String(body?.initData || "").trim();
  const user = await verifyInitData(initData, String(env.BOT_TOKEN || "").trim());
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const name = String(body?.name || "").trim();
  const owner = String(body?.owner || "").trim();
  const coords = String(body?.coords || "").trim();
  const parsedRequestCoords = parseTwoCoordinates(coords);
  if (!name || !owner || !parsedRequestCoords) {
    return json({ ok: false, error: "Название, username основателя/мэра и координаты X Z (2 числа) обязательны" }, 400);
  }

  const id = crypto.randomUUID();
  const username = String(user.username || "").trim();
  const createdAt = Date.now();

  try {
    await env.DB.prepare(`
      INSERT INTO territories
      (id, name, owner_input, coords, requested_by_id, requested_by_username,
       owner_telegram_id, owner_telegram_username, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, name, owner, coords, Number(user.id), username,
      null, normalizeUsername(owner).replace(/^@/, '') || null, "pending", createdAt
    ).run();
  } catch (error) {
    console.error("INSERT territory error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }

  const inspectorChatId = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (!inspectorChatId) {
    return json({ ok: false, error: "INSPECTOR_CHAT_ID is not configured" }, 500);
  }

  const parsed = parsedRequestCoords;

  const text =
    `🏙 Новая заявка на территорию\n\n` +
    `<code>${escapeHtml(name)}</code>\n\n` +
    `${escapeHtml(normalizeUsername(owner) || owner)}\n\n` +
    `<code>${escapeHtml(formatCoordinatePair(parsed.x, parsed.z))}</code>\n\n` +
    `🙋 Заявитель: ${normalizeUsername(username) || "—"}\n` +
    `Telegram ID: <code>${escapeHtml(user.id)}</code>\n\n` +
    `Выберите действие:`;

  try {
    const { response, data } = await telegram(env, "sendMessage", {
      chat_id: inspectorChatId,
      parse_mode: "HTML",
      text,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Одобрить", callback_data: `territory_ok:${id}` },
          { text: "❌ Отклонить", callback_data: `territory_no:${id}` },
        ]],
      },
    });
    if (!response.ok || !data.ok) {
      console.error("Telegram territory notification error:", data);
      return json({ ok: false, error: "Telegram error", telegram: data }, 502);
    }
  } catch (error) {
    console.error("Telegram notification error:", error);
    return json({ ok: false, error: "Failed to send Telegram notification", details: String(error) }, 502);
  }

  return json({
    ok: true,
    message: "Territory request created",
    id,
    status: "pending",
    user: { id: user.id, username: username || null },
  });
}

async function getMe(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  const user = auth.user;
  const role = await getRoleByTelegramId(env, user.id);
  try {
    const uname = String(user.username || '').replace(/^@+/, '').trim();
    if (uname) {
      const candidate = await env.DB.prepare(`SELECT id FROM territories WHERE status='approved' AND owner_telegram_id IS NULL AND lower(replace(owner_input,'@',''))=lower(?) LIMIT 1`).bind(uname).first();
      if (candidate) {
        const otherFounder = await env.DB.prepare(`SELECT id FROM territories WHERE owner_telegram_id=? AND status='approved' LIMIT 1`).bind(Number(user.id)).first();
        const membership = await env.DB.prepare(`SELECT territory_id FROM city_memberships WHERE telegram_id=?`).bind(Number(user.id)).first().catch(()=>null);
        if (!otherFounder && !membership) await env.DB.prepare(`UPDATE territories SET owner_telegram_id=?, owner_telegram_username=? WHERE id=? AND owner_telegram_id IS NULL`).bind(Number(user.id), uname, candidate.id).run();
      }
    }
  } catch (e) { console.error('Auto-claim founder error:', e); }

  let profile = await env.DB.prepare(
    "SELECT telegram_id, telegram_username, mc_nickname, status FROM users WHERE telegram_id = ?"
  ).bind(Number(user.id)).first();

  await ensureWorldTables(env);
  const founderCity=await env.DB.prepare(`SELECT id,name FROM territories WHERE owner_telegram_id=? AND status='approved' LIMIT 1`).bind(Number(user.id)).first();
  const residentCity=await env.DB.prepare(`SELECT t.id,t.name FROM city_memberships cm JOIN territories t ON t.id=cm.territory_id WHERE cm.telegram_id=? AND t.status='approved' LIMIT 1`).bind(Number(user.id)).first();
  return json({
    ok: true,
    city: founderCity?{id:founderCity.id,name:founderCity.name,role:'founder'}:residentCity?{id:residentCity.id,name:residentCity.name,role:'resident'}:null,
    user: {
      id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
    },
    role,
    profile: profile || null,
  });
}

async function listInspectors(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  const rows = await env.DB.prepare(`
    SELECT telegram_id, telegram_username, added_by, created_at
    FROM inspectors
    ORDER BY created_at ASC
  `).all();

  return json({ ok: true, inspectors: rows.results || [] });
}

async function addInspector(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  let telegramId = Number(body?.telegramId);
  const usernameInput = String(body?.username || '').trim().replace(/^@+/, '');
  if ((!Number.isSafeInteger(telegramId) || telegramId <= 0) && !usernameInput) return json({ ok: false, error: 'Укажите Telegram ID или username' }, 400);
  if ((!Number.isSafeInteger(telegramId) || telegramId <= 0) && usernameInput) {
    const found = await env.DB.prepare(`SELECT telegram_id, telegram_username FROM users WHERE lower(replace(telegram_username, '@', '')) = lower(?) LIMIT 1`).bind(usernameInput).first();
    if (!found) return json({ ok: false, error: 'Пользователь с таким username ещё не запускал бота или не найден. Для первого добавления используйте Telegram ID.' }, 404);
    telegramId = Number(found.telegram_id);
  }
  if (String(telegramId) === String(env.INSPECTOR_CHAT_ID || '').trim()) return json({ ok: false, error: 'Главный инспектор уже имеет эту роль' }, 400);
  const username = usernameInput || (await env.DB.prepare('SELECT telegram_username FROM users WHERE telegram_id = ?').bind(telegramId).first())?.telegram_username || '';
  await env.DB.prepare(`INSERT INTO inspectors (telegram_id, telegram_username, added_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`).bind(telegramId, username || null, Number(auth.user.id), Date.now()).run();
  return json({ ok: true, telegramId, username: username || null });
}

async function removeInspector(request, env, url) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  const telegramId = Number(url.pathname.split("/").pop());
  if (!Number.isSafeInteger(telegramId)) {
    return json({ ok: false, error: "Invalid Telegram ID" }, 400);
  }

  await env.DB.prepare("DELETE FROM inspectors WHERE telegram_id = ?")
    .bind(telegramId).run();

  return json({ ok: true });
}

async function claimNickname(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const nickname = String(body?.nickname || "").trim();
  if (!nickname) return json({ ok: false, error: "Nickname is required" }, 400);

  try {
    await env.DB.prepare(`
      INSERT INTO users (telegram_id, telegram_username, mc_nickname, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        telegram_username = excluded.telegram_username,
        mc_nickname = excluded.mc_nickname,
        status = 'pending'
    `).bind(Number(auth.user.id), auth.user.username || null, nickname, Date.now()).run();

    const inspectorChatId = String(env.INSPECTOR_CHAT_ID || "").trim();
    if (!inspectorChatId) return json({ ok: false, error: "INSPECTOR_CHAT_ID is not configured" }, 500);

    const username = normalizeUsername(auth.user.username) || "без username";
    const text =
      `🧑 Новая заявка на регистрацию\n\n` +
      `🎮 Никнейм\n<code>${escapeHtml(nickname)}</code>\n\n` +
      `👤 ${escapeHtml(username)}\n` +
      `Telegram ID: <code>${escapeHtml(auth.user.id)}</code>\n\n` +
      `Выберите действие:`;

    const sent = await telegram(env, "sendMessage", {
      chat_id: inspectorChatId, parse_mode: "HTML", text,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: `nickname_ok:${auth.user.id}` },
        { text: "❌ Отклонить", callback_data: `nickname_no:${auth.user.id}` },
      ]] },
    });
    if (!sent.response.ok || !sent.data.ok) {
      console.error("Telegram nickname notification error:", sent.data);
      return json({ ok: false, error: "Не удалось отправить заявку инспектору", telegram: sent.data }, 502);
    }
    return json({ ok: true, status: "pending" });
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ ok: false, error: "Этот ник уже привязан к другому Telegram аккаунту" }, 409);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}

async function claimTerritoryOwner(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const territoryId = String(body?.territoryId || '').trim();
  if (!territoryId) return json({ ok: false, error: 'territoryId is required' }, 400);
  const territory = await env.DB.prepare(`SELECT id, owner_input, owner_telegram_id FROM territories WHERE id = ? AND status = 'approved'`).bind(territoryId).first();
  if (!territory) return json({ ok: false, error: 'City not found' }, 404);
  if (territory.owner_telegram_id && String(territory.owner_telegram_id) !== String(auth.user.id)) return json({ ok: false, error: 'City already has another founder/mayor' }, 403);
  const existingFounder = await env.DB.prepare(`SELECT id FROM territories WHERE owner_telegram_id = ? AND status = 'approved' AND id != ? LIMIT 1`).bind(Number(auth.user.id), territoryId).first();
  if (existingFounder) return json({ ok: false, error: 'Вы уже являетесь основателем/мэром другого города' }, 409);
  const resident = await env.DB.prepare('SELECT territory_id FROM city_memberships WHERE telegram_id = ?').bind(Number(auth.user.id)).first();
  if (resident && String(resident.territory_id) !== territoryId) return json({ ok: false, error: 'Вы уже житель другого города' }, 409);
  await env.DB.prepare(`UPDATE territories SET owner_telegram_id = ?, owner_telegram_username = ? WHERE id = ?`).bind(Number(auth.user.id), auth.user.username || null, territoryId).run();
  return json({ ok: true });
}

async function saveRating(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),values=['integrity','comfort','atmosphere','detail'],scores=values.map(key=>Number(body?.[key]));
  if(!territoryId||scores.some(v=>!Number.isFinite(v)||v<1||v>5||!Number.isInteger(v)))return json({ok:false,error:'Invalid rating'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();if(!territory)return json({ok:false,error:'City not found'},404);
  const founder=await env.DB.prepare(`SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=? AND status='approved'`).bind(territoryId,Number(auth.user.id)).first();
  const resident=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,Number(auth.user.id)).first();
  if(founder||resident)return json({ok:false,error:'Основатель/мэр и жители города не могут оценивать свой город'},403);
  const role=await getRoleByTelegramId(env,auth.user.id);
  const before=await env.DB.prepare(`SELECT AVG(CASE WHEN role IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS curator,AVG(CASE WHEN role NOT IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS community FROM ratings WHERE territory_id=?`).bind(territoryId).first();
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO ratings (id,territory_id,telegram_id,role,integrity,comfort,atmosphere,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(territory_id,telegram_id) DO UPDATE SET role=excluded.role,integrity=excluded.integrity,comfort=excluded.comfort,atmosphere=excluded.atmosphere,detail=excluded.detail,created_at=excluded.created_at`).bind(id,territoryId,Number(auth.user.id),role,...scores,Date.now()).run();
  const after=await env.DB.prepare(`SELECT AVG(CASE WHEN role IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS curator,AVG(CASE WHEN role NOT IN ('inspector','main_inspector') THEN (integrity+comfort+atmosphere+detail)*0.5 END) AS community FROM ratings WHERE territory_id=?`).bind(territoryId).first();
  const oldCurator=Number(before?.curator||0),newCurator=Number(after?.curator||0),oldCommunity=Number(before?.community||0),newCommunity=Number(after?.community||0);
  let founderId=Number(territory.owner_telegram_id||0);
  if(!founderId&&territory.owner_telegram_username){const owner=await env.DB.prepare(`SELECT telegram_id FROM users WHERE lower(replace(telegram_username,'@',''))=lower(?) AND status='verified' LIMIT 1`).bind(String(territory.owner_telegram_username).replace(/^@/,'')).first();if(owner){founderId=Number(owner.telegram_id);await env.DB.prepare(`UPDATE territories SET owner_telegram_id=? WHERE id=? AND owner_telegram_id IS NULL`).bind(founderId,territoryId).run();}}
  const curatorChanged=Math.abs(newCurator-oldCurator)>=0.5,communityChanged=Math.abs(newCommunity-oldCommunity)>=0.5;
  if(founderId&&String(founderId)!==String(auth.user.id)&&(curatorChanged||communityChanged)){
    try{const changes=[];if(curatorChanged)changes.push(`Инспектор: ${oldCurator.toFixed(1)} → ${newCurator.toFixed(1)}`);if(communityChanged)changes.push(`Игроки: ${oldCommunity.toFixed(1)} → ${newCommunity.toFixed(1)}`);await telegram(env,'sendMessage',{chat_id:founderId,text:`⭐ Оценка города изменилась\n\n🏙 ${escapeHtml(territory.name)}\n${changes.join('\n')}`,parse_mode:'HTML'});}catch(error){console.error('Founder rating notification error:',error)}
  }
  return json({ok:true,community:newCommunity,curator:newCurator});
}
async function getRatings(request, env, url) {
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT id, telegram_id, role, integrity, comfort, atmosphere, detail, created_at
    FROM ratings WHERE territory_id = ? ORDER BY created_at DESC
  `).bind(territoryId).all();

  return json({ ok: true, ratings: rows.results || [] });
}

async function addComment(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  const text = String(body?.text || "").trim();
  if (!territoryId || !text) return json({ ok: false, error: "territoryId and text are required" }, 400);
  if (text.length > 4000) return json({ ok: false, error: "Comment is too long" }, 400);

  const territory = await env.DB.prepare(`
    SELECT id, name, owner_telegram_id, owner_telegram_username, requested_by_id, requested_by_username
    FROM territories WHERE id = ? AND status = 'approved'
  `).bind(territoryId).first();
  if (!territory) return json({ ok: false, error: "City not found" }, 404);

  const role = await getRoleByTelegramId(env, auth.user.id);
  const username = normalizeUsername(auth.user.username) || `id${auth.user.id}`;

  await env.DB.prepare(`
    INSERT INTO comments
    (id, territory_id, telegram_id, telegram_username, text, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), territoryId, Number(auth.user.id),
    username, text, role, Date.now()
  ).run();

  // Инспекторские комментарии не отправляются как обычные пользовательские уведомления.
  // Для обычного комментария уведомляем основателя/мэра строго заданным текстом.
  if (role === "user") {
    let founderId = Number(territory.owner_telegram_id || 0);
    if (!founderId && territory.owner_telegram_username) {
      const owner = await env.DB.prepare(`SELECT telegram_id FROM users WHERE lower(replace(telegram_username,'@',''))=lower(?) AND status='verified' LIMIT 1`).bind(String(territory.owner_telegram_username).replace(/^@/, '')).first();
      if (owner) { founderId = Number(owner.telegram_id); await env.DB.prepare(`UPDATE territories SET owner_telegram_id=? WHERE id=? AND owner_telegram_id IS NULL`).bind(founderId, territoryId).run(); }
    }
    if (founderId && String(founderId) !== String(auth.user.id)) {
      try {
        await telegram(env, "sendMessage", {
          chat_id: founderId,
          text:
            `💬 Новый комментарий\n\n` +
            `👤 ${escapeHtml(username)} оставил комментарий на странице вашего города`,
          parse_mode: "HTML",
        });
      } catch (error) {
        console.error("Founder comment notification error:", error);
      }
    }
  }

  return json({ ok: true });
}

async function replyToComment(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth;let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const commentId=String(body?.commentId||'').trim(),text=String(body?.text||'').trim();if(!commentId||!text)return json({ok:false,error:'commentId и text обязательны'},400);
  const c=await env.DB.prepare(`SELECT t.owner_telegram_id FROM comments c JOIN territories t ON t.id=c.territory_id WHERE c.id=?`).bind(commentId).first();if(!c||String(c.owner_telegram_id||'')!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare(`INSERT INTO comment_replies(comment_id,telegram_id,text,created_at) VALUES(?,?,?,?) ON CONFLICT(comment_id) DO UPDATE SET telegram_id=excluded.telegram_id,text=excluded.text,created_at=excluded.created_at`).bind(commentId,Number(auth.user.id),text,Date.now()).run();return json({ok:true,reply:text});
}

async function getComments(request, env, url) {
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT c.id,c.telegram_id,c.telegram_username,u.mc_nickname,c.text,c.role,c.created_at,cr.text AS reply_text
    FROM comments c LEFT JOIN users u ON u.telegram_id=c.telegram_id LEFT JOIN comment_replies cr ON cr.comment_id=c.id
    WHERE c.territory_id = ?
    ORDER BY CASE WHEN c.role IN ('inspector','main_inspector') THEN 0 ELSE 1 END,c.created_at DESC
  `).bind(territoryId).all();

  return json({ ok: true, comments: rows.results || [] });
}

async function uploadScreenshot(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth;const user=auth.user;let form;try{form=await request.formData()}catch(error){return json({ok:false,error:'Не удалось прочитать изображение',details:String(error)},400)}
  const territoryId=String(form.get('territoryId')||'').trim(),file=form.get('photo');if(!territoryId||!(file instanceof File))return json({ok:false,error:'territoryId and photo are required'},400);if(!String(file.type||'').startsWith('image/'))return json({ok:false,error:'Only images are allowed'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();if(!territory)return json({ok:false,error:'City not found'},404);
  const role=await getRoleByTelegramId(env,user.id);
  let founderId=Number(territory.owner_telegram_id||0);
  if(!founderId&&territory.owner_telegram_username){const owner=await env.DB.prepare(`SELECT telegram_id FROM users WHERE lower(replace(telegram_username,'@',''))=lower(?) AND status='verified' LIMIT 1`).bind(String(territory.owner_telegram_username).replace(/^@/,'' )).first();if(owner){founderId=Number(owner.telegram_id);await env.DB.prepare(`UPDATE territories SET owner_telegram_id=? WHERE id=? AND owner_telegram_id IS NULL`).bind(founderId,territoryId).run();}}
  if(role==='user'&&!founderId)return json({ok:false,error:'У города пока не привязан Telegram основателя/мэра'},409);
  const username=normalizeUsername(user.username)||`id${user.id}`,token=String(env.BOT_TOKEN||'').trim(),screenshotId=crypto.randomUUID(),status=(role==='inspector'||role==='main_inspector')?'approved':'pending',targetChat=status==='pending'?founderId:user.id;
  const tgForm=new FormData();tgForm.append('chat_id',String(targetChat));tgForm.append('photo',file,file.name||'screenshot.jpg');
  tgForm.append('caption',status==='pending'?`📷 Новый скриншот\n\n👤 ${username}\n🏙 ${territory.name}\n\nВыберите действие:`:`📷 Скриншот добавлен\n\n🏙 ${territory.name}`);
  const tgResponse=await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`,{method:'POST',body:tgForm});const tgData=await tgResponse.json();if(!tgResponse.ok||!tgData.ok)return json({ok:false,error:'Не удалось отправить скриншот в Telegram',telegram:tgData},502);
  const photo=Array.isArray(tgData.result?.photo)?tgData.result.photo[tgData.result.photo.length-1]:null;if(!photo?.file_id)return json({ok:false,error:'Telegram did not return file_id'},502);
  await env.DB.prepare(`INSERT INTO screenshots(id,territory_id,telegram_id,telegram_username,file_id,file_unique_id,status,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(screenshotId,territoryId,Number(user.id),username,photo.file_id,photo.file_unique_id||null,status,Date.now()).run();
  if(status==='pending'){try{await telegram(env,'editMessageReplyMarkup',{chat_id:founderId,message_id:tgData.result.message_id,reply_markup:{inline_keyboard:[[{text:'✅ Одобрить',callback_data:`screenshot_ok:${screenshotId}`},{text:'❌ Отклонить',callback_data:`screenshot_no:${screenshotId}`}]]}})}catch(error){console.error('Screenshot moderation buttons error:',error)}}
  return json({ok:true,screenshot:{id:screenshotId,status,url:`/api/screenshots/${screenshotId}`}});
}
async function getScreenshots(request, env, url) {
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT id, territory_id, telegram_id, telegram_username, status, created_at
    FROM screenshots
    WHERE territory_id = ? AND status = 'approved'
    ORDER BY created_at DESC
  `).bind(territoryId).all();

  const base = new URL(request.url).origin;
  return json({
    ok: true,
    screenshots: (rows.results || []).map((row) => ({
      ...row,
      url: `${base}/api/screenshots/${row.id}`,
      author: row.telegram_username,
    })),
  });
}

async function moderateScreenshot(request, env, screenshotId, approve) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;

  const screenshot = await env.DB.prepare(`
    SELECT s.*, t.owner_telegram_id, t.requested_by_id
    FROM screenshots s
    JOIN territories t ON t.id = s.territory_id
    WHERE s.id = ?
  `).bind(screenshotId).first();

  if (!screenshot) return json({ ok: false, error: "Screenshot not found" }, 404);

  const role = await getRoleByTelegramId(env, auth.user.id);
  const isFounder =
    String(auth.user.id) === String(screenshot.owner_telegram_id || "") ||
    String(auth.user.id) === String(screenshot.requested_by_id || "");

  if (role !== "main_inspector" && !isFounder) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  await env.DB.prepare(`
    UPDATE screenshots
    SET status = ?, moderated_by = ?, moderated_at = ?
    WHERE id = ?
  `).bind(
    approve ? "approved" : "rejected",
    Number(auth.user.id),
    Date.now(),
    screenshotId
  ).run();

  return json({ ok: true, status: approve ? "approved" : "rejected" });
}

async function deleteScreenshot(request, env, screenshotId) {
  const auth=await requireUser(request,env);if(auth.error)return auth;
  const row=await env.DB.prepare(`SELECT s.id,t.owner_telegram_id FROM screenshots s JOIN territories t ON t.id=s.territory_id WHERE s.id=? AND s.status='approved'`).bind(screenshotId).first();
  if(!row)return json({ok:false,error:'Screenshot not found'},404);if(String(row.owner_telegram_id||'')!==String(auth.user.id))return json({ok:false,error:'Только основатель/мэр может удалить скрин'},403);
  await env.DB.prepare('DELETE FROM screenshots WHERE id=?').bind(screenshotId).run();return json({ok:true});
}

async function serveScreenshot(request, env, screenshotId) {
  const row = await env.DB.prepare(`
    SELECT file_id, status FROM screenshots WHERE id = ?
  `).bind(screenshotId).first();

  if (!row || row.status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  const token = String(env.BOT_TOKEN || "").trim();
  const tg = await telegram(env, "getFile", { file_id: row.file_id });
  if (!tg.data?.ok || !tg.data.result?.file_path) {
    return new Response("Telegram file not found", { status: 404 });
  }

  const fileUrl = `${TELEGRAM_API}/file/bot${token}/${tg.data.result.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) return new Response("Image not found", { status: 404 });

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return withCors(new Response(response.body, {
    status: response.status,
    headers,
  }));
}

async function renameTerritory(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth;let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),name=String(body?.name||'').trim();if(!territoryId||!name||name.length>80)return json({ok:false,error:'Название обязательно'},400);
  const territory=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();if(!territory||String(territory.owner_telegram_id)!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare('UPDATE territories SET name=? WHERE id=?').bind(name,territoryId).run();return json({ok:true,name});
}

async function deleteTerritory(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  let body = {};
  try { body = await request.json(); } catch {}

  const territoryId = String(body?.territoryId || "").trim();
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  await ensureWorldTables(env);
  await env.DB.prepare("DELETE FROM city_memberships WHERE territory_id = ?").bind(territoryId).run();
  await env.DB.prepare("UPDATE city_invites SET status = 'cancelled', responded_at = ? WHERE territory_id = ? AND status = 'pending'").bind(Date.now(), territoryId).run();
  await env.DB.prepare("DELETE FROM city_items WHERE territory_id = ?").bind(territoryId).run();
  await env.DB.prepare("DELETE FROM city_customization WHERE territory_id = ?").bind(territoryId).run();
  await env.DB.prepare("DELETE FROM territories WHERE id = ?").bind(territoryId).run();
  return json({ ok: true });
}

async function updateTerritoryCoords(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  const x = Number(body?.x);
  const z = Number(body?.z);

  if (!territoryId || !Number.isFinite(x) || !Number.isFinite(z) ||
      x < -2000 || x > 2000 || z < -2000 || z > 2000) {
    return json({ ok: false, error: "Invalid coordinates" }, 400);
  }

  await env.DB.prepare(`
    UPDATE territories SET coords = ? WHERE id = ?
  `).bind(`X ${x} / Z ${z}`, territoryId).run();

  return json({ ok: true });
}

async function saveRecruitment(request, env) {
  await ensureRecruitmentTable(env);
  const auth = await requireUser(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  const ownerNickname = String(body?.ownerNickname || "").trim();
  const description = String(body?.description || "").trim();
  const enabled = !!body?.enabled;

  if (!territoryId || !ownerNickname || !description) {
    return json({ ok: false, error: "territoryId, ownerNickname and description are required" }, 400);
  }

  const territory = await env.DB.prepare(`
    SELECT id, owner_input, owner_telegram_id
    FROM territories WHERE id = ? AND status = 'approved'
  `).bind(territoryId).first();

  if (!territory) return json({ ok: false, error: "City not found" }, 404);

  const isFounder =
    String(territory.owner_telegram_id || "") === String(auth.user.id) ||
    String(territory.owner_input || "").trim().toLowerCase() === ownerNickname.toLowerCase();

  if (!isFounder) {
    return json({ ok: false, error: "Only the city founder/mayor can edit recruitment" }, 403);
  }

  await env.DB.prepare(`
    INSERT INTO recruitment (territory_id, description, enabled, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(territory_id) DO UPDATE SET
      description = excluded.description,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).bind(territoryId, description, enabled ? 1 : 0, Date.now()).run();

  return json({ ok: true });
}

async function getRecruitment(env) {
  try {
    await ensureRecruitmentTable(env);
    const result = await env.DB.prepare(`
      SELECT t.*, r.description AS recruitment_description,
             COALESCE(r.enabled, 0) AS recruitment_enabled
      FROM territories t
      LEFT JOIN recruitment r ON r.territory_id = t.id
      WHERE t.status = 'approved'
      ORDER BY t.created_at DESC
    `).all();
    return json({ ok: true, cities: result.results || [] });
  } catch (error) {
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}

async function startTerritoryApproval(env, chatId, territoryId) {
  await ensureApprovalSessionsTable(env);
  await env.DB.prepare(`
    INSERT INTO territory_approval_sessions
    (territory_id, inspector_chat_id, step, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(territory_id) DO UPDATE SET
      inspector_chat_id = excluded.inspector_chat_id,
      step = 1, city_name = '', owner = '', x = '', z = '',
      updated_at = excluded.updated_at
  `).bind(territoryId, String(chatId), Date.now()).run();

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: "📝 <b>Добавление города</b>\n\nВведите\n1. Название территории\n2. Username основателя/мэра\n3. Координаты X Z (2 числа)",
    parse_mode: "HTML",
  });
}

async function finalizeTerritoryApproval(env, chatId, id, name, owner, x, z) {
  const nx = Number(String(x).replace(",", "."));
  const nz = Number(String(z).replace(",", "."));
  if (!name || !owner || !Number.isFinite(nx) || !Number.isFinite(nz) ||
      nx < -2000 || nx > 2000 || nz < -2000 || nz > 2000) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Проверьте формат. Нужно: название, @username и координаты X Z от −2000 до 2000.",
    });
    return false;
  }

  const palette = ["#A855F7", "#22C55E", "#38BDF8", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];
  const accent = palette[Math.floor(Math.random() * palette.length)];

  await ensureWorldTables(env);
  const ownerUsername = normalizeUsername(owner).replace(/^@/, '');
  const duplicateOwnerName = await env.DB.prepare(`SELECT id FROM territories WHERE status = 'approved' AND lower(replace(owner_input, '@', '')) = lower(?) LIMIT 1`).bind(ownerUsername).first();
  if (duplicateOwnerName) { await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Этот username уже используется как основатель/мэр другого города.' }); return false; }
  const ownerUser = ownerUsername ? await env.DB.prepare(`SELECT telegram_id, telegram_username FROM users WHERE lower(replace(telegram_username, '@', '')) = lower(?) AND status = 'verified' LIMIT 1`).bind(ownerUsername).first() : null;
  if (ownerUser) {
    const existingFounder = await env.DB.prepare(`SELECT id FROM territories WHERE owner_telegram_id = ? AND status = 'approved' LIMIT 1`).bind(Number(ownerUser.telegram_id)).first();
    if (existingFounder) {
      await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Этот пользователь уже является основателем/мэром другого города.' });
      return false;
    }
  }
  const result = await env.DB.prepare(`
    UPDATE territories
    SET name = ?, owner_input = ?, coords = ?, accent = ?, status = ?,
        owner_telegram_id = ?,
        owner_telegram_username = ?
    WHERE id = ? AND status = 'pending'
  `).bind(
    name.trim(), owner.trim(), `X ${nx} / Z ${nz}`, accent, 'approved',
    ownerUser ? Number(ownerUser.telegram_id) : null, ownerUsername || null, id
  ).run();

  if (!result.meta?.changes) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Заявка не найдена или уже обработана.",
    });
    return false;
  }

  await ensureDefaultCityVisuals(env,id);

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text:
      `✅ Город добавлен на карту\n\n` +
      `🏙 ${name.trim()}\n` +
      `👤 ${normalizeUsername(owner) || owner.trim()}\n` +
      `📍 ${formatCoordinatePair(nx, nz)}`,
  });

  return true;
}

function parseInspectorCityMessage(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 3) return null;
  const name = lines[0];
  const owner = normalizeUsername(lines[1]) || lines[1];
  const coords = parseTwoCoordinates(lines[2]);
  if (!name || !owner || !coords) return null;
  return { name, owner, x: coords.x, z: coords.z };
}

function formatCoordinatePair(x, z) {
  const fmt = (value) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  return `${fmt(x)} ${fmt(z)}`;
}

async function handleNicknameCallback(env, callbackQuery, approved) {
  const actorId = String(callbackQuery.from?.id || "");
  const role = await getRoleByTelegramId(env, actorId);
  if (role !== "main_inspector" && role !== "inspector") {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "⛔ Недостаточно прав", show_alert: true });
    return json({ ok: true });
  }
  const parts = String(callbackQuery.data || "").split(":");
  const telegramId = Number(parts[1]);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return json({ ok: false, error: "Invalid Telegram ID" }, 400);
  const status = approved ? "verified" : "rejected";
  const result = await env.DB.prepare(
    "UPDATE users SET status = ? WHERE telegram_id = ? AND status = 'pending'"
  ).bind(status, telegramId).run();

  const currentUser = await env.DB.prepare(
    "SELECT mc_nickname, status FROM users WHERE telegram_id = ?"
  ).bind(telegramId).first();

  const changed = Number(result.meta?.changes || 0) > 0;
  const actuallyVerified = currentUser?.status === "verified";
  const callbackText = approved
    ? (actuallyVerified ? "Ник подтверждён" : "Заявка уже обработана")
    : (changed ? "Заявка отклонена" : "Заявка уже обработана");

  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: callbackText
  });
  try { await telegram(env, "editMessageReplyMarkup", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
  if (actuallyVerified && currentUser?.mc_nickname) {
    try {
      await telegram(env, "sendMessage", {
        chat_id: telegramId,
        text: `✅ Ваш никнейм <code>${escapeHtml(currentUser.mc_nickname)}</code> подтверждён инспектором.`,
        parse_mode: "HTML"
      });
    } catch (error) { console.error("Could not notify nickname applicant:", error); }
  } else if (!approved && changed) {
    try {
      await telegram(env, "sendMessage", {
        chat_id: telegramId,
        text: "❌ Заявка на регистрацию отклонена инспектором."
      });
    } catch (error) { console.error("Could not notify nickname applicant:", error); }
  }
  if (actuallyVerified) await notifyPendingInvitesForUser(env, telegramId);
  return json({ ok: true });
}

async function handleTerritoryApprovalStep(env, message) {
  await ensureApprovalSessionsTable(env);
  const chatId = String(message.chat.id);
  const session = await env.DB.prepare(`SELECT * FROM territory_approval_sessions WHERE inspector_chat_id = ? ORDER BY updated_at DESC LIMIT 1`).bind(chatId).first();
  if (!session) return false;
  const parsed = parseInspectorCityMessage(message.text);
  if (!parsed) {
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Нужно отправить ровно 3 строки:\nНазвание территории\n@username основателя/мэра\nX Z (2 числа)' });
    return true;
  }
  const ok = await finalizeTerritoryApproval(env, chatId, session.territory_id, parsed.name, parsed.owner, parsed.x, parsed.z);
  if (ok) await env.DB.prepare('DELETE FROM territory_approval_sessions WHERE territory_id = ?').bind(session.territory_id).run();
  return true;
}

async function handleTerritoryCallback(env, callbackQuery) {
  const data = String(callbackQuery?.data || "");
  const [action, ...rest] = data.split(":");
  const id = rest.join(":");
  const actorRole = await getRoleByTelegramId(env, callbackQuery.from?.id);

  if (actorRole !== "main_inspector") {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "⛔ Недостаточно прав",
      show_alert: true,
    });
    return json({ ok: true });
  }

  if (action === "territory_no") {
    const result = await env.DB.prepare(`
      UPDATE territories SET status = 'rejected'
      WHERE id = ? AND status = 'pending'
    `).bind(id).run();

    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: result.meta?.changes ? "Заявка отклонена" : "Заявка уже обработана",
    });

    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
    return json({ ok: true });
  }

  if (action === "territory_ok") {
    const territory = await env.DB.prepare(`
      SELECT id FROM territories WHERE id = ? AND status = 'pending'
    `).bind(id).first();

    if (!territory) {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Заявка уже обработана",
        show_alert: true,
      });
      return json({ ok: true });
    }

    await startTerritoryApproval(env, callbackQuery.message.chat.id, id);
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Введите данные одним сообщением",
    });

    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function handleScreenshotCallback(env, callbackQuery) {
  const [action, screenshotId] = String(callbackQuery.data || "").split(":");
  if (!["screenshot_ok", "screenshot_no"].includes(action) || !screenshotId) {
    return json({ ok: true });
  }

  const screenshot = await env.DB.prepare(`
    SELECT s.*, t.owner_telegram_id, t.requested_by_id
    FROM screenshots s JOIN territories t ON t.id = s.territory_id
    WHERE s.id = ?
  `).bind(screenshotId).first();

  if (!screenshot) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Скриншот не найден",
      show_alert: true,
    });
    return json({ ok: true });
  }

  const actorId = String(callbackQuery.from?.id || "");
  const role = await getRoleByTelegramId(env, actorId);
  const isFounder =
    actorId === String(screenshot.owner_telegram_id || "") ||
    actorId === String(screenshot.requested_by_id || "");

  if (role !== "main_inspector" && !isFounder) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "⛔ Недостаточно прав",
      show_alert: true,
    });
    return json({ ok: true });
  }

  const approved = action === "screenshot_ok";
  await env.DB.prepare(`
    UPDATE screenshots
    SET status = ?, moderated_by = ?, moderated_at = ?
    WHERE id = ?
  `).bind(approved ? "approved" : "rejected", Number(actorId), Date.now(), screenshotId).run();

  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: approved ? "Скриншот одобрен" : "Скриншот отклонён",
  });

  try {
    await telegram(env, "editMessageReplyMarkup", {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {}

  return json({ ok: true });
}

async function webhook(request, env) {
  let update;
  try { update = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const callbackQuery = update?.callback_query;
  if (callbackQuery?.data) {
    const actorId = String(callbackQuery.from?.id || "");
    const role = await getRoleByTelegramId(env, actorId);

    if (String(callbackQuery.data).startsWith("nickname_")) {
      const approved = String(callbackQuery.data).startsWith("nickname_ok:");
      return handleNicknameCallback(env, callbackQuery, approved);
    }

    if (String(callbackQuery.data).startsWith("territory_") && role !== "main_inspector") {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "⛔ Недостаточно прав",
        show_alert: true,
      });
      return json({ ok: true });
    }

    if (String(callbackQuery.data).startsWith("screenshot_")) {
      return handleScreenshotCallback(env, callbackQuery);
    }

    if (String(callbackQuery.data).startsWith('resident_')) {
      return handleResidentInviteCallback(env, callbackQuery);
    }

    return handleTerritoryCallback(env, callbackQuery);
  }

  const message = update?.message;
  if (!message) return json({ ok: true, ignored: true });

  const messageUserId = Number(message.from?.id || 0);
  if (messageUserId) {
    try { await env.DB.prepare(`INSERT INTO users (telegram_id, telegram_username, mc_nickname, status, created_at) VALUES (?, ?, NULL, 'none', ?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`).bind(messageUserId, message.from?.username || null, Date.now()).run(); } catch (e) { console.error('Could not sync Telegram user:', e); }
    await notifyPendingInvitesForUser(env, messageUserId);
  }

  const role = await getRoleByTelegramId(env, messageUserId);
  if (role !== "main_inspector") return json({ ok: true, ignored: true });

  const text = String(message.text || "").trim();
  if (!text) return json({ ok: true, ignored: true });

  if (await handleTerritoryApprovalStep(env, message)) {
    return json({ ok: true, handled: "territory_approval_step" });
  }

  return json({ ok: true, ignored: true });
}

async function health(env, request) {
  const token = String(env.BOT_TOKEN || "").trim();
  if (!token) return json({
    ok: false, worker: "voxygen", tokenConfigured: false,
    error: "BOT_TOKEN is not configured",
  }, 401);

  try {
    const { response, data } = await telegram(env, "getMe", {});
    if (!response.ok || !data.ok) return json({
      ok: false, worker: "voxygen", tokenConfigured: true,
      telegramAcceptedToken: false, telegram: data,
    }, 401);

    return json({
      ok: true, worker: "voxygen", tokenConfigured: true,
      telegramAcceptedToken: true,
      bot: data.result,
      request: {
        url: request.url,
        pathname: new URL(request.url).pathname,
        method: request.method,
      },
    });
  } catch (error) {
    return json({
      ok: false, worker: "voxygen", tokenConfigured: true,
      error: "Failed to contact Telegram", details: String(error),
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return health(env, request);
    }

    if (url.pathname === "/api/territories" && request.method === "GET") {
      return getTerritories(env);
    }

    if (url.pathname === "/api/territories" && request.method === "POST") {
      return createTerritory(request, env);
    }

    if (url.pathname === "/api/me" && request.method === "POST") {
      return getMe(request, env);
    }

    if (url.pathname === "/api/profile/claim" && request.method === "POST") {
      return claimNickname(request, env);
    }

    if (url.pathname === "/api/territories/claim-owner" && request.method === "POST") {
      return claimTerritoryOwner(request, env);
    }

    if (url.pathname === "/api/inspectors/list" && request.method === "POST") {
      return listInspectors(request, env);
    }

    if (url.pathname === "/api/inspectors" && request.method === "POST") {
      return addInspector(request, env);
    }

    if (url.pathname.startsWith("/api/inspectors/") && request.method === "DELETE") {
      return removeInspector(request, env, url);
    }

    if (url.pathname === "/api/ratings" && request.method === "POST") {
      return saveRating(request, env);
    }

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      return getRatings(request, env, url);
    }

    if (url.pathname === "/api/comments" && request.method === "POST") {
      return addComment(request, env);
    }

    if (url.pathname === "/api/comments" && request.method === "GET") {
      return getComments(request, env, url);
    }

    if (url.pathname === "/api/comments/reply" && request.method === "POST") {
      return replyToComment(request, env);
    }

    if (url.pathname === "/api/screenshots" && request.method === "POST") {
      return uploadScreenshot(request, env);
    }

    if (url.pathname === "/api/screenshots" && request.method === "GET") {
      return getScreenshots(request, env, url);
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "GET") {
      return serveScreenshot(request, env, url.pathname.split("/").pop());
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "DELETE") {
      const screenshotId = url.pathname.split("/").pop();
      return deleteScreenshot(request, env, screenshotId);
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "POST") {
      const screenshotId = url.pathname.split("/").pop();
      return moderateScreenshot(request, env, screenshotId);
    }

    if (url.pathname === "/api/admin/territories/rename" && request.method === "POST") {
      return renameTerritory(request, env);
    }

    if (url.pathname === "/api/admin/territories/delete" && request.method === "POST") {
      return deleteTerritory(request, env);
    }

    if (url.pathname === "/api/admin/territories/coords" && request.method === "POST") {
      return updateTerritoryCoords(request, env);
    }

    if (url.pathname === "/api/map" && request.method === "GET") {
      return getMapSettings(env);
    }

    if (url.pathname === "/api/map" && request.method === "POST") {
      return saveMapSettings(request, env);
    }

    if (url.pathname === '/api/vox-grid' && request.method === 'GET') {
      return json({ ok: true, cells: await getVoxGrid(env) });
    }
    if (url.pathname === '/api/vox-grid' && request.method === 'POST') {
      return saveVoxCell(request, env);
    }
    if (url.pathname === '/api/customization' && request.method === 'GET') {
      return getCustomization(request, env);
    }
    if (url.pathname === '/api/customization/items' && request.method === 'POST') {
      return createCustomizationItem(request, env);
    }
    if (url.pathname.startsWith('/api/customization/items/') && request.method === 'DELETE') {
      return deleteCustomizationItem(request, env, url.pathname.split('/').pop());
    }
    if (url.pathname === '/api/customization/purchase' && request.method === 'POST') {
      return purchaseCustomizationItem(request, env);
    }
    if (url.pathname === '/api/customization/city' && request.method === 'POST') {
      return updateCityCustomization(request, env);
    }
    if (url.pathname === '/api/customization/city' && request.method === 'GET') {
      return getCityCustomizationData(request, env, url);
    }
    if (url.pathname === '/api/city/invite' && request.method === 'POST') {
      return inviteResident(request, env);
    }
    if (url.pathname === '/api/city/invite/cancel' && request.method === 'POST') {
      return cancelResidentInvite(request, env);
    }
    if (url.pathname === '/api/city/remove-resident' && request.method === 'POST') {
      return removeResident(request, env);
    }
    if (url.pathname === '/api/city/management' && request.method === 'GET') {
      return getCityManagement(request, env, url);
    }
    if (url.pathname === "/api/recruitment" && request.method === "GET") {
      return getRecruitment(env);
    }

    if (url.pathname === "/api/recruitment" && request.method === "POST") {
      return saveRecruitment(request, env);
    }

    if (url.pathname === "/api/webhook" && request.method === "POST") {
      return webhook(request, env);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        worker: "voxygen",
        message: "Voxygen backend is running",
        endpoints: {
          health: "/api/health",
          territories: "/api/territories",
          me: "/api/me",
          inspectors: "/api/inspectors",
          ratings: "/api/ratings",
          comments: "/api/comments",
          screenshots: "/api/screenshots",
          recruitment: "/api/recruitment",
          webhook: "/api/webhook",
        },
      });
    }

    return json({
      ok: false,
      error: "Route not found",
      pathname: url.pathname,
    }, 404);
  },
};
