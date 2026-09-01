// ============================================================
// VOXYGEN BACKEND
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

const TELEGRAM_API = "https://api.telegram.org";


// ============================================================
// CORS
// ============================================================

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


// ============================================================
// JSON RESPONSE
// ============================================================

function json(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    })
  );
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}



function parseRequestCoords(raw) {
  const s = String(raw || "").trim().replace(/−/g, "-");
  let m = s.match(/X\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:\/|,|;|\s+)\s*Z\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  if (!m) m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(?:[,;\/]|\s+)\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const x = Number(String(m[1]).replace(",", "."));
  const z = Number(String(m[2]).replace(",", "."));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

// ============================================================
// TELEGRAM API
// ============================================================

async function telegram(env, method, payload) {
  const token = String(env.BOT_TOKEN || "").trim();

  if (!token) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  return {
    response,
    data,
  };
}


// ============================================================
// TELEGRAM MINI APP INIT DATA
// ============================================================

async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
      return null;
    }

    params.delete("hash");

    const pairs = [...params.entries()].sort(
      ([a], [b]) => a.localeCompare(b)
    );

    const dataCheckString = pairs
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const encoder = new TextEncoder();

    // Telegram Web Apps:
    // secret_key = HMAC_SHA256("WebAppData", bot_token)

    const webAppDataKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const secretKeyBytes = await crypto.subtle.sign(
      "HMAC",
      webAppDataKey,
      encoder.encode(botToken)
    );

    const secretKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBytes,
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(dataCheckString)
    );

    const calculatedHash = [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedHash !== receivedHash) {
      return null;
    }

    const userJson = params.get("user");

    if (!userJson) {
      return null;
    }

    return JSON.parse(userJson);
  } catch (error) {
    console.error("verifyInitData error:", error);
    return null;
  }
}


// ============================================================
// HEALTH CHECK
// ============================================================

async function health(env, request) {
  const token = String(env.BOT_TOKEN || "").trim();

  if (!token) {
    return json(
      {
        ok: false,
        worker: "voxygen",
        tokenConfigured: false,
        error: "BOT_TOKEN is not configured",
      },
      401
    );
  }

  try {
    const { response, data } = await telegram(
      env,
      "getMe",
      {}
    );

    if (!response.ok || !data.ok) {
      return json(
        {
          ok: false,
          worker: "voxygen",
          tokenConfigured: true,
          telegramAcceptedToken: false,
          telegram: data,
        },
        401
      );
    }

    return json({
      ok: true,
      worker: "voxygen",
      tokenConfigured: true,
      telegramAcceptedToken: true,

      bot: {
        id: data.result.id,
        username: data.result.username,
        first_name: data.result.first_name,
        is_bot: data.result.is_bot,
      },

      request: {
        url: request.url,
        pathname: new URL(request.url).pathname,
        method: request.method,
      },
    });
  } catch (error) {
    return json(
      {
        ok: false,
        worker: "voxygen",
        tokenConfigured: true,
        error: "Failed to contact Telegram",
        details: error instanceof Error
          ? error.message
          : String(error),
      },
      502
    );
  }
}


// ============================================================
// GET /api/territories
// ============================================================

async function getTerritories(env) {
  try {
    await ensureRecruitmentTable(env);
    const result = await env.DB.prepare(
      `
      SELECT
        t.*,
        r.description AS recruitment_description,
        COALESCE(r.enabled, 0) AS recruitment_enabled,
        t.requested_by_username AS owner_telegram_username
      FROM territories t
      LEFT JOIN recruitment r ON r.territory_id = t.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC
      `
    )
      .bind("approved")
      .all();

    return json({
      ok: true,
      territories: result.results || [],
    });
  } catch (error) {
    console.error("GET territories error:", error);

    return json(
      {
        ok: false,
        error: "Database error",
        details: error instanceof Error
          ? error.message
          : String(error),
      },
      500
    );
  }
}


// ============================================================
// POST /api/territories
// ============================================================

