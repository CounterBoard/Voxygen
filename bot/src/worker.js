// Verifies that a Mini App request really came from Telegram, per Telegram's
// documented algorithm: https://core.telegram.org/bots/webapps#validating-data
async function verifyInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const enc = new TextEncoder();
  const webAppDataKey = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', webAppDataKey, enc.encode(botToken));
  const secretKey = await crypto.subtle.importKey(
    'raw', secretKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', secretKey, enc.encode(dataCheckString));
  const computedHash = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');

  if (computedHash !== hash) return null;
  const userJson = params.get('user');
  return userJson ? JSON.parse(userJson) : null;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function tg(env, method, payload) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function withCors(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  resp.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  return resp;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    // Mini App reads the approved list from here.
    if (url.pathname === '/api/territories' && request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM territories WHERE status = ? ORDER BY created_at DESC'
      ).bind('approved').all();
      return withCors(Response.json(results));
    }

    // Mini App submits a new territory registration request.
    if (url.pathname === '/api/territories' && request.method === 'POST') {
      const body = await request.json();
      const user = await verifyInitData(body.initData, env.BOT_TOKEN);
      if (!user) return withCors(new Response('Unauthorized', { status: 401 }));
      if (!body.name || !body.owner) return withCors(new Response('Missing fields', { status: 400 }));

      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO territories (id, name, owner_input, coords, requested_by_id, requested_by_username, status, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(id, body.name, body.owner, body.coords || '', user.id, user.username || '', 'pending', Date.now()).run();

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
            { text: '✅ Подтвердить', callback_data: `territory_ok:${id}` },
            { text: '❌ Отклонить', callback_data: `territory_no:${id}` },
          ]],
        },
      });

      return withCors(Response.json({ ok: true }));
    }

    // Telegram sends button clicks here — register this URL with setWebhook.
    if (url.pathname === '/api/webhook' && request.method === 'POST') {
      const update = await request.json();
      const cq = update.callback_query;

      if (cq && cq.data) {
        const [action, id] = cq.data.split(':');

        if (action === 'territory_ok' || action === 'territory_no') {
          const status = action === 'territory_ok' ? 'approved' : 'rejected';
          await env.DB.prepare('UPDATE territories SET status = ? WHERE id = ?').bind(status, id).run();

          await tg(env, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: status === 'approved' ? 'Подтверждено' : 'Отклонено',
          });
          await tg(env, 'editMessageReplyMarkup', {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] },
          });
          await tg(env, 'sendMessage', {
            chat_id: cq.message.chat.id,
            text: status === 'approved' ? '✅ Территория подтверждена и появится в списке.' : '❌ Заявка отклонена.',
          });
        }
      }
      return withCors(new Response('ok'));
    }

    return withCors(new Response('Not found', { status: 404 }));
  },
};
