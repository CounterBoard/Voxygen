// ============================================================
// Telegram Mini App initData validation
// ============================================================

async function verifyInitData(initData, botToken) {
  if (!initData) {
    return {
      user: null,
      reason: 'initData is empty',
      debug: {
        hasInitData: false,
        initDataLength: 0,
        hasHash: false,
        hasUser: false,
      },
    };
  }

  if (!botToken) {
    return {
      user: null,
      reason: 'BOT_TOKEN is not configured',
      debug: {
        hasInitData: true,
        initDataLength: initData.length,
        hasHash: false,
        hasUser: false,
      },
    };
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get('hash');
  const userJson = params.get('user');

  if (!receivedHash) {
    return {
      user: null,
      reason: 'initData does not contain hash',
      debug: {
        hasInitData: true,
        initDataLength: initData.length,
        hasHash: false,
        hasUser: !!userJson,
      },
    };
  }

  params.delete('hash');

  // Telegram requires fields to be sorted alphabetically.
  const pairs = Array.from(params.entries()).sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });

  const dataCheckString = pairs
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const encoder = new TextEncoder();

  // Telegram validation algorithm:
  //
  // secret_key = HMAC-SHA256(
  //   key = bot_token,
  //   message = "WebAppData"
  // )
  //
  // hash = HMAC-SHA256(
  //   key = secret_key,
  //   message = data_check_string
  // )

  const botTokenKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(botToken),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const secretKeyBytes = await crypto.subtle.sign(
    'HMAC',
    botTokenKey,
    encoder.encode('WebAppData')
  );

  const secretKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(dataCheckString)
  );

  const calculatedHash = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const hashMatches =
    calculatedHash.toLowerCase() === receivedHash.toLowerCase();

  if (!hashMatches) {
    return {
      user: null,
      reason: 'Telegram hash mismatch',
      debug: {
        hasInitData: true,
        initDataLength: initData.length,
        hasHash: true,
        receivedHashLength: receivedHash.length,
        calculatedHashLength: calculatedHash.length,
        hasUser: !!userJson,
        dataCheckStringLength: dataCheckString.length,
        parameterNames: pairs.map(([key]) => key),
        botTokenConfigured: true,
        hashMatches: false,
      },
    };
  }

  let user = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      return {
        user: null,
        reason: 'Telegram user field contains invalid JSON',
        debug: {
          hasInitData: true,
          initDataLength: initData.length,
          hasHash: true,
          hasUser: true,
          dataCheckStringLength: dataCheckString.length,
          parameterNames: pairs.map(([key]) => key),
          botTokenConfigured: true,
          hashMatches: true,
        },
      };
    }
  }

  if (!user) {
    return {
      user: null,
      reason: 'Telegram initData is valid, but user is missing',
      debug: {
        hasInitData: true,
        initDataLength: initData.length,
        hasHash: true,
        hasUser: false,
        dataCheckStringLength: dataCheckString.length,
        parameterNames: pairs.map(([key]) => key),
        botTokenConfigured: true,
        hashMatches: true,
      },
    };
  }

  return {
    user,
    reason: null,
    debug: {
      hasInitData: true,
      initDataLength: initData.length,
      hasHash: true,
      hasUser: true,
      dataCheckStringLength: dataCheckString.length,
      parameterNames: pairs.map(([key]) => key),
      botTokenConfigured: true,
      hashMatches: true,
      telegramUserId: user.id,
      telegramUsername: user.username || null,
    },
  };
}


// ============================================================
// HTML escaping
// ============================================================

function escapeHtml(value) {
  return String(value || '').replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]
  );
}


// ============================================================
// Telegram Bot API
// ============================================================

