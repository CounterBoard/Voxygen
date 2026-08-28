// ============================================================
// VOXYGEN BACKEND WORKER
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

const BOT_NAME = 'voxygen';

// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ------------------------------------------------------------
// JSON helpers
// ------------------------------------------------------------

function json(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  );
}

function errorJson(message, status = 500, extra = {}) {
  return json(
    {
      ok: false,
      error: message,
      ...extra,
    },
    status
  );
}

// ------------------------------------------------------------
// HTML escaping for Telegram messages
// ------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]
  );
}

// ------------------------------------------------------------
// Telegram Bot API
// ------------------------------------------------------------

async function telegram(env, method, payload) {
  const token = String(env.BOT_TOKEN || '').trim();

  if (!token) {
    throw new Error('BOT_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram API error: ${data?.description || response.statusText}`
    );
  }

  return data;
}

// ------------------------------------------------------------
// HMAC-SHA256 helper
// ------------------------------------------------------------

async function hmacSha256(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(message)
    )
  );
}

// ------------------------------------------------------------
// Convert bytes -> hexadecimal
// ------------------------------------------------------------

function bytesToHex(bytes) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ------------------------------------------------------------
// Constant-time string comparison
// ------------------------------------------------------------

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ------------------------------------------------------------
// Telegram Mini App initData verification
//
// Telegram algorithm:
//
// secret_key = HMAC_SHA256(
//   key = "WebAppData",
//   message = bot_token
// )
//
// hash = HMAC_SHA256(
//   key = secret_key,
//   message = data_check_string
// )
//
// data_check_string = all fields except hash,
// sorted alphabetically,
// key=value separated by \n
//
// https://core.telegram.org/bots/webapps#validating-data
// ------------------------------------------------------------

async function verifyInitData(initData, botToken) {
  if (!initData) {
    return {
      ok: false,
      reason: 'initData is empty',
    };
  }

  if (!botToken) {
    return {
      ok: false,
      reason: 'BOT_TOKEN is not configured',
    };
  }

  try {
    // IMPORTANT:
    // initData must be parsed as the query string Telegram sends.
    const params = new URLSearchParams(initData);

    const receivedHash = params.get('hash');

    if (!receivedHash) {
      return {
        ok: false,
        reason: 'hash is missing from initData',
      };
    }

    // Remove hash from the data-check-string.
    params.delete('hash');

    // Telegram requires alphabetical sorting.
    const pairs = [...params.entries()].sort(
      ([keyA], [keyB]) => keyA.localeCompare(keyB)
    );

    const dataCheckString = pairs
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const encoder = new TextEncoder();

    // Step 1:
    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    //
    // Web Crypto represents HMAC as:
    // sign(key = "WebAppData", message = botToken)
    const secretKey = await hmacSha256(
      encoder.encode('WebAppData'),
      botToken
    );

    // Step 2:
    // calculated_hash =
    // HMAC_SHA256(secret_key, data_check_string)
    const calculatedHashBytes = await hmacSha256(
      secretKey,
      dataCheckString
    );

    const calculatedHash = bytesToHex(calculatedHashBytes);

    // Step 3:
    // Compare Telegram's hash with our calculated hash.
    if (!safeEqual(calculatedHash, receivedHash)) {
      return {
        ok: false,
        reason: 'Telegram hash mismatch',

        // Safe diagnostics.
        // We DO NOT expose bot token or initData.
        diagnostics: {
          receivedHashLength: receivedHash.length,
          calculatedHashLength: calculatedHash.length,
          parameterCount: pairs.length,
          parameters: pairs.map(([key]) => key),
        },
      };
    }

    // --------------------------------------------------------
    // Extract Telegram user
    // --------------------------------------------------------

    const userJson = params.get('user');

    let user = null;

    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch {
        return {
          ok: false,
          reason: 'Telegram user field contains invalid JSON',
        };
      }
    }

    return {
      ok: true,
      user,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || String(error),
    };
  }
}

// ------------------------------------------------------------
// GET /api/health
//
// This endpoint is ONLY for diagnostics.
// It checks that:
// 1. Worker is running
// 2. BOT_TOKEN exists
// 3. Telegram accepts the token
// 4. Which bot the token belongs to
//
// The actual token is NEVER returned.
// ------------------------------------------------------------

