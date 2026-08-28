async function verifyInitData(initData, botToken) {
  if (!initData) return null;
  if (!botToken) throw new Error('BOT_TOKEN is not configured');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) return null;

  params.delete('hash');

  const pairs = [...params.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const dataCheckString = pairs
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const enc = new TextEncoder();

  const webAppDataKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    {
      name: 'HMAC',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const secretKeyBytes = await crypto.subtle.sign(
    'HMAC',
    webAppDataKey,
    enc.encode(botToken)
  );

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
    enc.encode(dataCheckString)
  );

  const computedHash = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedHash !== hash) {
    return null;
  }

  const userJson = params.get('user');

  if (!userJson) {
    return null;
  }

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
  );
}

async function tg(env, method, payload) {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not configured');
  }

  return fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );
}

function cors(response) {
  const headers = new Headers(response.headers);

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );
  headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function json(data, status = 200) {
  return cors(
    Response.json(data, {
      status
    })
  );
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // --------------------------------------------------
      // OPTIONS
      // --------------------------------------------------

      if (request.method === 'OPTIONS') {
        return cors(
          new Response(null, {
            status: 204
          })
        );
      }

      // --------------------------------------------------
      // ROOT
      // --------------------------------------------------

      if (url.pathname === '/') {
        return json({
          ok: true,
          service: 'voxygen backend',
          worker: 'online',
          endpoints: {
            health: '/api/health',
            territories: '/api/territories',
            webhook: '/api/webhook'
          }
        });
      }

      // --------------------------------------------------
      // DIAGNOSTICS
      // --------------------------------------------------

      if (
        url.pathname === '/api/health' &&
        request.method === 'GET'
      ) {
        let dbStatus = false;

        try {
          await env.DB.prepare(
            'SELECT 1'
          ).first();

          dbStatus = true;
        } catch (error) {
          dbStatus = false;
        }

        return json({
          ok: true,

          worker: 'online',

          bot_token_configured:
            Boolean(env.BOT_TOKEN),

          inspector_chat_id_configured:
            Boolean(env.INSPECTOR_CHAT_ID),

          database_configured:
            Boolean(env.DB),

          database_working:
            dbStatus,

          time:
            new Date().toISOString()
        });
      }

      // --------------------------------------------------
      // GET TERRITORIES
      // --------------------------------------------------

      if (
        url.pathname === '/api/territories' &&
        request.method === 'GET'
      ) {
        if (!env.DB) {
          return json(
            {
              ok: false,
              error: 'D1 database is not configured'
            },
            500
          );
        }

        const { results } = await env.DB.prepare(
          `
          SELECT *
          FROM territories
          WHERE status = ?
          ORDER BY created_at DESC
          `
        )
          .bind('approved')
          .all();

        return json({
          ok: true,
          results
        });
      }

      // --------------------------------------------------
      // POST TERRITORY
      // --------------------------------------------------

      if (
        url.pathname === '/api/territories' &&
        request.method === 'POST'
      ) {
        if (!env.BOT_TOKEN) {
          return json(
            {
              ok: false,
              error: 'BOT_TOKEN is not configured'
            },
            500
          );
        }

        if (!env.DB) {
          return json(
            {
              ok: false,
              error: 'D1 database is not configured'
            },
            500
          );
        }

        let body;

        try {
          body = await request.json();
        } catch {
          return json(
            {
              ok: false,
              error: 'Invalid JSON'
            },
            400
          );
        }

        let user;

        try {
          user = await verifyInitData(
            body.initData,
            env.BOT_TOKEN
          );
        } catch (error) {
          return json(
            {
              ok: false,
              error: error.message
            },
            500
          );
        }

        if (!user) {
          return json(
            {
              ok: false,
              error: 'Unauthorized: invalid Telegram initData'
            },
            401
          );
        }

        if (!body.name || !body.owner) {
          return json(
            {
              ok: false,
              error: 'Missing fields'
            },
            400
          );
        }

        const id = crypto.randomUUID();

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
            body.name,
            body.owner,
            body.coords || '',
            user.id,
            user.username || '',
            'pending',
            Date.now()
          )
          .run();

        if (!env.INSPECTOR_CHAT_ID) {
          return json(
            {
              ok: true,
              warning:
                'Territory saved, but INSPECTOR_CHAT_ID is not configured',
              id
            }
          );
        }

        const telegramResponse = await tg(
          env,
          'sendMessage',
          {
            chat_id: env.INSPECTOR_CHAT_ID,

            parse_mode: 'HTML',

            text:
              `🏙 <b>Новая заявка на территорию</b>\n\n` +
              `Название: <b>${escapeHtml(body.name)}</b>\n` +
              `Владелец: ${escapeHtml(body.owner)}\n` +
              `Координаты: ${escapeHtml(body.coords || '—')}\n` +
              `От: @${escapeHtml(user.username || '—')} (id ${user.id})`,

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Подтвердить',
                    callback_data: `territory_ok:${id}`
                  },
                  {
                    text: '❌ Отклонить',
                    callback_data: `territory_no:${id}`
                  }
                ]
              ]
            }
          }
        );

        const telegramData =
          await telegramResponse.json();

        if (!telegramData.ok) {
          return json(
            {
              ok: false,
              error:
                'Telegram API error',
              telegram:
                telegramData
            },
            500
          );
        }

        return json({
          ok: true,
          id
        });
      }

      // --------------------------------------------------
      // TELEGRAM WEBHOOK
      // --------------------------------------------------

      if (
        url.pathname === '/api/webhook' &&
        request.method === 'POST'
      ) {
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

            await env.DB.prepare(
              `
              UPDATE territories
              SET status = ?
              WHERE id = ?
              `
            )
              .bind(status, id)
              .run();

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

            if (
              callbackQuery.message
            ) {
              await tg(
                env,
                'editMessageReplyMarkup',
                {
                  chat_id:
                    callbackQuery.message
                      .chat.id,

                  message_id:
                    callbackQuery.message
                      .message_id,

                  reply_markup: {
                    inline_keyboard: []
                  }
                }
              );

              await tg(
                env,
                'sendMessage',
                {
                  chat_id:
                    callbackQuery.message
                      .chat.id,

                  text:
                    status === 'approved'
                      ? '✅ Территория подтверждена и появится в списке.'
                      : '❌ Заявка отклонена.'
                }
              );
            }
          }
        }

        return json({
          ok: true
        });
      }

      // --------------------------------------------------
      // UNKNOWN ROUTE
      // --------------------------------------------------

      return json(
        {
          ok: false,
          error: 'Not found',
          path: url.pathname
        },
        404
      );
    } catch (error) {
      return json(
        {
          ok: false,
          error: error.message || String(error)
        },
        500
      );
    }
  }
};