async function createTerritory(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON",
      },
      400
    );
  }

  if (!body || typeof body !== "object") {
    return json(
      {
        ok: false,
        error: "Invalid request body",
      },
      400
    );
  }

  const initData = String(body.initData || "").trim();

  if (!initData) {
    return json(
      {
        ok: false,
        error: "Telegram initData is missing",
      },
      401
    );
  }

  const botToken = String(env.BOT_TOKEN || "").trim();

  if (!botToken) {
    return json(
      {
        ok: false,
        error: "BOT_TOKEN is not configured",
      },
      500
    );
  }

  // Проверяем Telegram initData
  const user = await verifyInitData(
    initData,
    botToken
  );

  if (!user) {
    return json(
      {
        ok: false,
        error: "Unauthorized",
        message: "Telegram initData is invalid",
      },
      401
    );
  }

  const name = String(body.name || "").trim();
  const owner = String(body.owner || "").trim();
  const coords = String(body.coords || "").trim();

  if (!name) {
    return json(
      {
        ok: false,
        error: "Missing fields",
        field: "name",
      },
      400
    );
  }

  if (!owner) {
    return json(
      {
        ok: false,
        error: "Missing fields",
        field: "owner",
      },
      400
    );
  }

  if (!coords) {
    return json(
      {
        ok: false,
        error: "Missing fields",
        field: "coords",
        message: "Координаты обязательны.",
      },
      400
    );
  }

  const id = crypto.randomUUID();

  const username = String(
    user.username || ""
  ).trim();

  const createdAt = Date.now();

  try {
    await env.DB.prepare(
      `
      INSERT INTO territories
      (
        id,
        name,
        owner_input,
        coords,
        requested_by_id,
        requested_by_username,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        id,
        name,
        owner,
        coords,
        user.id,
        username,
        "pending",
        createdAt
      )
      .run();
  } catch (error) {
    console.error("INSERT territory error:", error);

    return json(
      {
        ok: false,
        error: "Database error",
        details: error instanceof Error
          ? error.message
          : String(error),
      },
      500
    );
  }

  // Отправляем заявку инспектору
  try {
    const inspectorChatId = String(
      env.INSPECTOR_CHAT_ID || ""
    ).trim();

    if (!inspectorChatId) {
      return json(
        {
          ok: false,
          error: "INSPECTOR_CHAT_ID is not configured",
        },
        500
      );
    }

    const parsedRequestCoords = parseRequestCoords(coords);
    const text =
      `🏙 <b>Новая заявка на территорию</b>\n\n` +
      `🏷 <b>Название территории</b>\n<code>${escapeHtml(name)}</code>\n\n` +
      `👤 <b>@username основателя</b>\n<code>${escapeHtml(owner)}</code>\n\n` +
      `📍 <b>Координаты</b>\n` +
      (parsedRequestCoords ? `<code>X ${escapeHtml(String(parsedRequestCoords.x))}</code>\n<code>Z ${escapeHtml(String(parsedRequestCoords.z))}</code>\n` : `<code>${escapeHtml(coords)}</code>\n`) +
      `\n🙋 <b>Заявитель:</b> @${escapeHtml(username || "—")}\n` +
      `<code>Telegram ID: ${escapeHtml(user.id)}</code>\n\n` +
      `Выберите действие:`;

    const { response, data } = await telegram(
      env,
      "sendMessage",
      {
        chat_id: inspectorChatId,
        parse_mode: "HTML",
        text,

        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Одобрить", callback_data: `territory_ok:${id}` },
              { text: "❌ Отклонить", callback_data: `territory_no:${id}` },
            ],
          ],
        },
      }
    );

    if (!response.ok || !data.ok) {
      console.error(
        "Telegram sendMessage error:",
        data
      );

      return json(
        {
          ok: false,
          error: "Telegram error",
          telegram: data,
        },
        502
      );
    }
  } catch (error) {
    console.error(
      "Telegram notification error:",
      error
    );

    return json(
      {
        ok: false,
        error: "Failed to send Telegram notification",
        details: error instanceof Error
          ? error.message
          : String(error),
      },
      502
    );
  }

  return json({
    ok: true,
    message: "Territory request created",
    id,
    status: "pending",

    user: {
      id: user.id,
      username: username || null,
    },
  });
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

// ============================================================
// CITY RECRUITMENT
// ============================================================

async function getRecruitment(env) {
  try {
    await ensureRecruitmentTable(env);
    const result = await env.DB.prepare(`
      SELECT
        t.*,
        r.description AS recruitment_description,
        COALESCE(r.enabled, 0) AS recruitment_enabled,
        t.requested_by_username AS owner_telegram_username
      FROM territories t
      LEFT JOIN recruitment r ON r.territory_id = t.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC
    `).bind("approved").all();

    return json({ ok: true, cities: result.results || [] });
  } catch (error) {
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}

async function saveRecruitment(request, env) {
  await ensureRecruitmentTable(env);
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const initData = String(body?.initData || "").trim();
  const user = await verifyInitData(initData, String(env.BOT_TOKEN || "").trim());
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const territoryId = String(body?.territoryId || "").trim();
  const ownerNickname = String(body?.ownerNickname || "").trim();
  const description = String(body?.description || "").trim();
  const enabled = !!body?.enabled;

  if (!territoryId || !ownerNickname || !description) {
    return json({ ok: false, error: "territoryId, ownerNickname and description are required" }, 400);
  }

  try {
    const territory = await env.DB.prepare(`
      SELECT id, owner_input
      FROM territories
      WHERE id = ? AND status = ?
    `).bind(territoryId, "approved").first();

    if (!territory) return json({ ok: false, error: "City not found" }, 404);

    if (String(territory.owner_input).trim().toLowerCase() !== ownerNickname.toLowerCase()) {
      return json({ ok: false, error: "Only the city owner can edit recruitment" }, 403);
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
  } catch (error) {
    console.error("saveRecruitment error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
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

async function startTerritoryApproval(env, chatId, territoryId) {
  await ensureApprovalSessionsTable(env);
  await env.DB.prepare(`
    INSERT INTO territory_approval_sessions (territory_id, inspector_chat_id, step, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(territory_id) DO UPDATE SET
      inspector_chat_id = excluded.inspector_chat_id,
      step = 1, city_name = '', owner = '', x = '', z = '', updated_at = excluded.updated_at
  `).bind(territoryId, String(chatId), Date.now()).run();

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: `📝 <b>Добавление города</b>\n\nШаг <b>1 из 4</b>\nВведите <b>Название города</b>.`,
    parse_mode: "HTML",
    reply_markup: { force_reply: true },
  });
}

async function handleTerritoryApprovalStep(env, message) {
  await ensureApprovalSessionsTable(env);
  const chatId = String(message.chat.id);
  const session = await env.DB.prepare(`
    SELECT * FROM territory_approval_sessions WHERE inspector_chat_id = ? ORDER BY updated_at DESC LIMIT 1
  `).bind(chatId).first();
  if (!session) return false;

  const text = String(message.text || '').trim();
  if (!text) return true;

  const prompts = {
    1: ['city_name', '👤 Введите <b>владельца города</b>.', 'Например: @Steve'],
    2: ['owner', '📍 Введите координату <b>X</b>.', 'Например: 420'],
    3: ['x', '📍 Введите координату <b>Z</b>.', 'Например: -180'],
  };

  if (session.step === 1) {
    await env.DB.prepare(`UPDATE territory_approval_sessions SET city_name = ?, step = 2, updated_at = ? WHERE territory_id = ?`).bind(text, Date.now(), session.territory_id).run();
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '👤 <b>Владелец города</b>\n\nВведите <b>@username основателя</b>.', parse_mode: 'HTML', reply_markup: { force_reply: true } });
    return true;
  }
  if (session.step === 2) {
    await env.DB.prepare(`UPDATE territory_approval_sessions SET owner = ?, step = 3, updated_at = ? WHERE territory_id = ?`).bind(text, Date.now(), session.territory_id).run();
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '📍 <b>Координата X</b>\n\nВведите число от −2000 до 2000.', parse_mode: 'HTML', reply_markup: { force_reply: true } });
    return true;
  }
  if (session.step === 3) {
    const x = Number(text.replace(',', '.'));
    if (!Number.isFinite(x) || x < -2000 || x > 2000) {
      await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ X должен быть числом от −2000 до 2000.', reply_markup: { force_reply: true } });
      return true;
    }
    await env.DB.prepare(`UPDATE territory_approval_sessions SET x = ?, step = 4, updated_at = ? WHERE territory_id = ?`).bind(String(x), Date.now(), session.territory_id).run();
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '📍 <b>Координата Z</b>\n\nВведите число от −2000 до 2000.', parse_mode: 'HTML', reply_markup: { force_reply: true } });
    return true;
  }
  if (session.step === 4) {
    const z = Number(text.replace(',', '.'));
    if (!Number.isFinite(z) || z < -2000 || z > 2000) {
      await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Z должен быть числом от −2000 до 2000.', reply_markup: { force_reply: true } });
      return true;
    }
    const x = session.x;
    const owner = session.owner;
    const name = session.city_name;
    await env.DB.prepare(`UPDATE territory_approval_sessions SET z = ?, updated_at = ? WHERE territory_id = ?`).bind(String(z), Date.now(), session.territory_id).run();
    const preview = `🏙 <b>Проверьте данные города</b>\n\n` +
      `🏷 <b>Название:</b> ${escapeHtml(name)}\n` +
      `👤 <b>Владелец:</b> ${escapeHtml(owner)}\n` +
      `📍 <b>X:</b> ${escapeHtml(x)}\n` +
      `📍 <b>Z:</b> ${escapeHtml(String(z))}\n` +
      `🎨 Цвет метки будет выбран автоматически.\n\nВсё верно?`;
    await telegram(env, 'sendMessage', { chat_id: chatId, text: preview, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `territory_finalize:${session.territory_id}` }, { text: '↩️ Изменить', callback_data: `territory_edit:${session.territory_id}` }]] } });
    return true;
  }
  return true;
}

async function approveTerritoryManually(env, chatId, command) {
  // Старый формат команды оставляем как резервный способ:
  // /territory ID | название | владелец | X | Z
  const match = command.match(/^\/territory\s+(\S+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(-?\d+(?:\.\d+)?)\s*\|\s*(-?\d+(?:\.\d+)?)\s*$/i);
  if (!match) return false;

  const [, id, name, owner, x, z] = match;
  return finalizeTerritoryApproval(env, chatId, id, name, owner, x, z);
}

async function finalizeTerritoryApproval(env, chatId, id, name, owner, x, z) {
  if (!name || !owner) return false;

  const nx = Number(x);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(nz) || nx < -2000 || nx > 2000 || nz < -2000 || nz > 2000) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Координаты должны находиться в диапазоне X/Z от −2000 до 2000.",
    });
    return true;
  }

  const coords = `X ${nx} / Z ${nz}`;
  const palette = ["#A855F7", "#22C55E", "#38BDF8", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];
  const accent = palette[Math.floor(Math.random() * palette.length)];

  try {
    const result = await env.DB.prepare(`
      UPDATE territories
      SET name = ?, owner_input = ?, coords = ?, accent = ?, status = ?
      WHERE id = ? AND status = ?
    `).bind(name.trim(), owner.trim(), coords, accent, "approved", id, "pending").run();

    if (!result.meta?.changes) {
      await telegram(env, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Заявка не найдена или уже обработана.",
      });
      return true;
    }

    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>Город добавлен на карту</b>\n\n` +
        `🏙 <b>${escapeHtml(name.trim())}</b>\n` +
        `👤 Владелец: <b>${escapeHtml(owner.trim())}</b>\n` +
        `📍 Координаты: <code>${escapeHtml(coords)}</code>\n` +
        `🎨 Цвет метки выбран автоматически.`,
      parse_mode: "HTML",
    });
    return true;
  } catch (error) {
    console.error("manual territory approval error:", error);
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "❌ Не удалось сохранить город. Проверьте данные и попробуйте ещё раз.",
    });
    return true;
  }
}