async function health(env) {
  const token = String(env.BOT_TOKEN || '').trim();

  if (!token) {
    return errorJson(
      'BOT_TOKEN is not configured',
      401,
      {
        diagnostics: {
          worker: BOT_NAME,
          tokenConfigured: false,
        },
      }
    );
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getMe`
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return errorJson(
        'BOT_TOKEN exists, but Telegram rejected it',
        401,
        {
          diagnostics: {
            worker: BOT_NAME,
            tokenConfigured: true,
            telegramResponse: data,
          },
        }
      );
    }

    return json({
      ok: true,

      worker: BOT_NAME,

      tokenConfigured: true,

      telegram: {
        botId: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
        isBot: data.result.is_bot,
      },

      message:
        'Worker and BOT_TOKEN are working correctly.',
    });
  } catch (error) {
    return errorJson(
      'Could not contact Telegram',
      502,
      {
        diagnostics: {
          worker: BOT_NAME,
          tokenConfigured: true,
          error: error?.message || String(error),
        },
      }
    );
  }
}

// ------------------------------------------------------------
// GET /api/territories
//
// Returns only approved territories.
// ------------------------------------------------------------

async function getTerritories(env) {
  try {
    const result = await env.DB.prepare(
      `
      SELECT
        id,
        name,
        owner_input,
        requested_by_id,
        requested_by_username,
        status,
        curator_score,
        community_score,
        votes,
        accent,
        created_at
      FROM territories
      WHERE status = ?
      ORDER BY created_at DESC
      `
    )
      .bind('approved')
      .all();

    return json({
      ok: true,
      territories: result.results || [],
    });
  } catch (error) {
    return errorJson(
      'Database error',
      500,
      {
        details: error?.message || String(error),
      }
    );
  }
}

// ------------------------------------------------------------
// POST /api/territories
//
// Creates a new territory request.
// ------------------------------------------------------------

async function createTerritory(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const initData = String(body?.initData || '');

  // ----------------------------------------------------------
  // Verify Telegram
  // ----------------------------------------------------------

  const verification = await verifyInitData(
    initData,
    env.BOT_TOKEN
  );

  if (!verification.ok) {
    return errorJson(
      verification.reason || 'Unauthorized',
      401,
      {
        diagnostics: verification.diagnostics || undefined,
      }
    );
  }

  const user = verification.user;

  if (!user || !user.id) {
    return errorJson(
      'Telegram user is missing from initData',
      401
    );
  }

  // ----------------------------------------------------------
  // Validate fields
  // ----------------------------------------------------------

  const name = String(body?.name || '').trim();
  const owner = String(body?.owner || '').trim();
  const coords = String(body?.coords || '').trim();

  if (!name) {
    return errorJson(
      'Territory name is required',
      400
    );
  }

  if (!owner) {
    return errorJson(
      'Territory owner is required',
      400
    );
  }

  // ----------------------------------------------------------
  // Generate ID
  // ----------------------------------------------------------

  const id = crypto.randomUUID();

  // ----------------------------------------------------------
  // Insert into D1
  // ----------------------------------------------------------

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
        user.username || '',
        'pending',
        Date.now()
      )
      .run();
  } catch (error) {
    return errorJson(
      'Database insert failed',
      500,
      {
        details: error?.message || String(error),
      }
    );
  }

  // ----------------------------------------------------------
  // Send notification to inspector
  // ----------------------------------------------------------

  try {
    const inspectorChatId = String(
      env.INSPECTOR_CHAT_ID || ''
    ).trim();

    if (!inspectorChatId) {
      return errorJson(
        'INSPECTOR_CHAT_ID is not configured',
        500
      );
    }

    await telegram(env, 'sendMessage', {
      chat_id: inspectorChatId,

      parse_mode: 'HTML',

      text:
        `🏙 <b>Новая заявка на территорию</b>\n\n` +
        `Название: <b>${escapeHtml(name)}</b>\n` +
        `Владелец: ${escapeHtml(owner)}\n` +
        `Координаты: ${escapeHtml(coords || '—')}\n` +
        `От: @${escapeHtml(user.username || '—')} ` +
        `(id ${escapeHtml(user.id)})`,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Подтвердить',
              callback_data: `territory_ok:${id}`,
            },
            {
              text: '❌ Отклонить',
              callback_data: `territory_no:${id}`,
            },
          ],
        ],
      },
    });
  } catch (error) {
    // Territory was already saved.
    // Tell frontend that DB succeeded but Telegram notification failed.
    return errorJson(
      'Territory saved, but Telegram notification failed',
      502,
      {
        details: error?.message || String(error),
        territoryId: id,
      }
    );
  }

  return json({
    ok: true,
    territoryId: id,
    message: 'Territory request created successfully.',
  });
}

// ------------------------------------------------------------
// POST /api/webhook
//
// Telegram sends callback_query here when inspector presses
// Confirm / Reject.
// ------------------------------------------------------------

async function webhook(request, env) {
  let update;

  try {
    update = await request.json();
  } catch {
    return errorJson('Invalid Telegram update JSON', 400);
  }

  const callbackQuery = update?.callback_query;

  if (!callbackQuery) {
    return new Response('ok');
  }

  const callbackData = callbackQuery.data || '';

  if (!callbackData.includes(':')) {
    return new Response('ok');
  }

  const [action, territoryId] =
    callbackData.split(':');

  if (
    action !== 'territory_ok' &&
    action !== 'territory_no'
  ) {
    return new Response('ok');
  }

  if (!territoryId) {
    return errorJson(
      'Territory ID is missing',
      400
    );
  }

  const status =
    action === 'territory_ok'
      ? 'approved'
      : 'rejected';

  // ----------------------------------------------------------
  // Update D1
  // ----------------------------------------------------------

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
    return errorJson(
      'Database update failed',
      500,
      {
        details: error?.message || String(error),
      }
    );
  }

  // ----------------------------------------------------------
  // Answer callback
  // ----------------------------------------------------------

  try {
    await telegram(env, 'answerCallbackQuery', {
      callback_query_id: callbackQuery.id,

      text:
        status === 'approved'
          ? 'Подтверждено'
          : 'Отклонено',
    });
  } catch {
    // Continue. The DB update already succeeded.
  }

  // ----------------------------------------------------------
  // Remove buttons
  // ----------------------------------------------------------

  try {
    if (
      callbackQuery.message?.chat?.id &&
      callbackQuery.message?.message_id
    ) {
      await telegram(env, 'editMessageReplyMarkup', {
        chat_id: callbackQuery.message.chat.id,

        message_id:
          callbackQuery.message.message_id,

        reply_markup: {
          inline_keyboard: [],
        },
      });
    }
  } catch {
    // Continue.
  }

  // ----------------------------------------------------------
  // Send result message
  // ----------------------------------------------------------

  try {
    if (callbackQuery.message?.chat?.id) {
      await telegram(env, 'sendMessage', {
        chat_id: callbackQuery.message.chat.id,

        text:
          status === 'approved'
            ? '✅ Территория подтверждена и появится в списке.'
            : '❌ Заявка отклонена.',
      });
    }
  } catch {
    // Continue.
  }

  return new Response('ok');
}

// ============================================================
// MAIN WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --------------------------------------------------------
    // OPTIONS / CORS preflight
    // --------------------------------------------------------

    if (request.method === 'OPTIONS') {
      return withCors(
        new Response(null, {
          status: 204,
        })
      );
    }

    // --------------------------------------------------------
    // Health
    // --------------------------------------------------------

    if (
      url.pathname === '/api/health' &&
      request.method === 'GET'
    ) {
      return health(env);
    }

    // --------------------------------------------------------
    // Territories GET
    // --------------------------------------------------------

    if (
      url.pathname === '/api/territories' &&
      request.method === 'GET'
    ) {
      return getTerritories(env);
    }

    // --------------------------------------------------------
    // Territories POST
    // --------------------------------------------------------

    if (
      url.pathname === '/api/territories' &&
      request.method === 'POST'
    ) {
      return createTerritory(request, env);
    }

    // --------------------------------------------------------
    // Telegram webhook
    // --------------------------------------------------------

    if (
      url.pathname === '/api/webhook' &&
      request.method === 'POST'
    ) {
      return webhook(request, env);
    }

    // --------------------------------------------------------
    // Root
    // --------------------------------------------------------

    if (
      url.pathname === '/' &&
      request.method === 'GET'
    ) {
      return json({
        ok: true,
        worker: BOT_NAME,
        message: 'Voxygen backend is running.',
        endpoints: {
          health: '/api/health',
          territories: '/api/territories',
          webhook: '/api/webhook',
        },
      });
    }

    // --------------------------------------------------------
    // Not found
    // --------------------------------------------------------

    return withCors(
      new Response('Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    );
  },
};
