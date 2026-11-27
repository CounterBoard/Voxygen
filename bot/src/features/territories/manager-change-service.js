export function createManagerChangeService({
  telegram,
  escapeHtml,
  hideRecruitmentIfContactLost,
  notifyTerritoryManagers,
  evaluateAchievementsForTerritory,
} = {}) {
  async function applyManagerChange(env,{territoryId,targetId,action,initiatorId=null}) {
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory||!['promote','demote'].includes(action))return false;

  const now=Date.now();
  let targetWasOwner=Number(territory.owner_telegram_id||0)===Number(targetId);
  let changed=false;

  if(action==='promote'){
    const manager=await env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first();
    const member=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first();
    if(manager&&!member) return true; // idempotent retry after a prior successful commit
    if(!member)return false;

    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO territory_managers(territory_id,telegram_id,granted_by,granted_at)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?) AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')`)
        .bind(territoryId,targetId,Number(initiatorId||targetId),now,territoryId,targetId,targetId),
      env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?)`)
        .bind(territoryId,targetId,territoryId,targetId),
    ]);
    const [freshManager,freshMember]=await Promise.all([
      env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
      env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
    ]);
    changed=Boolean(freshManager&&!freshMember);
    if(!changed)return false;
    try{await telegram(env,'sendMessage',{chat_id:targetId,text:`✅ Вы стали основателем/мэром города «${escapeHtml(territory.name)}». Теперь у вас те же права управления городом.`,parse_mode:'HTML'})}catch{}
  } else if(targetWasOwner) {
    const nextOwnerId=Number(initiatorId||0)===Number(targetId)
      ? Number((await env.DB.prepare(`SELECT telegram_id FROM territory_managers WHERE territory_id=? AND telegram_id<>? ORDER BY granted_at ASC, telegram_id ASC LIMIT 1`).bind(territoryId,targetId).first())?.telegram_id||0)
      : Number(initiatorId||0);
    if(!nextOwnerId||nextOwnerId===Number(targetId))return false;
    const [nextOwner,nextOwnerManager]=await Promise.all([
      env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>''`).bind(nextOwnerId).first(),
      env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,nextOwnerId).first(),
    ]);
    if(!nextOwner||!nextOwnerManager)return false;

    await env.DB.batch([
      env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=?
        WHERE id=? AND status='approved' AND owner_telegram_id=?
          AND EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?)`)
        .bind(nextOwnerId,nextOwner.telegram_username||null,nextOwner.mc_nickname||'',territoryId,targetId,territoryId,nextOwnerId),
      env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id IN (?,?)
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(territoryId,targetId,nextOwnerId,territoryId,nextOwnerId),
      env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(targetId,territoryId,now,territoryId,nextOwnerId),
    ]);
    const [freshTerritory,freshManager,freshMember]=await Promise.all([
      env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=?`).bind(territoryId).first(),
      env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
      env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
    ]);
    changed=Number(freshTerritory?.owner_telegram_id||0)===nextOwnerId&&!freshManager&&Boolean(freshMember);
    if(!changed)return false;
    try{await telegram(env,'sendMessage',{chat_id:targetId,text:`ℹ️ В городе «${escapeHtml(territory.name)}» вы больше не являетесь основателем/мэром.`,parse_mode:'HTML'})}catch{}
  } else {
    const [manager,member]=await Promise.all([
      env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
      env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
    ]);
    if(!manager&&member)return true; // already demoted; safe retry
    if(!manager)return false;
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?) AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')`)
        .bind(targetId,territoryId,now,territoryId,targetId,targetId),
      env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?)`)
        .bind(territoryId,targetId,territoryId,targetId),
    ]);
    const [freshManager,freshMember]=await Promise.all([
      env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
      env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(territoryId,targetId).first(),
    ]);
    changed=Boolean(!freshManager&&freshMember);
    if(!changed)return false;
    try{await telegram(env,'sendMessage',{chat_id:targetId,text:`ℹ️ В городе «${escapeHtml(territory.name)}» вы снова обычный житель.`,parse_mode:'HTML'})}catch{}
  }

  if(action==='demote') await hideRecruitmentIfContactLost(env,territoryId,targetId);
  const msg=action==='promote'
    ? `👑 Новый основатель/мэр утверждён в городе «${escapeHtml(territory.name)}».`
    : `ℹ️ В городе «${escapeHtml(territory.name)}» изменён состав основателей/мэров.`;
  await notifyTerritoryManagers(env,territoryId,msg,null);
  await evaluateAchievementsForTerritory(env,territoryId).catch(error=>console.error('Achievement evaluation after manager role change:',error));
  return changed;
}

  return { applyManagerChange };
}
