// ============================================================
// VOXYGEN BACKEND WORKER
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================


// ============================================================
// TELEGRAM MINI APP INIT DATA VERIFICATION
// ============================================================

async function verifyInitData(initData, botToken) {
  if (!initData) {
    return null;
  }

  if (!botToken) {
    throw new Error('BOT_TOKEN is not configured');
  }

  try {
    const params = new URLSearchParams(initData);

    const hash = params.get('hash');

    if (!hash) {
      return null;
    }

    params.delete('hash');

    // Telegram requires alphabetically sorted key=value pairs.
    const pairs = [...params.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const dataCheckString = pairs
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const encoder = new TextEncoder();

    // Secret key:
    // HMAC-SHA256(key = bot token, message = "WebAppData")
    const botTokenKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(botToken),
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

    const secretKeyBytes = await crypto.subtle.sign(
      'HMAC',
      botTokenKey,
      encoder.encode('WebAppData')
    );

    // Final HMAC key.
    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBytes,
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataCheckString)
    );

    const calculatedHash = [...new Uint8Array(signature)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) {
      return null;
    }

    const userJson = params.get('user');

    if (!userJson) {
      return null;
    }

    return JSON.parse(userJson);

  } catch (error) {
    console.error('verifyInitData error:', error);
    return null;
  }
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]
  );
}


