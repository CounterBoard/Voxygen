/**
 * Territory resident membership and invitation workflows.
 *
 * HTTP routing, shared authorization, D1 initialization and cross-feature side
 * effects are injected by the Worker so this module stays independent of the
 * Worker entry point.
 */
export function createTerritoryMembershipService({
  requireUser,
  ensureWorldTables,
  json,
  normalizeMcNickname,
  isTerritoryManager,
  telegram,
  escapeHtml,
  getTerritoryManagerRows,
  skinUrlFromTexture,
  notifyTerritoryManagersDirect,
  formatTelegramNickname,
  hideRecruitmentIfContactLost,
  reconcileTerritoryVisualEquipment,
  evaluateAchievementsForTerritory,
  ensureFirstCityMarker,
} = {}) {
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

async function getCityManagement(request, env, url) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env);
  const territoryId=String(url.searchParams.get('territoryId')||'').trim(); const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  const isManager=await isTerritoryManager(env,territoryId,auth.user.id);
  const isMember=!!(await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,Number(auth.user.id)).first());
  if(!isManager&&!isMember)return json({ok:false,error:'Недостаточно прав'},403);
  const [members,invites,managers,recruitment]=await Promise.all([
    env.DB.prepare(`SELECT cm.telegram_id,u.mc_nickname,u.telegram_username,u.xuid,u.skin_texture_id,cm.joined_at FROM city_memberships cm LEFT JOIN users u ON u.telegram_id=cm.telegram_id WHERE cm.territory_id=? ORDER BY cm.joined_at ASC`).bind(territoryId).all(),
    isManager ? env.DB.prepare(`SELECT ci.id,ci.target_telegram_id,ci.target_nickname,ci.invite_type,ci.created_at FROM city_invites ci WHERE ci.territory_id=? AND ci.status='pending' ORDER BY ci.created_at DESC`).bind(territoryId).all() : Promise.resolve({results:[]}),
    getTerritoryManagerRows(env,territoryId),
    env.DB.prepare(`SELECT contact_username FROM recruitment WHERE territory_id=?`).bind(territoryId).first(),
  ]);
  return json({ok:true,owner:isManager,isManager,members:(members.results||[]).map(m=>({...m,skin_url:skinUrlFromTexture(m.skin_texture_id,m.mc_nickname)})),invites:invites.results||[],managers,managerCount:managers.length,recruitmentUsername:recruitment?.contact_username||''});
}

