// ============================================================
// VOXYGEN BACKEND
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

const TELEGRAM_API = "https://api.telegram.org";

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
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

function normalizeUsername(username) {
  const value = String(username || "").trim().replace(/^@+/, "");
  return value ? `@${value}` : "";
}

async function getRoleByTelegramId(env, telegramId) {
  const id = String(telegramId);
  const main = String(env.MAIN_INSPECTOR_TELEGRAM_ID || "").trim();
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
  const main = String(env.MAIN_INSPECTOR_TELEGRAM_ID || "").trim();
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

async function getTerritories(env) {
  try {
    await ensureRecruitmentTable(env);
    const result = await env.DB.prepare(`
      SELECT
        t.*,
        r.description AS recruitment_description,
        COALESCE(r.enabled, 0) AS recruitment_enabled
      FROM territories t
      LEFT JOIN recruitment r ON r.territory_id = t.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC
    `).bind("approved").all();

    return json({ ok: true, territories: result.results || [] });
  } catch (error) {
    console.error("GET territories error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
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
  if (!name || !owner || !coords) {
    return json({ ok: false, error: "name, owner and coords are required" }, 400);
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
      Number(user.id), username, "pending", createdAt
    ).run();
  } catch (error) {
    console.error("INSERT territory error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }

  const inspectorChatId = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (!inspectorChatId) {
    return json({ ok: false, error: "INSPECTOR_CHAT_ID is not configured" }, 500);
  }

  const parsed = parseRequestCoords(coords);
  const x = parsed ? String(parsed.x) : coords;
  const z = parsed ? String(parsed.z) : "";

  const text =
    `🏙 Новая заявка на территорию\n\n` +
    `🏷 Название территории\n` +
    `<code>${escapeHtml(name)}</code>\n\n` +
    `👤 @username основателя/мэра\n` +
    `${escapeHtml(normalizeUsername(owner) || owner)}\n\n` +
    `📍 Координаты\n` +
    `X <code>${escapeHtml(x)}</code>\n` +
    `Z <code>${escapeHtml(z)}</code>\n\n` +
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

  let profile = await env.DB.prepare(
    "SELECT telegram_id, telegram_username, mc_nickname, status FROM users WHERE telegram_id = ?"
  ).bind(Number(user.id)).first();

  return json({
    ok: true,
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
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const telegramId = Number(body?.telegramId);
  const username = String(body?.username || "").trim().replace(/^@+/, "");
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return json({ ok: false, error: "Invalid Telegram ID" }, 400);
  }
  if (String(telegramId) === String(env.MAIN_INSPECTOR_TELEGRAM_ID || "").trim()) {
    return json({ ok: false, error: "Main inspector is already the main inspector" }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO inspectors (telegram_id, telegram_username, added_by, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      telegram_username = excluded.telegram_username
  `).bind(
    telegramId,
    username || null,
    Number(auth.user.id),
    Date.now()
  ).run();

  return json({ ok: true });
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

    const inspectorChatId = String(env.INSPECTOR_CHAT_ID || env.MAIN_INSPECTOR_TELEGRAM_ID || "").trim();
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
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const territory = await env.DB.prepare(`
    SELECT id, owner_input, owner_telegram_id
    FROM territories WHERE id = ? AND status = 'approved'
  `).bind(territoryId).first();

  if (!territory) return json({ ok: false, error: "City not found" }, 404);

  if (territory.owner_telegram_id && String(territory.owner_telegram_id) !== String(auth.user.id)) {
    return json({ ok: false, error: "City already has another founder/mayor" }, 403);
  }

  await env.DB.prepare(`
    UPDATE territories
    SET owner_telegram_id = ?, owner_telegram_username = ?
    WHERE id = ?
  `).bind(
    Number(auth.user.id),
    auth.user.username || null,
    territoryId
  ).run();

  return json({ ok: true });
}

async function saveRating(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  const values = ["integrity", "comfort", "atmosphere", "detail"];
  const scores = values.map((key) => Number(body?.[key]));

  if (!territoryId || scores.some((v) => !Number.isFinite(v) || v < 0 || v > 10)) {
    return json({ ok: false, error: "Invalid rating" }, 400);
  }

  const territory = await env.DB.prepare(
    "SELECT id FROM territories WHERE id = ? AND status = 'approved'"
  ).bind(territoryId).first();
  if (!territory) return json({ ok: false, error: "City not found" }, 404);

  const role = await getRoleByTelegramId(env, auth.user.id);
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO ratings
    (id, territory_id, telegram_id, role, integrity, comfort, atmosphere, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(territory_id, telegram_id) DO UPDATE SET
      role = excluded.role,
      integrity = excluded.integrity,
      comfort = excluded.comfort,
      atmosphere = excluded.atmosphere,
      detail = excluded.detail,
      created_at = excluded.created_at
  `).bind(
    id, territoryId, Number(auth.user.id), role,
    scores[0], scores[1], scores[2], scores[3], Date.now()
  ).run();

  return json({ ok: true });
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
    const founderId = territory.owner_telegram_id || territory.requested_by_id;
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

async function getComments(request, env, url) {
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT id, telegram_id, telegram_username, text, role, created_at
    FROM comments
    WHERE territory_id = ?
    ORDER BY
      CASE WHEN role IN ('inspector', 'main_inspector') THEN 0 ELSE 1 END,
      created_at DESC
  `).bind(territoryId).all();

  return json({ ok: true, comments: rows.results || [] });
}

async function uploadScreenshot(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const form = await request.formData();
  const territoryId = String(form.get("territoryId") || "").trim();
  const file = form.get("photo");

  if (!territoryId || !(file instanceof File)) {
    return json({ ok: false, error: "territoryId and photo are required" }, 400);
  }

  if (!String(file.type || "").startsWith("image/")) {
    return json({ ok: false, error: "Only images are allowed" }, 400);
  }

  const territory = await env.DB.prepare(`
    SELECT id, name, owner_telegram_id, requested_by_id
    FROM territories WHERE id = ? AND status = 'approved'
  `).bind(territoryId).first();

  if (!territory) return json({ ok: false, error: "City not found" }, 404);

  const role = await getRoleByTelegramId(env, user.id);
  const username = normalizeUsername(user.username) || `id${user.id}`;

  const tgForm = new FormData();
  tgForm.append("chat_id", String(territory.owner_telegram_id || territory.requested_by_id || env.INSPECTOR_CHAT_ID || ""));
  tgForm.append("photo", file, file.name || "screenshot.jpg");
  tgForm.append(
    "caption",
    `📷 Новый скриншот\n\n👤 ${username}\n🏙 ${territory.name}`
  );

  const token = String(env.BOT_TOKEN || "").trim();
  const tgResponse = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`, {
    method: "POST",
    body: tgForm,
  });
  const tgData = await tgResponse.json();

  if (!tgResponse.ok || !tgData.ok) {
    return json({ ok: false, error: "Telegram error", telegram: tgData }, 502);
  }

  const photo = Array.isArray(tgData.result?.photo)
    ? tgData.result.photo[tgData.result.photo.length - 1]
    : null;

  if (!photo?.file_id) {
    return json({ ok: false, error: "Telegram did not return file_id" }, 502);
  }

  const screenshotId = crypto.randomUUID();
  const status = role === "inspector" || role === "main_inspector" ? "approved" : "pending";

  await env.DB.prepare(`
    INSERT INTO screenshots
    (id, territory_id, telegram_id, telegram_username, file_id, file_unique_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    screenshotId, territoryId, Number(user.id), username,
    photo.file_id, photo.file_unique_id || null, status, Date.now()
  ).run();

  // Для обычного пользователя отправленное фото остаётся pending до решения основателя/мэра.
  // Инспекторское фото сразу approved и не требует согласования основателя/мэра.
  if (status === "pending") {
    const text =
      `📷 Новый скриншот для города\n\n` +
      `🏙 ${escapeHtml(territory.name)}\n` +
      `👤 ${escapeHtml(username)}\n\n` +
      `Выберите действие:`;

    try {
      await telegram(env, "sendMessage", {
        chat_id: territory.owner_telegram_id || territory.requested_by_id,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Одобрить", callback_data: `screenshot_ok:${screenshotId}` },
            { text: "❌ Отклонить", callback_data: `screenshot_no:${screenshotId}` },
          ]],
        },
      });
    } catch (error) {
      console.error("Screenshot moderation notification error:", error);
    }
  }

  return json({
    ok: true,
    screenshot: {
      id: screenshotId,
      status,
      url: `/api/screenshots/${screenshotId}`,
      author: username,
    },
  });
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

async function deleteTerritory(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth;

  let body = {};
  try { body = await request.json(); } catch {}

  const territoryId = String(body?.territoryId || "").trim();
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

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
    text: "📝 <b>Добавление города</b>\n\nШаг <b>1 из 4</b>\nВведите <b>Название города</b>.",
    parse_mode: "HTML",
    reply_markup: { force_reply: true },
  });
}

async function finalizeTerritoryApproval(env, chatId, id, name, owner, x, z) {
  const nx = Number(String(x).replace(",", "."));
  const nz = Number(String(z).replace(",", "."));
  if (!name || !owner || !Number.isFinite(nx) || !Number.isFinite(nz) ||
      nx < -2000 || nx > 2000 || nz < -2000 || nz > 2000) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Проверьте название, основателя/мэра и координаты X/Z от −2000 до 2000.",
    });
    return false;
  }

  const palette = ["#A855F7", "#22C55E", "#38BDF8", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];
  const accent = palette[Math.floor(Math.random() * palette.length)];

  const result = await env.DB.prepare(`
    UPDATE territories
    SET name = ?, owner_input = ?, coords = ?, accent = ?, status = ?,
        owner_telegram_username = COALESCE(owner_telegram_username, ?)
    WHERE id = ? AND status = 'pending'
  `).bind(
    name.trim(), owner.trim(), `X ${nx} / Z ${nz}`, accent, "approved",
    normalizeUsername(owner).replace(/^@/, "") || null, id
  ).run();

  if (!result.meta?.changes) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Заявка не найдена или уже обработана.",
    });
    return false;
  }

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text:
      `✅ <b>Город добавлен на карту</b>\n\n` +
      `🏙 <b>${escapeHtml(name.trim())}</b>\n` +
      `👤 Основатель/мэр: <b>${escapeHtml(owner.trim())}</b>\n` +
      `📍 Координаты: <code>X ${escapeHtml(nx)} / Z ${escapeHtml(nz)}</code>`,
    parse_mode: "HTML",
  });

  return true;
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
  const result = await env.DB.prepare("UPDATE users SET status = ? WHERE telegram_id = ? AND status = 'pending'").bind(status, telegramId).run();
  await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: result.meta?.changes ? (approved ? "Ник подтверждён" : "Заявка отклонена") : "Заявка уже обработана" });
  try { await telegram(env, "editMessageReplyMarkup", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
  try { await telegram(env, "sendMessage", { chat_id: telegramId, text: approved ? "✅ Ваш никнейм подтверждён инспектором." : "❌ Заявка на регистрацию отклонена инспектором." }); } catch (error) { console.error("Could not notify nickname applicant:", error); }
  return json({ ok: true });
}

async function handleTerritoryApprovalStep(env, message) {
  await ensureApprovalSessionsTable(env);
  const chatId = String(message.chat.id);
  const session = await env.DB.prepare(`
    SELECT * FROM territory_approval_sessions
    WHERE inspector_chat_id = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(chatId).first();

  if (!session) return false;
  const text = String(message.text || "").trim();
  if (!text) return true;

  if (session.step === 1) {
    await env.DB.prepare(`
      UPDATE territory_approval_sessions
      SET city_name = ?, step = 2, updated_at = ? WHERE territory_id = ?
    `).bind(text, Date.now(), session.territory_id).run();
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "👤 <b>Основатель/мэр</b>\n\nВведите <b>@username основателя/мэра</b>.",
      parse_mode: "HTML",
      reply_markup: { force_reply: true },
    });
    return true;
  }

  if (session.step === 2) {
    await env.DB.prepare(`
      UPDATE territory_approval_sessions
      SET owner = ?, step = 3, updated_at = ? WHERE territory_id = ?
    `).bind(text, Date.now(), session.territory_id).run();
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "📍 <b>Координата X</b>\n\nВведите число от −2000 до 2000.",
      parse_mode: "HTML",
      reply_markup: { force_reply: true },
    });
    return true;
  }

  if (session.step === 3) {
    const x = Number(text.replace(",", "."));
    if (!Number.isFinite(x) || x < -2000 || x > 2000) {
      await telegram(env, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ X должен быть числом от −2000 до 2000.",
        reply_markup: { force_reply: true },
      });
      return true;
    }
    await env.DB.prepare(`
      UPDATE territory_approval_sessions
      SET x = ?, step = 4, updated_at = ? WHERE territory_id = ?
    `).bind(String(x), Date.now(), session.territory_id).run();
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "📍 <b>Координата Z</b>\n\nВведите число от −2000 до 2000.",
      parse_mode: "HTML",
      reply_markup: { force_reply: true },
    });
    return true;
  }

  if (session.step === 4) {
    const z = Number(text.replace(",", "."));
    if (!Number.isFinite(z) || z < -2000 || z > 2000) {
      await telegram(env, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Z должен быть числом от −2000 до 2000.",
        reply_markup: { force_reply: true },
      });
      return true;
    }

    await env.DB.prepare(`
      UPDATE territory_approval_sessions
      SET z = ?, updated_at = ? WHERE territory_id = ?
    `).bind(String(z), Date.now(), session.territory_id).run();

    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text:
        `🏙 <b>Проверьте данные города</b>\n\n` +
        `🏷 <b>Название:</b> ${escapeHtml(session.city_name)}\n` +
        `👤 <b>Основатель/мэр:</b> ${escapeHtml(session.owner)}\n` +
        `📍 <b>X:</b> <code>${escapeHtml(session.x)}</code>\n` +
        `📍 <b>Z:</b> <code>${escapeHtml(z)}</code>\n\n` +
        `Всё верно?`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Подтвердить", callback_data: `territory_finalize:${session.territory_id}` },
          { text: "↩️ Изменить", callback_data: `territory_edit:${session.territory_id}` },
        ]],
      },
    });
    return true;
  }

  return true;
}

