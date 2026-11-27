export function createManagerChangeVotingService({
  ensureManagerChangeTables,
  applyManagerChange,
  telegram,
  escapeHtml,
  formatTelegramNickname,
  isTerritoryManager,
  json,
} = {}) {
  async function claimManagerChangeFinalization(env,requestId,requestStatus,now,leaseMs=60_000) {
    if(requestStatus==='pending'){
      const claim=await env.DB.prepare(`UPDATE manager_change_requests SET status='finalizing',finalizing_at=?
        WHERE id=? AND status='pending'`).bind(now,requestId).run();
      return Boolean(claim.meta?.changes);
    }
    if(requestStatus==='finalizing'){
      const claim=await env.DB.prepare(`UPDATE manager_change_requests SET finalizing_at=?
        WHERE id=? AND status='finalizing' AND COALESCE(finalizing_at,0)<=?`).bind(now,requestId,now-leaseMs).run();
      return Boolean(claim.meta?.changes);
    }
    return false;
  }
  
  async function recordManagerChangeVote(env,requestId,actorId,approve,createdAt=Date.now()) {
    return env.DB.prepare(`INSERT INTO manager_change_votes(request_id,voter_telegram_id,approve,created_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM manager_change_requests WHERE id=? AND status='pending')
      ON CONFLICT(request_id,voter_telegram_id) DO UPDATE SET approve=excluded.approve,created_at=excluded.created_at`)
      .bind(requestId,actorId,approve?1:0,createdAt,requestId).run();
  }
  
  async function finalizeManagerChangeRequest(env,requestId) {
    const now=Date.now(),leaseMs=60_000;
    const req=await env.DB.prepare(`SELECT * FROM manager_change_requests WHERE id=?`).bind(requestId).first();
    if(!req||!['pending','finalizing'].includes(req.status))return null;
  
    // Only one worker may claim a pending request. A stale claim is recoverable after
    // a worker crash; applyManagerChange() is designed to be safely retryable.
    if(req.status==='pending'){
      const before=await env.DB.prepare(`SELECT SUM(CASE WHEN approve=1 THEN 1 ELSE 0 END) AS yes,COUNT(*) AS total FROM manager_change_votes WHERE request_id=?`).bind(requestId).first();
      const beforeYes=Number(before?.yes||0),beforeTotal=Number(before?.total||0);
      const beforeExpired=now>=Number(req.expires_at||0);
      const beforeRequired=Math.floor((Number(req.voter_count||0)+1)/2)+1;
      if(beforeYes+1<beforeRequired&&!beforeExpired&&beforeTotal<Number(req.voter_count||0))return null;
    }
    if(!await claimManagerChangeFinalization(env,requestId,req.status,now,leaseMs))return null;
  
    // Re-read after claim: identity rekey or account removal may have cancelled
    // or rewritten the request between the initial read and the atomic claim.
    const claimedReq=await env.DB.prepare(`SELECT * FROM manager_change_requests
      WHERE id=? AND status='finalizing' AND finalizing_at=?`).bind(requestId,now).first();
    if(!claimedReq)return null;
  
    // Votes are frozen by the status claim: the vote endpoint only inserts while pending.
    const votes=await env.DB.prepare(`SELECT SUM(CASE WHEN approve=1 THEN 1 ELSE 0 END) AS yes,COUNT(*) AS total FROM manager_change_votes WHERE request_id=?`).bind(requestId).first();
    const yes=Number(votes?.yes||0),total=Number(votes?.total||0),expired=now>=Number(claimedReq.expires_at||0);
    const approvedTotal=yes+1;
    const requiredTotal=Math.floor((Number(claimedReq.voter_count||0)+1)/2)+1;
    let status=null;
    if(approvedTotal>=requiredTotal)status='approved';
    else if(expired||total>=Number(claimedReq.voter_count||0))status='rejected';
    if(!status){
      await env.DB.prepare(`UPDATE manager_change_requests SET status='pending',finalizing_at=NULL
        WHERE id=? AND status='finalizing' AND finalizing_at=?`).bind(requestId,now).run();
      return null;
    }
  
    if(status==='approved'){
      try{
        const applied=await applyManagerChange(env,{
          territoryId:claimedReq.territory_id,
          targetId:Number(claimedReq.target_telegram_id),
          action:claimedReq.action,
          initiatorId:Number(claimedReq.initiator_telegram_id),
        });
        if(!applied)status='rejected';
      }catch(error){
        if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))status='rejected';
        else throw error;
      }
    }
  
    const decision=await env.DB.prepare(`UPDATE manager_change_requests SET status=?,decided_at=?,finalizing_at=NULL
      WHERE id=? AND status='finalizing' AND finalizing_at=?`).bind(status,now,requestId,now).run();
    if(!decision.meta?.changes)return null;
  
    const target=await env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=?`).bind(Number(claimedReq.target_telegram_id)).first();
    const city=await env.DB.prepare(`SELECT name FROM territories WHERE id=?`).bind(claimedReq.territory_id).first();
    const resultText=status==='approved'?'✅ Решение одобрено':'❌ Решение отклонено';
    try{await telegram(env,'sendMessage',{chat_id:Number(claimedReq.initiator_telegram_id),text:`${resultText}\n\n🏙 ${escapeHtml(city?.name||'Город')}\n👤 ${formatTelegramNickname(target?.mc_nickname||`id${claimedReq.target_telegram_id}`)}`,parse_mode:'HTML'})}catch{}
    return {status,yes,total};
  }
  
  async function expireManagerChangeRequests(env, at=Date.now()) {
    await ensureManagerChangeTables(env);
    const now=Number(at||Date.now());
    const rows=await env.DB.prepare(`SELECT id FROM manager_change_requests
      WHERE (status='pending' AND expires_at<=?)
         OR (status='finalizing' AND COALESCE(finalizing_at,0)<=?)
      ORDER BY expires_at ASC LIMIT 100`).bind(now,now-60_000).all();
    let finalized=0;
    for(const row of rows.results||[]){
      const result=await finalizeManagerChangeRequest(env,row.id);
      if(result)finalized++;
    }
    return finalized;
  }
  
  function isEligibleManagerChangeVoter(actorId, request) {
    const actor=Number(actorId||0);
    return Number.isSafeInteger(actor)&&actor>0&&actor!==Number(request?.initiator_telegram_id)&&actor!==Number(request?.target_telegram_id);
  }
  
  async function handleManagerVoteCallback(env, callbackQuery) {
    const parts=String(callbackQuery.data||'').split(':'),decision=parts[1],requestId=parts.slice(2).join(':');
    const actorId=Number(callbackQuery.from?.id||0); if(!['yes','no'].includes(decision)||!requestId)return json({ok:true}); await ensureManagerChangeTables(env);
    const req=await env.DB.prepare(`SELECT * FROM manager_change_requests WHERE id=?`).bind(requestId).first(); if(!req){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Голосование не найдено',show_alert:true});return json({ok:true});}
    if(req.status==='finalizing'){
      await finalizeManagerChangeRequest(env,requestId);
      await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Решение уже обрабатывается',show_alert:true});
      return json({ok:true});
    }
    if(req.status!=='pending'){
      await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Голосование завершено',show_alert:true});
      return json({ok:true});
    }
    if(Date.now()>Number(req.expires_at)){
      await finalizeManagerChangeRequest(env,requestId);
      await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Время голосования истекло',show_alert:true});
      return json({ok:true});
    }
    if(!isEligibleManagerChangeVoter(actorId,req)||!(await isTerritoryManager(env,req.territory_id,actorId))){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'⛔ Голосовать может только другой основатель/мэр',show_alert:true});return json({ok:true});}
    let vote;
    try{vote=await recordManagerChangeVote(env,requestId,actorId,decision==='yes',Date.now());}
    catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error))){await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Ваш аккаунт находится в процессе удаления',show_alert:true});return json({ok:true,ignored:true,reason:'account_deletion_in_progress'});}throw error;}
    const result=await finalizeManagerChangeRequest(env,requestId);
    const message=!vote.meta?.changes?'Голосование уже завершается':result?.status==='approved'?'Решение принято: одобрено':result?.status==='rejected'?'Решение принято: отклонено':'Голос учтён';
    await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:message}); return json({ok:true});
  }

  return {
    claimManagerChangeFinalization,
    recordManagerChangeVote,
    finalizeManagerChangeRequest,
    expireManagerChangeRequests,
    isEligibleManagerChangeVoter,
    handleManagerVoteCallback,
  };
}