async function rejectTerritoryManually(env, chatId, command) {
  const match = command.match(/^\/territory_reject\s+(\S+)$/i);
  if (!match) return false;

  try {
    const result = await env.DB.prepare(`
      UPDATE territories SET status = ? WHERE id = ? AND status = ?
    `).bind("rejected", match[1], "pending").run();

    if (!result.meta?.changes) {
      await telegram(env, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Заявка не найдена или уже обработана.",
      });
      return true;
    }

    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "❌ <b>Заявка отклонена.</b>",
      parse_mode: "HTML",
    });
    return true;
  } catch (error) {
    console.error("manual territory rejection error:", error);
    return false;
  }
}

async function handleTerritoryApprovalReply(env, message) {
  const reply = message?.reply_to_message;
  const text = String(message?.text || "").trim();
  const prompt = String(reply?.text || "");

  if (!reply || !prompt.startsWith("📝 Введите данные для одобрения заявки")) {
    return false;
  }

  const idMatch = prompt.match(/ID:\s*([^\s]+)/);
  if (!idMatch) return false;

  const match = text.match(/^\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(-?\d+(?:[.,]\d+)?)\s*\|\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!match) {
    await telegram(env, "sendMessage", {
      chat_id: message.chat.id,
      text:
        "⚠️ Не удалось распознать данные.\n\n" +
        "Отправьте одним сообщением в формате:\n" +
        "<code>Название города | Владелец города | X | Z</code>",
      parse_mode: "HTML",
      reply_to_message_id: message.message_id,
    });
    return true;
  }

  const [, name, owner, x, z] = match;
  return finalizeTerritoryApproval(
    env,
    message.chat.id,
    idMatch[1],
    name,
    owner,
    x.replace(",", "."),
    z.replace(",", ".")
  );
}