async function handleTerritoryCallback(env, callbackQuery) {
  const data = String(callbackQuery?.data || "");
  const [action, ...rest] = data.split(":");
  const id = rest.join(":");

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
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Заявка одобрена. Заполняем данные.",
    });
    await startTerritoryApproval(env, callbackQuery.message.chat.id, id);
    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
    return json({ ok: true });
  }

  if (action === "territory_edit") {
    await startTerritoryApproval(env, callbackQuery.message.chat.id, id);
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Введите данные заново",
    });
    return json({ ok: true });
  }

  if (action === "territory_finalize") {
    await ensureApprovalSessionsTable(env);
    const session = await env.DB.prepare(`
      SELECT * FROM territory_approval_sessions
      WHERE territory_id = ? AND inspector_chat_id = ?
    `).bind(id, String(callbackQuery.message.chat.id)).first();

    if (!session || session.step !== 4) {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Сначала заполните все поля",
        show_alert: true,
      });
      return json({ ok: true });
    }

    await finalizeTerritoryApproval(
      env, callbackQuery.message.chat.id, id,
      session.city_name, session.owner, session.x, session.z
    );
    await env.DB.prepare(
      "DELETE FROM territory_approval_sessions WHERE territory_id = ?"
    ).bind(id).run();

    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}

    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Город добавлен",
    });
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

    return handleTerritoryCallback(env, callbackQuery);
  }

  const message = update?.message;
  if (!message) return json({ ok: true, ignored: true });

  const role = await getRoleByTelegramId(env, message.from?.id);
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

    if (url.pathname === "/api/screenshots" && request.method === "POST") {
      return uploadScreenshot(request, env);
    }

    if (url.pathname === "/api/screenshots" && request.method === "GET") {
      return getScreenshots(request, env, url);
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "GET") {
      return serveScreenshot(request, env, url.pathname.split("/").pop());
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "POST") {
      const screenshotId = url.pathname.split("/").pop();
      return moderateScreenshot(request, env, screenshotId);
    }

    if (url.pathname === "/api/admin/territories/delete" && request.method === "POST") {
      return deleteTerritory(request, env);
    }

    if (url.pathname === "/api/admin/territories/coords" && request.method === "POST") {
      return updateTerritoryCoords(request, env);
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
