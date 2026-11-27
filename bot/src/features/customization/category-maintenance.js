export async function cleanupCustomizationCategories(env) {
  // Tags are derived from active visuals. A tag without at least one visual is removed.
  const cats = await env.DB.prepare('SELECT id,name FROM customization_categories').all();
  for (const cat of cats.results || []) {
    const found = await env.DB.prepare(`
      SELECT 1 FROM customization_items
      WHERE active=1
        AND (
          instr(
            ',' || replace(lower(COALESCE(categories_text,'')),' ','') || ',',
            ',' || replace(lower(?),' ','') || ','
          ) > 0
          OR category_id = ?
        )
      LIMIT 1
    `).bind(cat.name, cat.id).first();
    if (!found) await env.DB.prepare('DELETE FROM customization_categories WHERE id=?').bind(cat.id).run();
  }
  // Keep category order compact and stable.
  const ordered = await env.DB.prepare('SELECT id FROM customization_categories ORDER BY sort_order ASC, created_at ASC, name ASC').all();
  let n = 0;
  for (const row of ordered.results || []) {
    await env.DB.prepare('UPDATE customization_categories SET sort_order=? WHERE id=?').bind(n++, row.id).run();
  }
}


async function inviteResident(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  let body; try { body = await request.json(); } catch { return json({ ok:false,error:'Invalid JSON' },400); }
  const territoryId=String(body?.territoryId||'').trim(), nickname=normalizeMcNickname(body?.nickname);
  if(!territoryId||!nickname) return json({ok:false,error:'territoryId и ник обязательны'},400);
  const inviterLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first();
  if(inviterLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory||!(await isTerritoryManager(env,territoryId,auth.user.id))) return json({ok:false,error:'Только основатель/мэр может приглашать жителей'},403);
  const target=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE lower(mc_nickname)=lower(?) LIMIT 1`).bind(nickname).first();
  if(target){const targetLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(Number(target.telegram_id)).first();if(targetLock)return json({ok:false,error:'Приглашаемый аккаунт находится в процессе удаления'},409);}
  if(!target) {
    await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE territory_id=? AND target_telegram_id IS NULL AND lower(target_nickname)=lower(?) AND status='pending'`).bind(Date.now(),territoryId,nickname).run();
    const inviteId=crypto.randomUUID();
    try{await env.DB.prepare(`INSERT INTO city_invites (id,territory_id,target_telegram_id,target_nickname,invited_by,invite_type,status,created_at) VALUES (?,?,NULL,?,?, 'join','pending',?)`).bind(inviteId,territoryId,nickname,Number(auth.user.id),Date.now()).run();}
    catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
    return json({ok:true,pendingNickname:true,inviteId,message:'Приглашение сохранено. Оно будет отправлено после подтверждения этого никнейма.'});
  }
if(String(target.telegram_id)===String(auth.user.id)) return json({ok:false,error:'Нельзя пригласить самого себя'},400);
  const membership=await env.DB.prepare('SELECT territory_id FROM city_memberships WHERE telegram_id=? AND territory_id=?').bind(Number(target.telegram_id),territoryId).first();
  const inviteType='join';
  await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE territory_id=? AND status='pending' AND (target_telegram_id=? OR (target_telegram_id IS NULL AND lower(target_nickname)=lower(?)))`).bind(Date.now(),territoryId,Number(target.telegram_id),nickname).run();
  const inviteId=crypto.randomUUID();
  try{await env.DB.prepare(`INSERT INTO city_invites (id,territory_id,target_telegram_id,target_nickname,invited_by,invite_type,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)`).bind(inviteId,territoryId,Number(target.telegram_id),nickname,Number(auth.user.id),inviteType,Date.now()).run();}
  catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
  if(target.status==='verified') await sendResidentInviteOnce(env,{id:inviteId,territory_id:territoryId,target_telegram_id:Number(target.telegram_id),target_nickname:nickname,invite_type:inviteType},territory.name);
  return json({ok:true,inviteId,inviteType,pendingNickname:target.status!=='verified'});
}

async function sendResidentInvite(env, invite, cityName) {
  if (!invite.target_telegram_id) return false;
  const title = invite.invite_type === 'transfer' ? '🔄 Приглашение сменить город' : '🏙 Приглашение в город';
  const text = `${title}\n\nВас приглашают в город «${escapeHtml(cityName)}».\n\nВыберите действие:`;
  try {
    const result = await telegram(env, 'sendMessage', {
      chat_id: invite.target_telegram_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[
        { text: '✅ Согласиться', callback_data: `resident_accept:${invite.id}` },
        { text: '❌ Отказаться', callback_data: `resident_reject:${invite.id}` },
      ]] },
    });
    const delivered = Boolean(result.response.ok && result.data?.ok);
    if (!delivered) console.error('Resident invite notification rejected:', invite.id, result.data?.error_code || result.response.status, result.data?.description || '');
    return delivered;
  } catch (error) {
    console.error('Resident invite notification error:', invite.id, error);
    return false;
  }
}

async function sendResidentInviteOnce(env, invite, cityName) {
  const now = Date.now();
  const staleClaim = now - 5 * 60 * 1000;
  const claim = await env.DB.prepare(`UPDATE city_invites
    SET notification_claimed_at=?
    WHERE id=? AND status='pending' AND notification_sent_at IS NULL
      AND (notification_claimed_at IS NULL OR notification_claimed_at<?)`).bind(now, invite.id, staleClaim).run();
  if (!claim.meta?.changes) return false;

  const delivered = await sendResidentInvite(env, invite, cityName);
  if (delivered) {
    await env.DB.prepare(`UPDATE city_invites SET notification_sent_at=?,notification_claimed_at=NULL
      WHERE id=? AND status='pending' AND notification_claimed_at=?`).bind(now, invite.id, now).run();
  }
  // On a failed delivery, keep the short lease. This prevents every incoming
  // Telegram message from immediately retrying the same failed notification.
  return delivered;
}

async function hideRecruitmentIfContactLost(env, territoryId, targetId, usernameHint='') {
  await ensureRecruitmentTable(env);
  const recruitment=await env.DB.prepare(`SELECT contact_username,enabled FROM recruitment WHERE territory_id=?`).bind(territoryId).first();
  if(!recruitment || Number(recruitment.enabled||0)!==1 || !recruitment.contact_username) return false;
  const target=await env.DB.prepare(`SELECT telegram_username FROM users WHERE telegram_id=?`).bind(Number(targetId)).first();
  const contact=normalizeUsername(recruitment.contact_username).toLowerCase();
  const candidates=[target?.telegram_username,usernameHint].map(v=>normalizeUsername(v).toLowerCase()).filter(Boolean);
  if(!candidates.includes(contact)) return false;
  await env.DB.prepare(`UPDATE recruitment SET enabled=0,contact_username=NULL,updated_at=? WHERE territory_id=?`).bind(Date.now(),territoryId).run();
  return true;
}