// ============================================================
// TELEGRAM WEBHOOK
// ============================================================

async function webhook(request, env) {
  let update;

  try {
    update = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON",
      },
      400
    );
  }

  const message = update?.message;
  const inspectorId = String(env.INSPECTOR_TELEGRAM_ID || "7966858383").trim();

  // Сначала обрабатываем callback-кнопки: Telegram присылает их отдельным update.
  const callbackQuery = update?.callback_query;

  if (callbackQuery?.data) {
    // Только инспектор может управлять заявками.
    if (String(callbackQuery.from?.id || "") !== inspectorId) {
      try {
        await telegram(env, "answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "⛔ Недостаточно прав.",
          show_alert: true,
        });
      } catch (e) { console.error("answerCallbackQuery forbidden error", e); }
      return json({ ok: true, handled: "forbidden_callback" });
    }
    return await handleTerritoryCallback(env, callbackQuery);
  }

  if (message?.text && inspectorId && String(message.from?.id || "") === inspectorId) {
    // Ответ на ForceReply формы должен иметь приоритет над общими шагами.
    if (await handleTerritoryApprovalReply(env, message)) {
      return json({ ok: true, handled: "territory_approval_reply" });
    }
    if (await handleTerritoryApprovalStep(env, message)) {
      return json({ ok: true, handled: "territory_approval_step" });
    }
    const command = message.text.trim();
    if (await approveTerritoryManually(env, message.chat.id, command)) return json({ ok: true, handled: "territory_approve" });
    if (await rejectTerritoryManually(env, message.chat.id, command)) return json({ ok: true, handled: "territory_reject" });
  }

  return json({ ok: true, ignored: true });
}

