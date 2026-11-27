function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export function parseGemWithdrawalCommand(raw) {
  const text = String(raw || '').trim().replace(/^\/\s*/, '');
  const personal = text.match(/^[-−]\s*(\d+)$/);
  const territorialTargetFirst = text.match(/^(.+?)\s*[-−]\s*(\d+)$/);
  const territorialAmountFirst = text.match(/^[-−]\s*(\d+)\s+(.+)$/);
  const territorial = territorialTargetFirst
    ? { territory: territorialTargetFirst[1], amount: territorialTargetFirst[2] }
    : territorialAmountFirst
      ? { territory: territorialAmountFirst[2], amount: territorialAmountFirst[1] }
      : null;
  if (!personal && !territorial) return null;
  return {
    personal: Boolean(personal),
    territory: territorial?.territory?.trim() || null,
    amount: Number(personal ? personal[1] : territorial.amount),
  };
}

export function formatGemWithdrawalBankerNotification({ nickname, username, territoryName, personal, amount, balance }) {
  const displayName = String(nickname || '').trim() || 'Ник не указан';
  const displayUsername = String(username || '').trim().replace(/^@+/, '');
  const identity = `[<code>${escapeHtml(displayName)}</code>]${displayUsername ? ' @' + escapeHtml(displayUsername) : ''}`;
  const source = personal ? 'Личный счёт' : 'Казна ' + escapeHtml(String(territoryName || 'Неизвестная территория').trim());
  return ['💎 Снятие самоцветов', '', 'Кто: ' + identity, 'Откуда: ' + source, 'Сумма: ' + Number(amount) + ' сц', 'Остаток: ' + Number(balance) + ' сц'].join('\n');
}


export function createGemWithdrawalHandler({
  ensureWorldTables,
  ensureEventsTables,
  isTerritoryManager,
  executeIdempotentFinancialTransfer,
  telegram,
  json,
  stripMinecraftFormatting,
} = {}) {
  async function handleUserGemWithdrawal(env, update, message) {
  const command = parseGemWithdrawalCommand(message.text || message.caption || '');
  if (!command) return null;
  const territorial = command.territory ? [null, command.territory] : null;
  const amount = command.amount;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) {
    await telegram(env,'sendMessage',{chat_id:message.chat.id,text:'Укажите положительное целое количество самоцветов (не более 1 000 000 000).',reply_to_message_id:message.message_id});
    return json({ok:true,handled:'gem_withdraw_invalid_amount'});
  }
  const uid=Number(message.from?.id||0), updateId=Number(update.update_id);
  if(!uid || !Number.isSafeInteger(updateId))return json({ok:true,ignored:true});
  await ensureWorldTables(env);
  await ensureEventsTables(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(uid,uid).run();
  let targetType='personal',targetId=String(uid),territory=null;
  if(territorial){
    const requested=stripMinecraftFormatting(territorial[1]).trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
    const rows=await env.DB.prepare(`SELECT id,name FROM territories WHERE status='approved'`).all();
    const matches=(rows.results||[]).filter(row=>stripMinecraftFormatting(String(row.name||'')).trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')===requested);
    if(matches.length!==1){
      await telegram(env,'sendMessage',{chat_id:message.chat.id,text:matches.length?'Название территории неоднозначно. Уточните его.':'Территория не найдена.',reply_to_message_id:message.message_id});
      return json({ok:true,handled:'gem_withdraw_territory_not_found'});
    }
    territory=matches[0];
    if(!(await isTerritoryManager(env,territory.id,uid))){
      await telegram(env,'sendMessage',{chat_id:message.chat.id,text:'Снимать самоцветы с казны могут только основатель или мэр территории.',reply_to_message_id:message.message_id});
      return json({ok:true,handled:'gem_withdraw_forbidden'});
    }
    targetType='treasury';targetId=String(territory.id);
    await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(targetId,0,Date.now()).run();
  }
  const opId=`telegram-withdraw-${updateId}`;
  const transfer=await executeIdempotentFinancialTransfer(env,{
    operationId:opId,telegramId:uid,operationType:targetType==='personal'?'telegram_personal_withdraw':'telegram_treasury_withdraw',targetId,amount,
    debitStatement:targetType==='personal'
      ?env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=? AND changes()=1 AND NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(amount,uid,amount,uid)
      :env.DB.prepare(`UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=? AND changes()=1 AND NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(amount,Date.now(),targetId,amount,uid),
    creditStatement:env.DB.prepare(`SELECT 1 WHERE changes()=1`)
  });
  if(transfer.replayed&&transfer.status==='completed')return json({ok:true,handled:'gem_withdraw_duplicate'});
  if(transfer.error||transfer.status!=='completed'){
    const messageText=transfer.status==='rejected'?(targetType==='personal'?'Недостаточно самоцветов на личном счёте.':'В казне территории недостаточно самоцветов.'):(transfer.error||'Операция уже обрабатывается.');
    await telegram(env,'sendMessage',{chat_id:message.chat.id,text:messageText,reply_to_message_id:message.message_id});
    return json({ok:true,handled:'gem_withdraw_rejected'});
  }
  const balanceRow=targetType==='personal'
    ?await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(uid).first()
    :await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(targetId).first();
  const balance=Number(balanceRow?.balance||0);
  const bankerId=String(env.BANKER_TELEGRAM_ID||'').trim();
  if(/^\d+$/.test(bankerId)){
    try{
      const profile=await env.DB.prepare('SELECT mc_nickname,telegram_username FROM users WHERE telegram_id=? LIMIT 1').bind(uid).first();
      const notice=formatGemWithdrawalBankerNotification({nickname:profile?.mc_nickname||message.from?.first_name,username:profile?.telegram_username||message.from?.username,territoryName:territory?.name,personal:targetType==='personal',amount,balance});
      await telegram(env,'sendMessage',{chat_id:Number(bankerId),text:notice,parse_mode:'HTML'});
    }catch(error){console.error('Gem withdrawal banker notification failed:',String(error?.message||error));}
  }
  await telegram(env,'sendMessage',{chat_id:message.chat.id,text:`✅ Снято ${amount} самоцветов. Остаток: ${balance} сц.`,reply_to_message_id:message.message_id});
  return json({ok:true,handled:targetType==='personal'?'gem_personal_withdraw':'gem_treasury_withdraw'});

  }

  return handleUserGemWithdrawal;
}
