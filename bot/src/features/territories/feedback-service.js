/**
 * Territory rating and review API workflows.
 *
 * The Worker keeps route dispatch and injects authentication, persistence
 * initialization, notifications and achievement evaluation.
 */
export function createTerritoryFeedbackService({
  requireUser,
  requireVerifiedUser,
  ensureWorldTables,
  getRoleByTelegramId,
  isTerritoryManager,
  calculateTerritoryScores,
  notifyTerritoryManagers,
  evaluateAchievementsForTerritory,
  normalizeUsername,
  formatTelegramNickname,
  escapeHtml,
  telegram,
  json,
} = {}) {
async function saveRating(request, env) {
  const auth=await requireVerifiedUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),keys=['integrity','comfort','atmosphere','detail'],scores=keys.map(key=>Number(body?.[key]));
  if(!territoryId||scores.some(v=>!Number.isFinite(v)||v<1||v>5||!Number.isInteger(v)))return json({ok:false,error:'Invalid rating'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  const role=await getRoleByTelegramId(env,auth.user.id,auth.user.username);
  const isInspectorRole=role==='inspector'||role==='main_inspector';
  let voteRole=role||'user';
  if(!isInspectorRole){
    const manager=await isTerritoryManager(env,territoryId,auth.user.id);
    if(manager)return json({ok:false,error:'Основатель/мэр не может оценивать свой город'},403);
    const resident=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,Number(auth.user.id)).first();
    voteRole=resident?'resident':'user';
  }
  const twentyHours=20*60*60*1000,now=Date.now();
  let previous=null;
  if(isInspectorRole) previous=await env.DB.prepare(`SELECT id,integrity,comfort,atmosphere,detail,created_at FROM inspector_ratings WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,Number(auth.user.id)).first();
  else previous=await env.DB.prepare(`SELECT id,integrity,comfort,atmosphere,detail,created_at FROM ratings WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,Number(auth.user.id)).first();
  if(previous?.created_at && now-Number(previous.created_at)<twentyHours){
    return json({ok:false,error:'Оценку можно обновлять только раз в 20 часов',retryAt:Number(previous.created_at)+twentyHours,values:{integrity:Number(previous.integrity),comfort:Number(previous.comfort),atmosphere:Number(previous.atmosphere),detail:Number(previous.detail)}},429);
  }
  const before=await calculateTerritoryScores(env,territoryId);
  if(isInspectorRole){
    const id=previous?.id || crypto.randomUUID();
    const saved = await env.DB.prepare(`INSERT INTO inspector_ratings (id,territory_id,telegram_id,role,integrity,comfort,atmosphere,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(territory_id,telegram_id) DO UPDATE SET role=excluded.role,integrity=excluded.integrity,comfort=excluded.comfort,atmosphere=excluded.atmosphere,detail=excluded.detail,created_at=excluded.created_at WHERE inspector_ratings.created_at<=?`).bind(id,territoryId,Number(auth.user.id),role,...scores,now,now-twentyHours).run();
    if (!Number(saved.meta?.changes || 0)) {
      const latest = await env.DB.prepare(`SELECT integrity,comfort,atmosphere,detail,created_at FROM inspector_ratings WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,Number(auth.user.id)).first();
      return json({ok:false,error:'Оценку можно обновлять только раз в 20 часов',retryAt:Number(latest?.created_at||now)+twentyHours,values:latest?{integrity:Number(latest.integrity),comfort:Number(latest.comfort),atmosphere:Number(latest.atmosphere),detail:Number(latest.detail)}:null},429);
    }
  }else{
    const id=previous?.id || crypto.randomUUID();
    const saved = await env.DB.prepare(`INSERT INTO ratings (id,territory_id,telegram_id,role,integrity,comfort,atmosphere,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(territory_id,telegram_id) DO UPDATE SET role=excluded.role,integrity=excluded.integrity,comfort=excluded.comfort,atmosphere=excluded.atmosphere,detail=excluded.detail,created_at=excluded.created_at WHERE ratings.created_at<=?`).bind(id,territoryId,Number(auth.user.id),voteRole,...scores,now,now-twentyHours).run();
    if (!Number(saved.meta?.changes || 0)) {
      const latest = await env.DB.prepare(`SELECT integrity,comfort,atmosphere,detail,created_at FROM ratings WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,Number(auth.user.id)).first();
      return json({ok:false,error:'Оценку можно обновлять только раз в 20 часов',retryAt:Number(latest?.created_at||now)+twentyHours,values:latest?{integrity:Number(latest.integrity),comfort:Number(latest.comfort),atmosphere:Number(latest.atmosphere),detail:Number(latest.detail)}:null},429);
    }
  }
  const after=await calculateTerritoryScores(env,territoryId);
  const curatorChanged=Math.abs(after.curator-before.curator)>=0.01,communityChanged=Math.abs(after.community-before.community)>=0.01;
  if(curatorChanged||communityChanged){
    const changes=[];
    if(curatorChanged)changes.push(`Инспектор: ${before.curator.toFixed(1)} → ${after.curator.toFixed(1)}`);
    if(communityChanged)changes.push(`Игроки: ${before.community.toFixed(1)} → ${after.community.toFixed(1)}`);
    await notifyTerritoryManagers(env,territoryId,`⭐ Оценка вашего города изменилась\n\n🏙 ${escapeHtml(territory.name)}\n${changes.join('\n')}`);
  }
  await evaluateAchievementsForTerritory(env, territoryId).catch(error=>console.error('Achievement evaluation after rating:',error));
  return json({ok:true,community:after.community,curator:after.curator,votes:after.votes,next_at:now+twentyHours,values:{integrity:scores[0],comfort:scores[1],atmosphere:scores[2],detail:scores[3]}});
}
async function getRatings(request, env, url) {
  await ensureWorldTables(env);
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT r.id, r.telegram_id, r.role, r.integrity, r.comfort, r.atmosphere, r.detail, r.created_at
    FROM ratings r JOIN territories t ON t.id=r.territory_id AND t.status='approved'
    WHERE r.territory_id = ? ORDER BY r.created_at DESC
  `).bind(territoryId).all();

  return json({ ok: true, ratings: rows.results || [] });
}

async function addComment(request, env) {
  const auth = await requireVerifiedUser(request, env); if (auth.error) return auth.error;
  let body; try { body = await request.json(); } catch { return json({ ok:false,error:'Invalid JSON' },400); }
  const territoryId=String(body?.territoryId||'').trim(), text=String(body?.text||'').trim();
  if(!territoryId||!text)return json({ok:false,error:'territoryId and text are required'},400);
  if(text.length>4000)return json({ok:false,error:'Comment is too long'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  const role=await getRoleByTelegramId(env,auth.user.id,auth.user.username),username=normalizeUsername(auth.user.username)||`id${auth.user.id}`;
  const commentId=crypto.randomUUID();
  const authorNickname=String((await env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first())?.mc_nickname||'').trim()||null;
  // The five-review quota is per Telegram ID and territory; all roles count together.
  // Count and insert in one SQL statement so concurrent requests cannot bypass it.
  const insertResult = await env.DB.prepare(`
    INSERT INTO comments (id,territory_id,telegram_id,telegram_username,author_mc_nickname,text,role,created_at)
    SELECT ?,?,?,?,?,?,?,?
    WHERE (SELECT COUNT(*) FROM comments WHERE telegram_id=? AND territory_id=?) < 5
  `).bind(commentId,territoryId,Number(auth.user.id),username,authorNickname,text,role,Date.now(),Number(auth.user.id),territoryId).run();
  if (Number(insertResult.meta?.changes || 0) === 0) {
    return json({ok:false,error:'Максимальное кол-во отзывов на странице территории для Вас – 5'},429);
  }
  await notifyTerritoryManagers(env,territoryId,`💬 Новый комментарий\n\n🏙 ${escapeHtml(territory.name)}\n👤 ${formatTelegramNickname(authorNickname||username)}\n\n💬 ${escapeHtml(text)}`,auth.user.id);
  await evaluateAchievementsForTerritory(env, territoryId).catch(error=>console.error('Achievement evaluation after comment:',error));
  return json({ok:true,comment:{id:commentId,telegram_id:Number(auth.user.id),telegram_username:username,text,role,created_at:Date.now()}});
}

async function updateComment(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const id=String(body?.commentId||'').trim(),text=String(body?.text||'').trim();if(!id||!text)return json({ok:false,error:'commentId и text обязательны'},400);if(text.length>4000)return json({ok:false,error:'Comment is too long'},400);
  const c=await env.DB.prepare(`SELECT c.telegram_id,cr.comment_id AS replied_comment_id FROM comments c LEFT JOIN comment_replies cr ON cr.comment_id=c.id WHERE c.id=?`).bind(id).first();if(!c)return json({ok:false,error:'Комментарий не найден'},404);
  if(String(c.telegram_id)!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
  if(c.replied_comment_id)return json({ok:false,error:'Отзыв нельзя изменить: на него уже ответил основатель/мэр'},409);
  // Keep the rule race-safe: a manager reply inserted concurrently blocks this update too.
  const updated=await env.DB.prepare(`UPDATE comments SET text=? WHERE id=? AND telegram_id=? AND NOT EXISTS (SELECT 1 FROM comment_replies WHERE comment_id=comments.id)`).bind(text,id,Number(auth.user.id)).run();
  if(Number(updated.meta?.changes||0)===0){
    const latest=await env.DB.prepare(`SELECT c.telegram_id,cr.comment_id AS replied_comment_id FROM comments c LEFT JOIN comment_replies cr ON cr.comment_id=c.id WHERE c.id=?`).bind(id).first();
    if(!latest)return json({ok:false,error:'Комментарий не найден'},404);
    if(String(latest.telegram_id)!==String(auth.user.id))return json({ok:false,error:'Недостаточно прав'},403);
    if(latest.replied_comment_id)return json({ok:false,error:'Отзыв нельзя изменить: на него уже ответил основатель/мэр'},409);
    return json({ok:false,error:'Не удалось изменить отзыв. Обновите страницу и попробуйте снова.'},409);
  }
  return json({ok:true,text});
}

async function deleteComment(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const id=String(body?.commentId||'').trim();if(!id)return json({ok:false,error:'commentId обязателен'},400);
  const c=await env.DB.prepare(`SELECT telegram_id,territory_id FROM comments WHERE id=?`).bind(id).first();if(!c)return json({ok:false,error:'Комментарий не найден'},404);
  const role=await getRoleByTelegramId(env,auth.user.id,auth.user.username);
  if(String(c.telegram_id)!==String(auth.user.id)&&role!=='main_inspector')return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM comment_replies WHERE comment_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM comments WHERE id=?`).bind(id),
  ]);
  return json({ok:true});
}