async function tg(env, method, payload) {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Telegram API HTTP ${response.status}: ${text}`
    );
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `Telegram API returned invalid JSON: ${text}`
    );
  }

  if (!result.ok) {
    throw new Error(
      `Telegram API error: ${result.description || text}`
    );
  }

  return result;
}


// ============================================================
// CORS
// ============================================================

function withCors(response) {
  response.headers.set(
    'Access-Control-Allow-Origin',
    '*'
  );

  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );

  return response;
}


// ============================================================
// JSON error helper
// ============================================================

function jsonError(message, status = 500, extra = {}) {
  return withCors(
    Response.json(
      {
        ok: false,
        error: message,
        ...extra,
      },
      {
        status,
      }
    )
  );
}


// ============================================================
// Worker
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --------------------------------------------------------
    // CORS preflight
    // --------------------------------------------------------

    if (request.method === 'OPTIONS') {
      return withCors(
        new Response(null, {
          status: 204,
        })
      );
    }


    // --------------------------------------------------------
    // GET /api/territories
    //
    // Returns approved territories.
    // --------------------------------------------------------

    if (
      url.pathname === '/api/territories' &&
      request.method === 'GET'
    ) {
      try {
        const { results } = await env.DB.prepare(
          `SELECT *
           FROM territories
           WHERE status = ?
           ORDER BY created_at DESC`
        )
          .bind('approved')
          .all();

        return withCors(
          Response.json(results)
        );

      } catch (error) {
        console.error(
          'GET /api/territories error:',
          error
        );

        return jsonError(
          error?.message || String(error),
          500
        );
      }
    }


    // --------------------------------------------------------
    // POST /api/territories
    //
    // Creates a pending territory request.
    // --------------------------------------------------------

    if (
      url.pathname === '/api/territories' &&
      request.method === 'POST'
    ) {
      try {
        const body = await request.json();

        // ----------------------------------------------
        // Validate Telegram initData
        // ----------------------------------------------

        const validation = await verifyInitData(
          body.initData,
          env.BOT_TOKEN
        );

        if (!validation.user) {
          console.error(
            'Telegram initData validation failed:',
            validation.reason,
            validation.debug
          );

          return jsonError(
            `Unauthorized: ${validation.reason}`,
            401,
            {
              debug: validation.debug,
            }
          );
        }

        const user = validation.user;


        // ----------------------------------------------
        // Validate request fields
        // ----------------------------------------------

        if (!body.name) {
          return jsonError(
            'Missing territory name',
            400
          );
        }

        if (!body.owner) {
          return jsonError(
            'Missing territory owner',
            400
          );
        }


        // ----------------------------------------------
        // Create territory ID
        // ----------------------------------------------

        const id = crypto.randomUUID();


        // ----------------------------------------------
        // Insert into D1
        // ----------------------------------------------

        await env.DB.prepare(
          `INSERT INTO territories (
            id,
            name,
            owner_input,
            coords,
            requested_by_id,
            requested_by_username,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            id,
            body.name,
            body.owner,
            body.coords || '',
            user.id,
            user.username || '',
            'pending',
            Date.now()
          )
          .run();


        // ----------------------------------------------
        // Notify inspector in Telegram
        // ----------------------------------------------

        if (!env.INSPECTOR_CHAT_ID) {
          throw new Error(
            'INSPECTOR_CHAT_ID is not configured'
          );
        }

        await tg(env, 'sendMessage', {
          chat_id: env.INSPECTOR_CHAT_ID,
          parse_mode: 'HTML',

          text:
            `🏙 <b>Новая заявка на территорию</b>\n\n` +
            `Название: <b>${escapeHtml(body.name)}</b>\n` +
            `Владелец: ${escapeHtml(body.owner)}\n` +
            `Координаты: ${escapeHtml(body.coords || '—')}\n` +
            `От: @${escapeHtml(user.username || '—')} (id ${user.id})`,

          reply_markup: {
            inline_keyboard: [[
              {
                text: '✅ Подтвердить',
                callback_data: `territory_ok:${id}`,
              },
              {
                text: '❌ Отклонить',
                callback_data: `territory_no:${id}`,
              },
            ]],
          },
        });


        // ----------------------------------------------
        // Success
        // ----------------------------------------------

        return withCors(
          Response.json({
            ok: true,
            id,
          })
        );

      } catch (error) {
        console.error(
          'POST /api/territories error:',
          error
        );

        return jsonError(
          error?.message || String(error),
          500
        );
      }
    }


    // --------------------------------------------------------
    // POST /api/webhook
    //
    // Telegram sends inspector button clicks here.
    // --------------------------------------------------------

    if (
      url.pathname === '/api/webhook' &&
      request.method === 'POST'
    ) {
      try {
        const update = await request.json();

        const callbackQuery =
          update.callback_query;

        if (
          callbackQuery &&
          callbackQuery.data
        ) {
          const [action, id] =
            callbackQuery.data.split(':');

          if (
            action === 'territory_ok' ||
            action === 'territory_no'
          ) {
            const status =
              action === 'territory_ok'
                ? 'approved'
                : 'rejected';


            // ------------------------------------------
            // Update D1
            // ------------------------------------------

            await env.DB.prepare(
              `UPDATE territories
               SET status = ?
               WHERE id = ?`
            )
              .bind(status, id)
              .run();


            // ------------------------------------------
            // Answer button click
            // ------------------------------------------

            await tg(
              env,
              'answerCallbackQuery',
              {
                callback_query_id:
                  callbackQuery.id,

                text:
                  status === 'approved'
                    ? 'Подтверждено'
                    : 'Отклонено',
              }
            );


            // ------------------------------------------
            // Remove buttons
            // ------------------------------------------

            if (
              callbackQuery.message
            ) {
              await tg(
                env,
                'editMessageReplyMarkup',
                {
                  chat_id:
                    callbackQuery.message.chat.id,

                  message_id:
                    callbackQuery.message.message_id,

                  reply_markup: {
                    inline_keyboard: [],
                  },
                }
              );


              // ----------------------------------------
              // Send result message
              // ----------------------------------------

              await tg(
                env,
                'sendMessage',
                {
                  chat_id:
                    callbackQuery.message.chat.id,

                  text:
                    status === 'approved'
                      ? '✅ Территория подтверждена и появится в списке.'
                      : '❌ Заявка отклонена.',
                }
              );
            }
          }
        }

        return withCors(
          new Response('ok')
        );

      } catch (error) {
        console.error(
          'Webhook error:',
          error
        );

        return jsonError(
          error?.message || String(error),
          500
        );
      }
    }


    // --------------------------------------------------------
    // Unknown route
    // --------------------------------------------------------

    return withCors(
      new Response(
        'Not found',
        {
          status: 404,
        }
      )
    );
  },
};
