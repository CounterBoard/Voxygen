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

    const text =
      `🏙 <b>Новая заявка на территорию</b>\n\n` +
      `Название: <b>${escapeHtml(name)}</b>\n` +
      `Владелец: ${escapeHtml(owner)}\n` +
      `Координаты: ${escapeHtml(coords || "—")}\n` +
      `От: @${escapeHtml(username || "—")} ` +
      `(id ${escapeHtml(user.id)})\n\n` +
      `Для ручного подтверждения отправьте:\n` +
      `<code>/territory ${id} | название | владелец | X | Z</code>\n` +
      `Для отклонения: <code>/territory_reject ${id}</code>`;

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
  const inspectorId = String(env.INSPECTOR_TELEGRAM_ID || "").trim();

  if (message?.text && inspectorId && String(message.from?.id || "") === inspectorId) {
    const command = message.text.trim();
    if (await approveTerritoryManually(env, message.chat.id, command)) return json({ ok: true, handled: "territory_approve" });
    if (await rejectTerritoryManually(env, message.chat.id, command)) return json({ ok: true, handled: "territory_reject" });
  }

  // Ответ инспектора на запрос формы одобрения.
  if (message?.text && inspectorId && String(message.from?.id || "") === inspectorId) {
    if (await handleTerritoryApprovalReply(env, message)) {
      return json({ ok: true, handled: "territory_approval_reply" });
    }
  }

  const callbackQuery = update?.callback_query;

  if (!callbackQuery || !callbackQuery.data) {
    return json({
      ok: true,
      ignored: true,
    });
  }

  // Только инспектор может нажимать кнопки модерации.
  if (!inspectorId || String(callbackQuery.from?.id || "") !== inspectorId) {
    try {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "⛔ Недостаточно прав.",
        show_alert: true,
      });
    } catch {}
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const parts = callbackQuery.data.split(":");
  const action = parts[0];
  const territoryId = parts.slice(1).join(":");

  if (action !== "territory_ok" && action !== "territory_no") {
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

  // Одобрение: вместо команды бот открывает удобный ForceReply.
  try {
    const territory = await env.DB.prepare(`
      SELECT id, name, owner_input, coords
      FROM territories
      WHERE id = ? AND status = ?
    `).bind(territoryId, "pending").first();

    if (!territory) {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Заявка уже обработана",
        show_alert: true,
      });
      return json({ ok: true, territoryId, status: "already_processed" });
    }

    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Введите данные города",
    });

    await telegram(env, "sendMessage", {
      chat_id: callbackQuery.message.chat.id,
      text:
        `📝 <b>Введите данные для одобрения заявки</b>\n\n` +
        `ID: <code>${escapeHtml(territoryId)}</code>\n` +
        `Сейчас в заявке:\n` +
        `Название: ${escapeHtml(territory.name || "—")}\n` +
        `Владелец: ${escapeHtml(territory.owner_input || "—")}\n` +
        `Координаты: ${escapeHtml(territory.coords || "—")}\n\n` +
        `Одним сообщением:\n` +
        `<code>Название города | Владелец города | X | Z</code>\n\n` +
        `Например:\n` +
        `<code>Айсбург | @Steve | 420 | -180</code>`,
      parse_mode: "HTML",
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Айсбург | @Steve | 420 | -180",
      },
    });

    // После нажатия «Одобрить» кнопки больше не нужны.
    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}

    return json({ ok: true, territoryId, status: "awaiting_details" });
  } catch (error) {
    console.error("approve callback error:", error);
    return json({ ok: false, error: "Failed to start approval" }, 500);
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
