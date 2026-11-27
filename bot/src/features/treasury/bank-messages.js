export function createTreasuryBankMessageService({
  ensureWorldTables,
  ensureEventsTables,
  ensureUserDirectoryTable,
  isTerritoryManager,
  telegram,
  json,
  stripMinecraftFormatting,
  executeIdempotentFinancialTransfer,
  escapeHtml,
  notifyTerritoryManagers,
  normalizeVisualCommandText,
  parseVisualDiscountCommand,
  handleVisualDiscountMessage,
} = {}) {
  function parseGemWithdrawalCommand(raw) {
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
  
  function formatGemWithdrawalBankerNotification({ nickname, username, territoryName, personal, amount, balance }) {
    const displayName = String(nickname || '').trim() || 'Ник не указан';
    const displayUsername = String(username || '').trim().replace(/^@+/, '');
    const identity = `[<code>${escapeHtml(displayName)}</code>]${displayUsername ? ' @' + escapeHtml(displayUsername) : ''}`;
    const source = personal ? 'Личный счёт' : 'Казна ' + escapeHtml(String(territoryName || 'Неизвестная территория').trim());
    return ['💎 Снятие самоцветов', '', 'Кто: ' + identity, 'Откуда: ' + source, 'Сумма: ' + Number(amount) + ' сц', 'Остаток: ' + Number(balance) + ' сц'].join('\n');
  }
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
  
  function parseBankCommand(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const hasBankNotificationHeader = /^🏦\s*Уведомление банка\s*/i.test(text);
    const notificationBody = hasBankNotificationHeader ? text.replace(/^🏦\s*Уведомление банка\s*/i, '') : '';
    const notification = notificationBody.match(/^Игрок\s+(.+?)\s+совершил\s+перевод\s+в\s+размере\s+([\d\s]+)\s+самоцветов\s+на\s+ваш\s+сч[её]т\s*\(\s*88\s*\)\.?$/i);
    if (notification) {
      const target = notification[1].trim();
      const amount = Number(notification[2].replace(/\s/g, ''));
      if (target && Number.isSafeInteger(amount) && amount > 0) return { target: stripMinecraftFormatting(target), amount, direction: 'credit' };
      return null;
    }
    const isAmount = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000_000;
    const sign = value => value.startsWith('-') || value.startsWith('−') ? 'debit' : 'credit';
    const digits = value => value.replace(/^[+＋]/, '').replace(/^[-−]/, '');
    // Also accept compact amount-first debit forms `42 -Nick` and `42-Nick`. 
    let match = text.match(/^(\d+)\s*[-−]([^\s].*)$/);
    if (match && isAmount(match[1])) return { target: stripMinecraftFormatting(match[2]).trim().replace(/^@+/, ''), amount: Number(match[1]), direction: 'debit' };
    // Target-first syntax: `Steve 42`, `Steve +42`, `Steve -42`, `Steve-42`, `Steve+42`.
    match = text.match(/^(.+?)(?:\s+|(?=[+＋−-]))((?:[+＋]|[-−])?\d+)$/);
    if (match) {
      const target = match[1].trim(), rawAmount = match[2], amount = digits(rawAmount);
      if (target && isAmount(amount)) return { target: stripMinecraftFormatting(target).trim().replace(/^@+/, ''), amount: Number(amount), direction: sign(rawAmount) };
    }
    // Amount-first variants: `42 Steve`, `+42 Steve`, `-42 Steve`.
    match = text.match(/^((?:[+＋]|[-−])?\d+)\s+(.+)$/);
    if (match) {
      const rawAmount = match[1], amount = digits(rawAmount), target = stripMinecraftFormatting(match[2]).trim().replace(/^@+/, '');
      if (target && isAmount(amount)) return { target, amount: Number(amount), direction: sign(rawAmount) };
    }
    return null;
  }
  
  async function resolveBankTarget(env, query) {
    const target = String(query || '').trim().replace(/^@+/, '').toLowerCase();
    if (!target) return { error: 'Не указан игрок' };
    await ensureUserDirectoryTable(env);
    const found = await env.DB.prepare(`SELECT telegram_id FROM users
        WHERE (trim(COALESCE(mc_nickname,''))<>'' AND lower(mc_nickname)=?)
           OR lower(replace(COALESCE(telegram_username,''),'@',''))=?
      UNION SELECT telegram_id FROM user_directory
        WHERE (trim(COALESCE(mc_nickname,''))<>'' AND lower(mc_nickname)=?)
           OR lower(replace(COALESCE(telegram_username,''),'@',''))=?`).bind(target,target,target,target).all();
    const ids = [...new Set((found.results || []).map(row => Number(row.telegram_id)).filter(id => Number.isSafeInteger(id) && id > 0))];
    if (ids.length === 0) return { error: 'Игрок не найден. Проверьте Minecraft-ник или Telegram username.' };
    if (ids.length > 1) return { error: 'Найдено несколько игроков с таким именем. Используйте точный уникальный username.' };
    return { telegramId: ids[0] };
  }
  
  async function resolveBankTerritoryTarget(env, query) {
    const target = normalizeVisualCommandText(query);
    if (!target) return { matches: [] };
    const rows = await env.DB.prepare(`SELECT id,name FROM territories WHERE status='approved'`).all();
    const matches = (rows.results || []).filter(row => normalizeVisualCommandText(row.name) === target)
      .map(row => ({ id: String(row.id), name: String(row.name || '') }));
    return { matches };
  }
  
  async function applyBankBalanceChange(env, { updateId, targetType, targetId, amount, direction, ledgerDirection, now, successNote, rejectedNote }) {
    const treasury = targetType === 'treasury';
    const debit = direction === 'debit';
    const balanceUpdate = treasury
      ? (debit
        ? env.DB.prepare(`UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=? AND EXISTS(SELECT 1 FROM bank_transactions WHERE update_id=? AND status='processing')`).bind(amount,now,String(targetId),amount,updateId)
        : env.DB.prepare(`UPDATE city_treasury SET balance=balance+?,updated_at=? WHERE territory_id=? AND EXISTS(SELECT 1 FROM bank_transactions WHERE update_id=? AND status='processing')`).bind(amount,now,String(targetId),updateId))
      : (debit
        ? env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=? AND EXISTS(SELECT 1 FROM bank_transactions WHERE update_id=? AND status='processing') AND NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(amount,Number(targetId),amount,updateId,Number(targetId))
        : env.DB.prepare(`UPDATE user_currency SET balance=balance+? WHERE telegram_id=? AND EXISTS(SELECT 1 FROM bank_transactions WHERE update_id=? AND status='processing') AND NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(amount,Number(targetId),updateId,Number(targetId)));
    const balanceTable = treasury ? 'city_treasury' : 'user_currency';
    const balanceWhere = treasury ? 'territory_id=?' : 'telegram_id=?';
    const ledgerTargetId = treasury ? null : Number(targetId);
    const successUpdate = env.DB.prepare(`UPDATE bank_transactions
      SET target_telegram_id=?,direction=?,status='success',
          balance_after=(SELECT balance FROM ${balanceTable} WHERE ${balanceWhere}),updated_at=?,note=?
      WHERE update_id=? AND status='processing' AND changes()=1`).bind(ledgerTargetId,ledgerDirection,String(targetId),now,successNote,updateId);
    const rejectedUpdate = env.DB.prepare(`UPDATE bank_transactions
      SET target_telegram_id=?,direction=?,status='rejected',
          balance_after=(SELECT balance FROM ${balanceTable} WHERE ${balanceWhere}),updated_at=?,note=?
      WHERE update_id=? AND status='processing' AND changes()=0`).bind(ledgerTargetId,ledgerDirection,String(targetId),now,rejectedNote,updateId);
    const batch = await env.DB.batch([balanceUpdate,successUpdate,rejectedUpdate]);
    const row = await env.DB.prepare(`SELECT status,balance_after FROM bank_transactions WHERE update_id=? LIMIT 1`).bind(updateId).first();
    const processed = Number(batch?.[1]?.meta?.changes||0)>0 || Number(batch?.[2]?.meta?.changes||0)>0;
    return {status:String(row?.status||''),balanceAfter:Number(row?.balance_after||0),replayed:!processed};
  }
  
  function isPrivateBankerMessage(message, bankerId) {
    const id = String(bankerId || '').trim();
    return Boolean(
      /^\d+$/.test(id) &&
      String(message?.from?.id || '') === id &&
      message?.chat?.type === 'private' &&
      String(message?.chat?.id || '') === id
    );
  }

  async function handleBankMessage(env, update, message) {
    const bankerId = String(env.BANKER_TELEGRAM_ID || '').trim();
    if (!isPrivateBankerMessage(message, bankerId)) return null;
    const rawMessage=message.text || message.caption || '';
    const discountCommand=parseVisualDiscountCommand(rawMessage);
    if(discountCommand)return handleVisualDiscountMessage(env,update,message,discountCommand);
    const command = parseBankCommand(rawMessage);
    if (!command) return null;
    const updateId = Number(update?.update_id);
    const chatId = Number(message.chat?.id || message.from?.id || 0);
    const messageId = Number(message.message_id || 0);
    if (!Number.isSafeInteger(updateId) || updateId < 0 || !chatId || !messageId) return json({ ok: true, handled: 'bank_invalid_update' });
    await ensureWorldTables(env);
    await ensureEventsTables(env);
    const now = Date.now(), transactionId = crypto.randomUUID();
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO bank_transactions(id,update_id,chat_id,message_id,actor_telegram_id,target_query,amount,direction,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?, 'processing',?,?)`).bind(transactionId,updateId,chatId,messageId,Number(message.from.id),command.target,command.amount,command.direction,now,now).run();
    if (!inserted.meta?.changes) {
      const existing = await env.DB.prepare(`SELECT status FROM bank_transactions WHERE update_id=? LIMIT 1`).bind(updateId).first();
      // A previous Worker may have stopped after reserving the update. Reprocessing is safe:
      // balance changes and the final ledger status are committed together below.
      if (String(existing?.status||'') !== 'processing') return json({ ok: true, handled: 'bank_duplicate' });
    }
    const reply = async text => { try { await telegram(env,'sendMessage',{chat_id:chatId,text,reply_to_message_id:messageId}); } catch (error) { console.error('Bank receipt reply failed:',error); } };
    try {
      // Resolve territory commands in both directions before trying to resolve a player.
      // Minecraft formatting codes are normalized by resolveBankTerritoryTarget.
      const cityResult = await resolveBankTerritoryTarget(env, command.target);
      if (cityResult.matches.length > 1) {
        await env.DB.prepare(`UPDATE bank_transactions SET status='rejected',updated_at=?,note='Ambiguous territory name' WHERE update_id=?`).bind(Date.now(),updateId).run();
        await reply('🏦 Операция не выполнена: найдено несколько территорий с таким названием.');
        return json({ ok: true, handled: 'bank_ambiguous_territory' });
      }
      if (cityResult.matches.length === 1) {
        const city = cityResult.matches[0];
        await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(city.id,0,Date.now()).run();
        const ledgerDirection = command.direction === 'debit' ? 'treasury_debit' : 'treasury_credit';
        const transfer = await applyBankBalanceChange(env,{
          updateId,targetType:'treasury',targetId:city.id,amount:command.amount,direction:command.direction,
          ledgerDirection,now:Date.now(),successNote:command.direction==='debit'?'Banker treasury debit':'Banker treasury credit',
          rejectedNote:'Недостаточно средств в казне',
        });
        if (transfer.replayed) {
          await reply('🏦 Эта операция уже обрабатывается или была завершена ранее.');
          return json({ok:true,handled:'bank_duplicate'});
        }
        if (transfer.status !== 'success') {
          await reply(`🏦 Операция не выполнена: в казне территории «${stripMinecraftFormatting(city.name)}» недостаточно средств.`);
          return json({ ok: true, handled: 'bank_treasury_insufficient_funds' });
        }
        const balanceAfter = transfer.balanceAfter;
        const direction = ledgerDirection;
        const actionText = command.direction === 'debit' ? 'снято с казны' : 'зачислено в казну';
        await reply(`🏦 Казна территории «${stripMinecraftFormatting(city.name)}»: ${actionText} ${command.amount} сц. Новый баланс: ${balanceAfter} сц.`);
        const notice = command.direction === 'debit'
          ? `🏦 <b>Уведомление банка</b>\n\nС казны территории «${escapeHtml(stripMinecraftFormatting(city.name))}» снято <b>${command.amount}</b> сц. Новый баланс: <b>${balanceAfter}</b> сц.`
          : `🏦 <b>Уведомление банка</b>\n\nКазна территории «${escapeHtml(stripMinecraftFormatting(city.name))}» пополнена на <b>${command.amount}</b> сц. Новый баланс: <b>${balanceAfter}</b> сц.`;
        await notifyTerritoryManagers(env, city.id, notice, null).catch(error=>console.error('Treasury banker notification failed:',error));
        return json({ ok: true, handled: direction === 'treasury_debit' ? 'bank_treasury_debit' : 'bank_treasury_credit' });
      }
      const resolved = await resolveBankTarget(env,command.target);
      if (resolved.error) {
        await env.DB.prepare(`UPDATE bank_transactions SET status='rejected',updated_at=?,note=? WHERE update_id=?`).bind(Date.now(),resolved.error,updateId).run();
        await reply(`🏦 Операция не выполнена: ${resolved.error}`);
        return json({ ok: true, handled: 'bank_rejected' });
      }
      const targetId = resolved.telegramId;
      await env.DB.prepare(`INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(targetId,targetId).run();
      const transfer = await applyBankBalanceChange(env,{
        updateId,targetType:'user',targetId,amount:command.amount,direction:command.direction,
        ledgerDirection:command.direction,now:Date.now(),
        successNote:command.direction==='debit'?'Banker player debit':'Banker player credit',
        rejectedNote:'Недостаточно самоцветов',
      });
      if (transfer.replayed) {
        await reply('🏦 Эта операция уже обрабатывается или была завершена ранее.');
        return json({ok:true,handled:'bank_duplicate'});
      }
      if (transfer.status !== 'success') {
        await reply('🏦 Операция не выполнена: на балансе игрока недостаточно сц.');
        return json({ ok: true, handled: 'bank_insufficient_funds' });
      }
      const balance = {balance:transfer.balanceAfter};
      const verb = command.direction === 'debit' ? 'списано' : 'зачислено';
      await reply(`🏦 Готово: ${verb} ${command.amount} сц. Игрок: ${command.target}. Баланс: ${Number(balance?.balance || 0)} сц.`);
      try {
        // Keep the established notification sent to the recipient. The `(88)` sentence
        // is a banker command syntax, not the text to deliver to the user.
        await telegram(env,'sendMessage',{chat_id:targetId,text:`💎 ${command.direction==='debit'?'С вашего баланса списано':'На ваш баланс зачислено'} ${command.amount} сц. Новый баланс: ${Number(balance?.balance||0)} сц.`});
      } catch (error) { console.error(JSON.stringify({event:'bank_user_notification_failed',targetId,code:'BANK_USER_NOTIFICATION_FAILED'})); }
      return json({ ok: true, handled: 'bank_success' });
    } catch (error) {
      // Keep an uncommitted operation retryable. A committed transfer already has a
      // terminal ledger status, so this update cannot mark it as failed.
      await env.DB.prepare(`UPDATE bank_transactions SET updated_at=?,note='Internal processing error' WHERE update_id=? AND status='processing'`).bind(Date.now(),updateId).run().catch(()=>{});
      console.error(JSON.stringify({event:'bank_transaction_failed',updateId,code:'BANK_TRANSACTION_FAILED'}));
      // Return a retryable webhook error; reprocessing is protected by the atomic
      // balance+ledger batch and the unique Telegram update_id.
      return json({ ok: false, error: 'Bank transaction processing failed' }, 500);
    }
  }

  return {
    parseGemWithdrawalCommand,
    formatGemWithdrawalBankerNotification,
    handleUserGemWithdrawal,
    parseBankCommand,
    resolveBankTarget,
    resolveBankTerritoryTarget,
    applyBankBalanceChange,
    isPrivateBankerMessage,
    handleBankMessage,
  };
}