async function handleTerritoryCallback(env, callbackQuery) {
  if (!callbackQuery?.data) {
    return json({ ok: true, ignored: true });
  }

  const parts = callbackQuery.data.split(":");
  const action = parts[0];
  const territoryId = parts.slice(1).join(":");

  if (!["territory_ok", "territory_no", "territory_finalize", "territory_edit"].includes(action)) {
    try { await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "Неизвестное действие" }); } catch {}
    return json({ ok: true, ignored: true });
  }

  if (!territoryId) {
    return json({ ok: false, error: "Missing territory ID" }, 400);
  }

  // Отклонение происходит сразу.
  if (action === "territory_no") {
    try {
      const result = await env.DB.prepare(
        `UPDATE territories SET status = ? WHERE id = ? AND status = ?`
      ).bind("rejected", territoryId, "pending").run();

      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: result.meta?.changes ? "Заявка отклонена" : "Заявка уже обработана",
      });

      if (result.meta?.changes) {
        try {
          await ensureApprovalSessionsTable(env);
          await env.DB.prepare(`DELETE FROM territory_approval_sessions WHERE territory_id = ?`).bind(territoryId).run();
        } catch {}
        await telegram(env, "sendMessage", {
          chat_id: callbackQuery.message.chat.id,
          text: "❌ <b>Заявка отклонена.</b>",
          parse_mode: "HTML",
        });
      }

      try {
        await telegram(env, "editMessageReplyMarkup", {
          chat_id: callbackQuery.message.chat.id,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] },
        });
      } catch {}

      return json({ ok: true, territoryId, status: "rejected" });
    } catch (error) {
      console.error("reject callback error:", error);
      return json({ ok: false, error: "Database error" }, 500);
    }
  }

  // Одобрение запускает пошаговый ввод: название → владелец → X → Z.
  if (action === "territory_ok") {
    try { await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "Заявка одобрена. Заполняем данные." }); } catch {}
    try { await startTerritoryApproval(env, callbackQuery.message.chat.id, territoryId); }
    catch (error) { console.error("approve callback error:", error); return json({ ok: false, error: "Failed to start approval" }, 500); }
    try { await telegram(env, "editMessageReplyMarkup", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
    return json({ ok: true, territoryId, status: "awaiting_details" });
  }

  if (action === "territory_edit") {
    try {
      await startTerritoryApproval(env, callbackQuery.message.chat.id, territoryId);
      await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "Введите данные заново" });
      return json({ ok: true, territoryId, status: "editing" });
    } catch (error) {
      console.error("edit callback error:", error);
      return json({ ok: false, error: "Failed to restart approval" }, 500);
    }
  }

  if (action === "territory_finalize") {
    try {
      await ensureApprovalSessionsTable(env);
      const session = await env.DB.prepare(`SELECT * FROM territory_approval_sessions WHERE territory_id = ? AND inspector_chat_id = ?`).bind(territoryId, String(callbackQuery.message.chat.id)).first();
      if (!session || session.step !== 4) {
        await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "Сначала заполните все поля", show_alert: true });
        return json({ ok: true });
      }
      const result = await finalizeTerritoryApproval(env, callbackQuery.message.chat.id, territoryId, session.city_name, session.owner, session.x, session.z);
      await env.DB.prepare(`DELETE FROM territory_approval_sessions WHERE territory_id = ?`).bind(territoryId).run();
      try { await telegram(env, "editMessageReplyMarkup", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
      await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "Город добавлен" });
      return json({ ok: true, territoryId, status: "approved" });
    } catch (error) {
      console.error("finalize callback error:", error);
      return json({ ok: false, error: "Failed to finalize approval" }, 500);
    }
  }

}