// No total quota is applied to manager replies; each review has one editable reply.
async function replyToComment(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const commentId=String(body?.commentId||'').trim(),text=String(body?.text||'').trim();if(!commentId||!text)return json({ok:false,error:'commentId и text обязательны'},400);if(text.length>4000)return json({ok:false,error:'Reply is too long'},400);
  const c=await env.DB.prepare(`SELECT c.id,c.telegram_id,c.text AS comment_text,t.id AS territory_id,t.name AS territory_name,t.owner_telegram_id,t.owner_telegram_username FROM comments c JOIN territories t ON t.id=c.territory_id WHERE c.id=? AND t.status='approved'`).bind(commentId).first();
  if(!c)return json({ok:false,error:'Комментарий не найден'},404);
  if(!(await isTerritoryManager(env,c.territory_id,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  const now=Date.now();
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO comment_replies(comment_id,telegram_id,text,created_at)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM comments WHERE id=?)`).bind(commentId,Number(auth.user.id),text,now,commentId).run();
  const created=Number(inserted.meta?.changes||0)>0;
  if(!created){
    const updated=await env.DB.prepare(`UPDATE comment_replies SET telegram_id=?,text=?,created_at=?
      WHERE comment_id=? AND EXISTS(SELECT 1 FROM comments WHERE id=?)`).bind(Number(auth.user.id),text,now,commentId,commentId).run();
    if(!Number(updated.meta?.changes||0))return json({ok:false,error:'Комментарий не найден'},404);
  }
  if(created&&String(c.telegram_id)!==String(auth.user.id)){
    try{
      const founderName=normalizeUsername(auth.user.username)||`id${auth.user.id}`;
      await telegram(env,'sendMessage',{chat_id:Number(c.telegram_id),text:`💬 На ваш комментарий ответил основатель/мэр\n\n🏙 ${escapeHtml(c.territory_name)}\n👤 ${escapeHtml(founderName)}\n\nВаш комментарий:\n${escapeHtml(c.comment_text)}\n\nОтвет:\n${escapeHtml(text)}`,parse_mode:'HTML'});
    }catch(error){console.error('Comment reply notification error:',error)}
  }
  return json({ok:true,reply:text});
}

async function updateReply(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const commentId=String(body?.commentId||'').trim(),text=String(body?.text||'').trim();if(!commentId||!text)return json({ok:false,error:'commentId и text обязательны'},400);if(text.length>4000)return json({ok:false,error:'Reply is too long'},400);
  const row=await env.DB.prepare(`SELECT t.owner_telegram_id,t.id AS territory_id FROM comment_replies cr JOIN comments c ON c.id=cr.comment_id JOIN territories t ON t.id=c.territory_id WHERE cr.comment_id=?`).bind(commentId).first();
  if(!row)return json({ok:false,error:'Ответ не найден'},404);if(!(await isTerritoryManager(env,row.territory_id,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare(`UPDATE comment_replies SET text=?,created_at=? WHERE comment_id=?`).bind(text,Date.now(),commentId).run();return json({ok:true,reply:text});
}

async function deleteReply(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const commentId=String(body?.commentId||'').trim();if(!commentId)return json({ok:false,error:'commentId обязателен'},400);
  const row=await env.DB.prepare(`SELECT t.owner_telegram_id,t.id AS territory_id FROM comment_replies cr JOIN comments c ON c.id=cr.comment_id JOIN territories t ON t.id=c.territory_id WHERE cr.comment_id=?`).bind(commentId).first();
  if(!row)return json({ok:false,error:'Ответ не найден'},404);if(!(await isTerritoryManager(env,row.territory_id,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare(`DELETE FROM comment_replies WHERE comment_id=?`).bind(commentId).run();return json({ok:true});
}

async function getComments(request, env, url) {
  await ensureWorldTables(env);
  const territoryId=url.searchParams.get('territoryId');if(!territoryId)return json({ok:false,error:'territoryId is required'},400);
  const rows=await env.DB.prepare(`SELECT c.id,c.telegram_id,c.telegram_username,COALESCE(c.author_mc_nickname,u.mc_nickname) AS mc_nickname,c.text,c.role,c.created_at,cr.text AS reply_text FROM comments c JOIN territories t ON t.id=c.territory_id AND t.status='approved' LEFT JOIN users u ON u.telegram_id=c.telegram_id LEFT JOIN comment_replies cr ON cr.comment_id=c.id WHERE c.territory_id=? ORDER BY CASE WHEN c.role IN ('inspector','main_inspector') THEN 0 ELSE 1 END,c.created_at DESC`).bind(territoryId).all();
  return json({ok:true,comments:(rows.results||[]).map(row=>({...row,reply:row.reply_text||null}))});
}

  return {
    saveRating,
    getRatings,
    addComment,
    updateComment,
    deleteComment,
    replyToComment,
    updateReply,
    deleteReply,
    getComments,
  };
}
