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
    const result = await env.DB.prepare(
      `
      SELECT *
      FROM territories
      WHERE status = ?
      ORDER BY created_at DESC
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
      `(id ${escapeHtml(user.id)})`;

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
              {
                text: "✅ Подтвердить",
                callback_data: `territory_ok:${id}`,
              },
              {
                text: "❌ Отклонить",
                callback_data: `territory_no:${id}`,
              },
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

  const callbackQuery = update?.callback_query;

  if (!callbackQuery || !callbackQuery.data) {
    return json({
      ok: true,
      ignored: true,
    });
  }

  const parts = callbackQuery.data.split(":");

  const action = parts[0];
  const territoryId = parts.slice(1).join(":");

  if (
    action !== "territory_ok" &&
    action !== "territory_no"
  ) {
    return json({
      ok: true,
      ignored: true,
    });
  }

  if (!territoryId) {
    return json(
      {
        ok: false,
        error: "Missing territory ID",
      },
      400
    );
  }

  const status =
    action === "territory_ok"
      ? "approved"
      : "rejected";

  try {
    await env.DB.prepare(
      `
      UPDATE territories
      SET status = ?
      WHERE id = ?
      `
    )
      .bind(status, territoryId)
      .run();
  } catch (error) {
    console.error(
      "UPDATE territory error:",
      error
    );

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

  // Ответ на нажатие кнопки
  try {
    await telegram(
      env,
      "answerCallbackQuery",
      {
        callback_query_id: callbackQuery.id,
        text:
          status === "approved"
            ? "Подтверждено"
            : "Отклонено",
      }
    );
  } catch (error) {
    console.error(
      "answerCallbackQuery error:",
      error
    );
  }

  // Убираем кнопки
  try {
    const message = callbackQuery.message;

    if (message) {
      await telegram(
        env,
        "editMessageReplyMarkup",
        {
          chat_id: message.chat.id,
          message_id: message.message_id,

          reply_markup: {
            inline_keyboard: [],
          },
        }
      );
    }
  } catch (error) {
    console.error(
      "editMessageReplyMarkup error:",
      error
    );
  }

  // Отправляем сообщение инспектору
  try {
    const message = callbackQuery.message;

    if (message) {
      await telegram(
        env,
        "sendMessage",
        {
          chat_id: message.chat.id,

          text:
            status === "approved"
              ? "✅ Территория подтверждена и появится в списке."
              : "❌ Заявка отклонена.",
        }
      );
    }
  } catch (error) {
    console.error(
      "sendMessage result error:",
      error
    );
  }

  return json({
    ok: true,
    territoryId,
    status,
  });
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
          "/api/webhook",
        ],
      },
      404
    );
  },
};