// ============================================================
// MAIN WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ----------------------------------------------------------
    // CORS preflight
    // ----------------------------------------------------------

    if (request.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
        })
      );
    }

    // ----------------------------------------------------------
    // HEALTH
    // ----------------------------------------------------------

    if (
      url.pathname === "/api/health" &&
      request.method === "GET"
    ) {
      return health(env, request);
    }

    // ----------------------------------------------------------
    // GET TERRITORIES
    // ----------------------------------------------------------

    if (
      url.pathname === "/api/territories" &&
      request.method === "GET"
    ) {
      return getTerritories(env);
    }

    // ----------------------------------------------------------
    // CITY RECRUITMENT
    // ----------------------------------------------------------

    if (
      url.pathname === "/api/recruitment" &&
      request.method === "GET"
    ) {
      return getRecruitment(env);
    }

    if (
      url.pathname === "/api/recruitment" &&
      request.method === "POST"
    ) {
      return saveRecruitment(request, env);
    }

    // ----------------------------------------------------------
    // CREATE TERRITORY
    // ----------------------------------------------------------

    if (
      url.pathname === "/api/territories" &&
      request.method === "POST"
    ) {
      return createTerritory(request, env);
    }

    // ----------------------------------------------------------
    // TELEGRAM WEBHOOK
    // ----------------------------------------------------------

    if (
      url.pathname === "/api/webhook" &&
      request.method === "POST"
    ) {
      return webhook(request, env);
    }

    // ----------------------------------------------------------
    // ROOT
    // ----------------------------------------------------------

    if (
      url.pathname === "/" &&
      request.method === "GET"
    ) {
      return json({
        ok: true,
        worker: "voxygen",
        message: "Voxygen backend is running",

        endpoints: {
          health: "/api/health",
          territories: "/api/territories",
          recruitment: "/api/recruitment",
          webhook: "/api/webhook",
        },
      });
    }

    // ----------------------------------------------------------
    // NOT FOUND
    // ----------------------------------------------------------

    return json(
      {
        ok: false,
        error: "Route not found",
        pathname: url.pathname,

        availableRoutes: [
          "/",
          "/api/health",
          "/api/territories",
          "/api/recruitment",
          "/api/webhook",
        ],
      },
      404
    );
  },
};
