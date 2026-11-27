import { formatTelegramNickname } from '../../telegram/formatting.js';

export function createTreasuryService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  json,
  getTerritoryManagerRows,
  notifyTerritoryManagers,
  escapeHtml,
} = {}) {
  async function getTreasury(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env);
    const userId=Number(auth.user.id),url=new URL(request.url),territoryId=String(url.searchParams.get('territoryId')||'').trim(); if(!territoryId)return json({ok:false,error:'territoryId is required'},400);
    const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
    if(!(await isTerritoryManager(env,territoryId,userId)) && !(await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE telegram_id=? AND territory_id=?`).bind(userId,territoryId).first()))return json({ok:false,error:'Только жители города имеют доступ к казне'},403);
    await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run(); await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(userId,userId).run();
    const [treasury,personal]=await Promise.all([env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first()]);
    return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:await isTerritoryManager(env,territoryId,userId),cityName:territory.name});
  }
  function normalizeFinancialOperationId(value) {
    const id=String(value||'').trim();
    return /^[A-Za-z0-9._:-]{8,120}$/.test(id) ? id : null;
  }
  async function executeIdempotentFinancialTransfer(env, { operationId, telegramId, operationType, targetId, amount, debitStatement, creditStatement }) {
    const suppliedOperationId=String(operationId??'').trim();
    if(suppliedOperationId&&!normalizeFinancialOperationId(suppliedOperationId))return {error:'ID операции указан некорректно',status:400};
    // Missing IDs are supported only for older clients; v40 always submits a persistent key.
    const id=normalizeFinancialOperationId(suppliedOperationId)||crypto.randomUUID();
    const existing=await env.DB.prepare(`SELECT operation_id,telegram_id,operation_type,target_id,amount,status FROM financial_operations WHERE operation_id=? LIMIT 1`).bind(id).first();
    if(existing){
      if(Number(existing.telegram_id)!==Number(telegramId)||existing.operation_type!==operationType||String(existing.target_id)!==String(targetId)||Number(existing.amount)!==Number(amount))return {error:'ID операции уже использован для другого действия',status:409,replayed:true};
      return {status:String(existing.status||'processing'),operationId:id,replayed:true};
    }
    const now=Date.now();
    let batchResult;
    try {
      batchResult=await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO financial_operations(operation_id,telegram_id,operation_type,target_id,amount,status,created_at,updated_at) VALUES(?,?,?,?,?,'processing',?,?)`).bind(id,Number(telegramId),operationType,String(targetId),Number(amount),now,now),
      debitStatement,
      creditStatement,
      env.DB.prepare(`UPDATE financial_operations SET status=CASE WHEN changes()=1 THEN 'completed' ELSE 'rejected' END,updated_at=? WHERE operation_id=? AND status='processing'`).bind(Date.now(),id)
      ]);
    } catch (error) {
      const locked=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=?`).bind(Number(telegramId)).first().catch(()=>null);
      if(locked)return {error:'Аккаунт находится в процессе удаления',status:409,operationId:id};
      throw error;
    }
    const saved=await env.DB.prepare(`SELECT operation_id,telegram_id,operation_type,target_id,amount,status FROM financial_operations WHERE operation_id=? LIMIT 1`).bind(id).first();
    if(!saved)return {error:'Не удалось проверить результат операции',status:500,operationId:id};
    if(Number(saved.telegram_id)!==Number(telegramId)||saved.operation_type!==operationType||String(saved.target_id)!==String(targetId)||Number(saved.amount)!==Number(amount))return {error:'ID операции уже использован для другого действия',status:409,replayed:true};
    return {status:String(saved.status||'processing'),operationId:id,replayed:!Boolean(batchResult?.[0]?.meta?.changes)};
  }
  
  async function treasuryDeposit(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Number(body?.amount); if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Введите положительное количество самоцветов'},400);
    const territory=await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
    const allowed=await isTerritoryManager(env,territoryId,userId) || !!(await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE telegram_id=? AND territory_id=?`).bind(userId,territoryId).first()); if(!allowed)return json({ok:false,error:'Только жители города могут пополнять казну'},403);
    await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(userId,userId).run(); await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
    const transfer=await executeIdempotentFinancialTransfer(env,{
      operationId:body?.operationId,telegramId:userId,operationType:'treasury_deposit',targetId:territoryId,amount,
      debitStatement:env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=? AND changes()=1`).bind(amount,userId,amount),
      creditStatement:env.DB.prepare(`INSERT INTO city_treasury(territory_id,balance,updated_at) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(territory_id) DO UPDATE SET balance=city_treasury.balance+excluded.balance,updated_at=excluded.updated_at`).bind(territoryId,amount,Date.now())
    });
    if(transfer.error)return json({ok:false,error:transfer.error},transfer.status||500);
    if(transfer.status!=='completed')return json({ok:false,error:transfer.status==='rejected'?'Недостаточно самоцветов':'Операция ещё обрабатывается'},transfer.status==='rejected'?400:409);
    const [treasury,personal,donor]=await Promise.all([
      env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),
      env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first(),
      env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(userId).first(),
    ]);
    if(!transfer.replayed){
      const donorNickname=String(donor?.mc_nickname||'').trim()||'Ник не указан';
      const notice=`💎 <b>Пополнение казны</b>\n\n🏙 <b>${escapeHtml(territory.name)}</b>\n👤 Отправитель: ${formatTelegramNickname(donorNickname)}\n💎 Сумма: <b>${amount} сц</b>`;
      await notifyTerritoryManagers(env,territoryId,notice,userId).catch(error=>console.error('Treasury deposit notification failed:',error));
    }
    return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:await isTerritoryManager(env,territoryId,userId),replayed:Boolean(transfer.replayed)});
  }
  async function treasuryDonate(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env);
    let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Number(body?.amount);
    if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Укажите положительное количество самоцветов'},400);
    const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
    if(!territory)return json({ok:false,error:'City not found'},404);
    if(Number(territory.is_government||0)===1)return json({ok:false,error:'Для государственной территории донат недоступен'},400);
    const managers=await getTerritoryManagerRows(env,territoryId); if(!managers.length)return json({ok:false,error:'У города пока нет основателя/мэра'},409);
    await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(userId,userId).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
    const transfer=await executeIdempotentFinancialTransfer(env,{
      operationId:body?.operationId,telegramId:userId,operationType:'treasury_donate',targetId:territoryId,amount,
      debitStatement:env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=? AND changes()=1`).bind(amount,userId,amount),
      creditStatement:env.DB.prepare(`INSERT INTO city_treasury(territory_id,balance,updated_at) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(territory_id) DO UPDATE SET balance=city_treasury.balance+excluded.balance,updated_at=excluded.updated_at`).bind(territoryId,amount,Date.now())
    });
    if(transfer.error)return json({ok:false,error:transfer.error},transfer.status||500);
    if(transfer.status!=='completed')return json({ok:false,error:transfer.status==='rejected'?'Недостаточно самоцветов':'Операция ещё обрабатывается'},transfer.status==='rejected'?400:409);
    const [personal,donor]=await Promise.all([
      env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first(),
      env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(userId).first(),
    ]);
    if(!transfer.replayed){
      const donorNickname=String(donor?.mc_nickname||'').trim()||'Ник не указан';
      const notice=`💎 <b>Донат в казну</b>\n\n🏙 <b>${escapeHtml(territory.name)}</b>\n👤 Отправитель: ${formatTelegramNickname(donorNickname)}\n💎 Сумма: <b>${amount} сц</b>`;
      await notifyTerritoryManagers(env,territoryId,notice,null).catch(error=>console.error('Treasury donation notification failed:',error));
    }
    return json({ok:true,personal_balance:Number(personal?.balance||0),amount,replayed:Boolean(transfer.replayed)});
  }
  
  async function treasuryWithdraw(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const userId=Number(auth.user.id),territoryId=String(body?.territoryId||'').trim(),amount=Number(body?.amount); if(!territoryId||!Number.isSafeInteger(amount)||amount<=0)return json({ok:false,error:'Введите положительное количество самоцветов'},400);
    const territory=await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404); if(!(await isTerritoryManager(env,territoryId,userId)))return json({ok:false,error:'Только основатель/мэр может тратить средства казны'},403);
    await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(userId,userId).run(); await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(territoryId,0,Date.now()).run();
    const transfer=await executeIdempotentFinancialTransfer(env,{
      operationId:body?.operationId,telegramId:userId,operationType:'treasury_withdraw',targetId:territoryId,amount,
      debitStatement:env.DB.prepare(`UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=? AND changes()=1`).bind(amount,Date.now(),territoryId,amount),
      creditStatement:env.DB.prepare(`INSERT INTO user_currency(telegram_id,balance) SELECT ?,? WHERE changes()=1 ON CONFLICT(telegram_id) DO UPDATE SET balance=user_currency.balance+excluded.balance`).bind(userId,amount)
    });
    if(transfer.error)return json({ok:false,error:transfer.error},transfer.status||500);
    if(transfer.status!=='completed')return json({ok:false,error:transfer.status==='rejected'?'Недостаточно средств в казне':'Операция ещё обрабатывается'},transfer.status==='rejected'?400:409);
    const [treasury,personal]=await Promise.all([env.DB.prepare(`SELECT balance FROM city_treasury WHERE territory_id=?`).bind(territoryId).first(),env.DB.prepare(`SELECT balance FROM user_currency WHERE telegram_id=?`).bind(userId).first()]); return json({ok:true,balance:Number(treasury?.balance||0),personal_balance:Number(personal?.balance||0),isManager:true,replayed:Boolean(transfer.replayed)});
  }

  return {
    getTreasury,
    normalizeFinancialOperationId,
    executeIdempotentFinancialTransfer,
    treasuryDeposit,
    treasuryDonate,
    treasuryWithdraw,
  };
}