async function cancelResidentInvite(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const inviteId=String(body?.inviteId||'').trim(); const invite=await env.DB.prepare(`SELECT ci.id,ci.territory_id FROM city_invites ci WHERE ci.id=? AND ci.status='pending'`).bind(inviteId).first(); if(!invite)return json({ok:false,error:'Приглашение не найдено'},404);
  if(!(await isTerritoryManager(env,invite.territory_id,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403); await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE id=?`).bind(Date.now(),inviteId).run(); return json({ok:true});
}

async function removeResident(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),targetId=Number(body?.telegramId); if(!territoryId||!Number.isSafeInteger(targetId)||targetId<=0)return json({ok:false,error:'territoryId и telegramId обязательны'},400);
  const accountLocks=await env.DB.prepare(`SELECT telegram_id FROM account_deletion_locks WHERE telegram_id IN (?,?)`).bind(Number(auth.user.id),targetId).all();
  if((accountLocks.results||[]).length)return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  const [territory, target] = await Promise.all([
    env.DB.prepare(`SELECT name FROM territories WHERE id=? LIMIT 1`).bind(territoryId).first(),
    env.DB.prepare(`SELECT mc_nickname,telegram_username FROM users WHERE telegram_id=? LIMIT 1`).bind(targetId).first(),
  ]);
  const deleted = await env.DB.prepare('DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?').bind(territoryId,targetId).run();
  if (!deleted.meta?.changes) return json({ok:false,error:'Житель не найден в этой территории'},404);
  const territoryName = String(territory?.name || 'Территория');
  const residentName = String(target?.mc_nickname || target?.telegram_username || `id${targetId}`);
  // Notify current founders/mayors immediately after the membership is removed.
  // Optional follow-up maintenance must not prevent this important notice.
  await notifyTerritoryManagersDirect(env,territoryId,`🚪 <b>Изменение состава жителей</b>\n\n🏙 ${escapeHtml(territoryName)}\n👤 ${formatTelegramNickname(residentName)} больше не является жителем территории.`).catch(error=>console.error('Resident removal manager notification failed:',territoryId,error));
  await hideRecruitmentIfContactLost(env,territoryId,targetId).catch(error=>console.error('Recruitment cleanup after resident removal:',territoryId,error));
  await reconcileTerritoryVisualEquipment(env,territoryId).catch(error=>console.error('Equipment reconciliation after resident removal:',error));
  try{await telegram(env,'sendMessage',{chat_id:targetId,text:`🚪 Вы исключены из территории\n\n🏙 ${escapeHtml(territoryName)}`,parse_mode:'HTML'})}catch(error){console.error('Resident removal notice failed:',territoryId,targetId,error)}
  await evaluateAchievementsForTerritory(env,territoryId).catch(error=>console.error('Achievement evaluation after resident removal:',error));
  return json({ok:true});
}

async function leaveTerritory(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const territoryId = String(body?.territoryId || '').trim();
  const userId = Number(auth.user.id);
  if (!territoryId) return json({ ok: false, error: 'territoryId is required' }, 400);

  const territory = await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved' LIMIT 1`).bind(territoryId).first();
  if (!territory) return json({ ok: false, error: 'Territory not found' }, 404);
  if (await isTerritoryManager(env, territoryId, userId)) {
    return json({ ok: false, error: 'Основатель/мэр не может покинуть территорию' }, 403);
  }

  const membership = await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId, userId).first();
  if (!membership) return json({ ok: false, error: 'Вы не состоите в этой территории' }, 404);

  const departingUser = await env.DB.prepare(`SELECT mc_nickname,telegram_username FROM users WHERE telegram_id=? LIMIT 1`).bind(userId).first();
  const deleted = await env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId, userId).run();
  if (!deleted.meta?.changes) return json({ ok: false, error: 'Вы не состоите в этой территории' }, 404);
  const residentName = String(departingUser?.mc_nickname || departingUser?.telegram_username || `id${userId}`);
  await notifyTerritoryManagersDirect(env,territoryId,`🚪 <b>Изменение состава жителей</b>\n\n🏙 ${escapeHtml(territory.name || 'Территория')}\n👤 ${formatTelegramNickname(residentName)} больше не является жителем территории.`).catch(error=>console.error('Resident leave manager notification failed:',territoryId,error));
  await hideRecruitmentIfContactLost(env, territoryId, userId).catch(error => console.error('Recruitment cleanup after resident leave:', territoryId, error));
  await reconcileTerritoryVisualEquipment(env, territoryId).catch(error => console.error('Equipment reconciliation after resident leave:', error));
  await evaluateAchievementsForTerritory(env, territoryId).catch(error => console.error('Achievement evaluation after resident leave:', error));

  return json({ ok: true });
}

