export function createInspectorManagementService({
  requireMainInspector,
  ensureWorldTables,
  json,
} = {}) {
  async function listInspectors(request, env) {
    const auth = await requireMainInspector(request, env);
    if (auth.error) return auth.error;

    const rows = await env.DB.prepare(`
      SELECT telegram_id, telegram_username, added_by, created_at
      FROM inspectors
      ORDER BY created_at ASC
    `).all();

    return json({ ok: true, inspectors: rows.results || [] });
  }

  async function addInspector(request, env) {
    const auth = await requireMainInspector(request, env);
    if (auth.error) return auth.error;
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
    await ensureWorldTables(env);
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    const username = usernameInput || (await env.DB.prepare('SELECT telegram_username FROM users WHERE telegram_id = ?').bind(telegramId).first())?.telegram_username || '';
    try{
      await env.DB.prepare(`INSERT INTO inspectors (telegram_id, telegram_username, added_by, created_at)
        SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)
        ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`)
        .bind(telegramId, username || null, Number(auth.user.id), Date.now(), telegramId).run();
    }catch(error){
      if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
      throw error;
    }
    return json({ ok: true, telegramId, username: username || null });
  }

  async function removeInspector(request, env, url) {
    const auth = await requireMainInspector(request, env);
    if (auth.error) return auth.error;

    const telegramId = Number(url.pathname.split("/").pop());
    if (!Number.isSafeInteger(telegramId)) {
      return json({ ok: false, error: "Invalid Telegram ID" }, 400);
    }

    await env.DB.prepare("DELETE FROM inspectors WHERE telegram_id = ?")
      .bind(telegramId).run();

    return json({ ok: true });
  }

  return { listInspectors, addInspector, removeInspector };
}