// ============================================================
// TELEGRAM API
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || 'Unknown error'}`
    );
  }

  return data;
}


// ============================================================
// CORS
// ============================================================

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );
  headers.set(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}


// ============================================================
// JSON RESPONSE HELPER
// ============================================================

function json(data, status = 200) {
  return withCors(
    Response.json(data, {
      status
    })
  );
}


// ============================================================
// MAIN WORKER
// ============================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);


    // ========================================================
    // HEALTH CHECK / DIAGNOSTICS
    // ========================================================

    if (
      url.pathname === '/api/health' &&
      request.method === 'GET'
    ) {

      let databaseWorking = false;
      let databaseError = null;

      try {

        if (env.DB) {

          await env.DB
            .prepare('SELECT 1 AS ok')
            .first();

          databaseWorking = true;

        } else {

          databaseError = 'DB binding is missing';

        }

      } catch (error) {

        databaseError = String(error.message || error);

      }


      return json({
        ok: true,

        worker: 'voxygen',

        bot_token_configured: !!env.BOT_TOKEN,

        inspector_chat_id_configured:
          !!env.INSPECTOR_CHAT_ID,

        database_configured:
          !!env.DB,

        database_working:
          databaseWorking,

        database_error:
          databaseError,

        time:
          new Date().toISOString()
      });

    }


    // ========================================================
    // CORS PREFLIGHT
    // ========================================================

    if (request.method === 'OPTIONS') {

      return withCors(
        new Response(null, {
          status: 204
        })
      );

    }


    // ========================================================
    // GET /api/territories
    // Return approved territories
    // ========================================================

    if (
      url.pathname === '/api/territories' &&
      request.method === 'GET'
    ) {

      try {

        if (!env.DB) {
          return json({
            ok: false,
            error: 'DB binding is not configured'
          }, 500);
        }


        const result = await env.DB
          .prepare(
            `
            SELECT *
            FROM territories
            WHERE status = ?
            ORDER BY created_at DESC
            `
          )
          .bind('approved')
          .all();


        return json(
          result.results || []
        );


      } catch (error) {

        console.error(
          'GET /api/territories error:',
          error
        );

        return json({
          ok: false,
          error: String(
            error.message || error
          )
        }, 500);

      }

    }


    // ========================================================
    // POST /api/territories
    // Create new territory request
    // ========================================================

    if (
      url.pathname === '/api/territories' &&
      request.method === 'POST'
    ) {

      try {

        // ----------------------------------------------------
        // Check environment
        // ----------------------------------------------------

        if (!env.BOT_TOKEN) {

          return json({
            ok: false,
            error: 'BOT_TOKEN is not configured'
          }, 401);

        }


        if (!env.INSPECTOR_CHAT_ID) {

          return json({
            ok: false,
            error: 'INSPECTOR_CHAT_ID is not configured'
          }, 500);

        }


        if (!env.DB) {

          return json({
            ok: false,
            error: 'DB binding is not configured'
          }, 500);

        }


        // ----------------------------------------------------
        // Read request body
        // ----------------------------------------------------

        const body = await request.json();


        // ----------------------------------------------------
        // Validate initData
        // ----------------------------------------------------

        const user = await verifyInitData(
          body.initData,
          env.BOT_TOKEN
        );


        if (!user) {

          return json({
            ok: false,
            error: 'Unauthorized: invalid Telegram initData'
          }, 401);

        }


        // ----------------------------------------------------
        // Validate territory fields
        // ----------------------------------------------------

        if (!body.name) {

          return json({
            ok: false,
            error: 'Missing field: name'
          }, 400);

        }


        if (!body.owner) {

          return json({
            ok: false,
            error: 'Missing field: owner'
          }, 400);

        }


        // ----------------------------------------------------
        // Create territory ID
        // ----------------------------------------------------

        const id = crypto.randomUUID();


        // ----------------------------------------------------
        // Insert into D1
        // ----------------------------------------------------

        await env.DB
          .prepare(
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
            body.name,
            body.owner,
            body.coords || '',
            user.id,
            user.username || '',
            'pending',
            Date.now()
          )
          .run();


        // ----------------------------------------------------
        // Notify inspector in Telegram
        // ----------------------------------------------------

        await tg(
          env,
          'sendMessage',
          {
            chat_id:
              env.INSPECTOR_CHAT_ID,

            parse_mode: 'HTML',

            text:
              `🏙 <b>Новая заявка на территорию</b>\n\n` +

              `Название: <b>${escapeHtml(
                body.name
              )}</b>\n` +

              `Владелец: ${escapeHtml(
                body.owner
              )}\n` +

              `Координаты: ${escapeHtml(
                body.coords || '—'
              )}\n` +

              `От: @${escapeHtml(
                user.username || '—'
              )} (id ${user.id})`,

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Подтвердить',
                    callback_data:
                      `territory_ok:${id}`
                  },

                  {
                    text: '❌ Отклонить',
                    callback_data:
                      `territory_no:${id}`
                  }
                ]
              ]
            }
          }
        );


        // ----------------------------------------------------
        // Success
        // ----------------------------------------------------

        return json({
          ok: true,
          id
        });


      } catch (error) {

        console.error(
          'POST /api/territories error:',
          error
        );


        return json({
          ok: false,
          error: String(
            error.message || error
          )
        }, 500);

      }

    }


    // ========================================================
    // POST /api/webhook
    // Telegram callback buttons
    // ========================================================

    if (
      url.pathname === '/api/webhook' &&
      request.method === 'POST'
    ) {

      try {

        const update =
          await request.json();

        const callbackQuery =
          update.callback_query;


        // No callback query.
        if (
          !callbackQuery ||
          !callbackQuery.data
        ) {

          return new Response('ok');

        }


        const parts =
          callbackQuery.data.split(':');

        const action = parts[0];
        const id = parts[1];


        // ----------------------------------------------------
        // Check callback action
        // ----------------------------------------------------

        if (
          action !== 'territory_ok' &&
          action !== 'territory_no'
        ) {

          return new Response('ok');

        }


        if (!id) {

          await tg(
            env,
            'answerCallbackQuery',
            {
              callback_query_id:
                callbackQuery.id,

              text:
                'Ошибка: отсутствует ID заявки'
            }
          );

          return new Response('ok');

        }


        // ----------------------------------------------------
        // Determine new status
        // ----------------------------------------------------

        const status =
          action === 'territory_ok'
            ? 'approved'
            : 'rejected';


        // ----------------------------------------------------
        // Update database
        // ----------------------------------------------------

        if (!env.DB) {
          throw new Error(
            'DB binding is not configured'
          );
        }


        await env.DB
          .prepare(
            `
            UPDATE territories
            SET status = ?
            WHERE id = ?
            `
          )
          .bind(
            status,
            id
          )
          .run();


        // ----------------------------------------------------
        // Answer Telegram callback
        // ----------------------------------------------------

        await tg(
          env,
          'answerCallbackQuery',
          {
            callback_query_id:
              callbackQuery.id,

            text:
              status === 'approved'
                ? 'Подтверждено'
                : 'Отклонено'
          }
        );


        // ----------------------------------------------------
        // Remove buttons from original message
        // ----------------------------------------------------

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
                inline_keyboard: []
              }
            }
          );


          // --------------------------------------------------
          // Send result message
          // --------------------------------------------------

          await tg(
            env,
            'sendMessage',
            {
              chat_id:
                callbackQuery.message.chat.id,

              text:
                status === 'approved'
                  ? '✅ Территория подтверждена и появится в списке.'
                  : '❌ Заявка отклонена.'
            }
          );

        }


        return new Response('ok');


      } catch (error) {

        console.error(
          'POST /api/webhook error:',
          error
        );


        // Try to tell Telegram about callback error.
        try {

          const update =
            await request.clone().json();

          const callbackQuery =
            update.callback_query;

          if (
            callbackQuery &&
            callbackQuery.id
          ) {

            await tg(
              env,
              'answerCallbackQuery',
              {
                callback_query_id:
                  callbackQuery.id,

                text:
                  'Ошибка обработки заявки'
              }
            );

          }

        } catch (_) {
          // Ignore secondary error.
        }


        return json({
          ok: false,
          error: String(
            error.message || error
          )
        }, 500);

      }

    }


    // ========================================================
    // UNKNOWN ROUTE
    // ========================================================

    return withCors(
      new Response('Not found', {
        status: 404
      })
    );

  }

};