async function handleResidentInviteCallback(env, callbackQuery) {
  const [action, inviteId]=String(callbackQuery.data||'').split(':'); if(!inviteId||!['resident_accept','resident_reject'].includes(action))return json({ok:true}); await ensureWorldTables(env); const actorId=Number(callbackQuery.from?.id||0);
  const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(actorId).first();
  if(deletionLock){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Аккаунт находится в процессе удаления',show_alert:true});return json({ok:true,ignored:true,reason:'account_deletion_in_progress'});}
  const invite=await env.DB.prepare(`SELECT * FROM city_invites WHERE id=? AND target_telegram_id=? AND status='pending'`).bind(inviteId,actorId).first(); if(!invite){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Приглашение уже обработано',show_alert:true});return json({ok:true});}
  const targetUser=await env.DB.prepare(`SELECT status FROM users WHERE telegram_id=? LIMIT 1`).bind(actorId).first();
  if(targetUser?.status!=='verified'){
    await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=? WHERE id=? AND status='pending'`).bind(Date.now(),inviteId).run();
    await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Аккаунт больше не подтверждён. Приглашение отменено.',show_alert:true});
    return json({ok:true});
  }
  if(action==='resident_reject'){await env.DB.prepare(`UPDATE city_invites SET status='rejected',responded_at=? WHERE id=?`).bind(Date.now(),inviteId).run();await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Приглашение отклонено'});}
  else {
    if(await isTerritoryManager(env,invite.territory_id,actorId)){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Вы уже основатель/мэр этого города',show_alert:true});return json({ok:true});}
    const existing=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE telegram_id=? AND territory_id=?`).bind(actorId,invite.territory_id).first();
    if(!existing) await env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) VALUES(?,?,?)`).bind(actorId,invite.territory_id,Date.now()).run();
    await env.DB.prepare(`UPDATE city_invites SET status='accepted',responded_at=? WHERE id=?`).bind(Date.now(),inviteId).run(); await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Вы присоединились к городу'}); await ensureFirstCityMarker(env,invite.territory_id); await evaluateAchievementsForTerritory(env,invite.territory_id).catch(error=>console.error('Achievement evaluation after resident join:',error));
  }
  try{await telegram(env,'editMessageReplyMarkup',{chat_id:callbackQuery.message.chat.id,message_id:callbackQuery.message.message_id,reply_markup:{inline_keyboard:[]}})}catch{} return json({ok:true});
}

async function notifyPendingInvitesForUser(env, userId) {
  await ensureWorldTables(env);
  const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(Number(userId)).first();
  if(deletionLock)return;
  const user = await env.DB.prepare('SELECT telegram_id, mc_nickname, status FROM users WHERE telegram_id = ?').bind(Number(userId)).first();
  if (!user?.mc_nickname) return;
  await env.DB.prepare(`UPDATE city_invites SET target_telegram_id = ? WHERE target_telegram_id IS NULL AND lower(target_nickname) = lower(?) AND status = 'pending'`).bind(Number(userId), user.mc_nickname).run();
  if (user.status !== 'verified') return;
  const invites = await env.DB.prepare(`SELECT ci.*, t.name AS city_name FROM city_invites ci JOIN territories t ON t.id = ci.territory_id
    WHERE ci.target_telegram_id = ? AND ci.status = 'pending' AND ci.notification_sent_at IS NULL
    ORDER BY ci.created_at ASC`).bind(Number(userId)).all();
  for (const invite of invites.results || []) await sendResidentInviteOnce(env, invite, invite.city_name);
}


async function deliverPendingInviteNotifications(env) {
  await ensureWorldTables(env);
  const rows=await env.DB.prepare(`
    SELECT ci.*,t.name AS city_name
    FROM city_invites ci
    JOIN territories t ON t.id=ci.territory_id AND t.status='approved'
    JOIN users u ON u.telegram_id=ci.target_telegram_id AND u.status='verified'
    WHERE ci.status='pending' AND ci.notification_sent_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=ci.target_telegram_id)
    ORDER BY ci.created_at ASC LIMIT 50
  `).all();
  let delivered=0;
  for(const invite of rows.results||[]){
    if(await sendResidentInviteOnce(env,invite,invite.city_name))delivered++;
  }
  return {scanned:(rows.results||[]).length,delivered};
}
  return {
    inviteResident,
    getCityManagement,
    cancelResidentInvite,
    removeResident,
    leaveTerritory,
    handleResidentInviteCallback,
    notifyPendingInvitesForUser,
    deliverPendingInviteNotifications,
  };
}
