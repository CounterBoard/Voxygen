function hasValidTelegramWebhookSecret(request, env) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(expected) || !received || received.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

async function webhook(request, env) {
  const configuredSecret = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(configuredSecret)) {
    console.error(JSON.stringify({ event: 'telegram_webhook_secret_missing', code: 'WEBHOOK_SECRET_NOT_CONFIGURED' }));
    return json({ ok: false, code: 'WEBHOOK_SECRET_NOT_CONFIGURED', error: 'Telegram webhook secret is not configured' }, 503);
  }
  if (!hasValidTelegramWebhookSecret(request, env)) {
    return json({ ok: false, code: 'INVALID_WEBHOOK_SECRET', error: 'Unauthorized webhook request' }, 403);
  }

  let update;
  try { update = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const callbackQuery = update?.callback_query;
  const incomingActor=callbackQuery?.from||update?.message?.from||update?.edited_message?.from;
  const incomingActorId=Number(incomingActor?.id||0);
  if(Number.isSafeInteger(incomingActorId)&&incomingActorId>0){
    await ensureWorldTables(env);
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(incomingActorId).first();
    if(deletionLock){
      try{
        if(callbackQuery?.id)await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Аккаунт находится в процессе удаления',show_alert:true});
        else {const chatId=Number(update?.message?.chat?.id||update?.edited_message?.chat?.id||incomingActorId);await telegram(env,'sendMessage',{chat_id:chatId,text:'Аккаунт находится в процессе удаления. Дождитесь завершения операции.'});}
      }catch(error){console.error('Deletion-lock webhook notice failed:',error);}
      return json({ok:true,ignored:true,reason:'account_deletion_in_progress'});
    }
  }
  if (callbackQuery?.data) {
    const actorId = String(callbackQuery.from?.id || "");
    if (actorId) {
      try {
        await env.DB.prepare(`INSERT INTO users (telegram_id,telegram_username,mc_nickname,status,created_at) VALUES (?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=excluded.telegram_username`).bind(Number(actorId),callbackQuery.from?.username||null,null,'none',Date.now()).run();
        await syncTelegramUsernameEverywhere(env,callbackQuery.from);
      } catch(e) { console.error('Could not sync callback Telegram user:',e); }
    }
    const role = await getRoleByTelegramId(env, actorId);

    try {
        if (String(callbackQuery.data).startsWith("nickname_")) {
        const approved = String(callbackQuery.data).startsWith("nickname_ok:");
        return handleNicknameCallback(env, callbackQuery, approved);
      }

      if (String(callbackQuery.data).startsWith("territory_") && role !== "main_inspector") {
        await telegram(env, "answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "⛔ Недостаточно прав",
          show_alert: true,
        });
        return json({ ok: true });
      }

      if (String(callbackQuery.data).startsWith("screenshot_")) {
        return handleScreenshotCallback(env, callbackQuery);
      }

      if (String(callbackQuery.data).startsWith('resident_')) {
        return handleResidentInviteCallback(env, callbackQuery);
      }
      if (String(callbackQuery.data).startsWith('manager_vote:')) {
        return handleManagerVoteCallback(env, callbackQuery);
      }

        return handleTerritoryCallback(env, callbackQuery);
    } catch (error) {
      console.error('Telegram callback handler error:', callbackQuery.data, error);
      try { await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '⚠️ Не удалось обработать действие', show_alert: true }); } catch {}
      return json({ ok: false, error: 'Callback handler error' }, 500);
    }
  }

  const message = update?.message;
  if (!message) return json({ ok: true, ignored: true });

  const messageUserId = Number(message.from?.id || 0);
  if (messageUserId) {
    try {
      await env.DB.prepare(`INSERT INTO users (telegram_id, telegram_username, mc_nickname, status, created_at) VALUES (?, ?, NULL, 'none', ?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`).bind(messageUserId, message.from?.username || null, Date.now()).run();
      await syncTelegramUsernameEverywhere(env,message.from);
    } catch (e) { console.error('Could not sync Telegram user:', e); }
    await notifyPendingInvitesForUser(env, messageUserId);
  }

  const withdrawalResult = await handleUserGemWithdrawal(env, update, message);
  if (withdrawalResult) return withdrawalResult;

  const bankResult = await handleBankMessage(env, update, message);
  if (bankResult) return bankResult;

  const role = await getRoleByTelegramId(env, messageUserId, message.from?.username || "");
  if (role !== "main_inspector") return json({ ok: true, ignored: true });

  const text = String(message.text || "").trim();
  if (!text) return json({ ok: true, ignored: true });

  if (await handleTerritoryApprovalStep(env, message)) {
    return json({ ok: true, handled: "territory_approval_step" });
  }

  const visualCommandResult=await handleVisualInventoryCommand(env,message,text);
  if(visualCommandResult)return visualCommandResult;

  return json({ ok: true, ignored: true });
}

// ---------------------------------------------------------------------------
// v19: event calendar, scheduled reminders, city additional info and banker
// ---------------------------------------------------------------------------

export function createTelegramWebhookHandler({
  json,
  ensureWorldTables,
  telegram,
  syncTelegramUsernameEverywhere,
  getRoleByTelegramId,
  handleNicknameCallback,
  handleScreenshotCallback,
  handleResidentInviteCallback,
  handleManagerVoteCallback,
  handleTerritoryCallback,
  notifyPendingInvitesForUser,
  handleUserGemWithdrawal,
  handleBankMessage,
  handleTerritoryApprovalStep,
  handleVisualInventoryCommand,
} = {}) {
  async function webhook(request, env) {
    const configuredSecret = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(configuredSecret)) {
      console.error(JSON.stringify({ event: 'telegram_webhook_secret_missing', code: 'WEBHOOK_SECRET_NOT_CONFIGURED' }));
      return json({ ok: false, code: 'WEBHOOK_SECRET_NOT_CONFIGURED', error: 'Telegram webhook secret is not configured' }, 503);
    }
    if (!hasValidTelegramWebhookSecret(request, env)) {
      return json({ ok: false, code: 'INVALID_WEBHOOK_SECRET', error: 'Unauthorized webhook request' }, 403);
    }
  
    let update;
    try { update = await request.json(); }
    catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  
    const callbackQuery = update?.callback_query;
    const incomingActor=callbackQuery?.from||update?.message?.from||update?.edited_message?.from;
    const incomingActorId=Number(incomingActor?.id||0);
    if(Number.isSafeInteger(incomingActorId)&&incomingActorId>0){
      await ensureWorldTables(env);
      const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(incomingActorId).first();
      if(deletionLock){
        try{
          if(callbackQuery?.id)await telegram(env,'answerCallbackQuery',{callback_query_id:callbackQuery.id,text:'Аккаунт находится в процессе удаления',show_alert:true});
          else {const chatId=Number(update?.message?.chat?.id||update?.edited_message?.chat?.id||incomingActorId);await telegram(env,'sendMessage',{chat_id:chatId,text:'Аккаунт находится в процессе удаления. Дождитесь завершения операции.'});}
        }catch(error){console.error('Deletion-lock webhook notice failed:',error);}
        return json({ok:true,ignored:true,reason:'account_deletion_in_progress'});
      }
    }
    if (callbackQuery?.data) {
      const actorId = String(callbackQuery.from?.id || "");
      if (actorId) {
        try {
          await env.DB.prepare(`INSERT INTO users (telegram_id,telegram_username,mc_nickname,status,created_at) VALUES (?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username=excluded.telegram_username`).bind(Number(actorId),callbackQuery.from?.username||null,null,'none',Date.now()).run();
          await syncTelegramUsernameEverywhere(env,callbackQuery.from);
        } catch(e) { console.error('Could not sync callback Telegram user:',e); }
      }
      const role = await getRoleByTelegramId(env, actorId);
  
      try {
          if (String(callbackQuery.data).startsWith("nickname_")) {
          const approved = String(callbackQuery.data).startsWith("nickname_ok:");
          return handleNicknameCallback(env, callbackQuery, approved);
        }
  
        if (String(callbackQuery.data).startsWith("territory_") && role !== "main_inspector") {
          await telegram(env, "answerCallbackQuery", {
            callback_query_id: callbackQuery.id,
            text: "⛔ Недостаточно прав",
            show_alert: true,
          });
          return json({ ok: true });
        }
  
        if (String(callbackQuery.data).startsWith("screenshot_")) {
          return handleScreenshotCallback(env, callbackQuery);
        }
  
        if (String(callbackQuery.data).startsWith('resident_')) {
          return handleResidentInviteCallback(env, callbackQuery);
        }
        if (String(callbackQuery.data).startsWith('manager_vote:')) {
          return handleManagerVoteCallback(env, callbackQuery);
        }
  
          return handleTerritoryCallback(env, callbackQuery);
      } catch (error) {
        console.error('Telegram callback handler error:', callbackQuery.data, error);
        try { await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: '⚠️ Не удалось обработать действие', show_alert: true }); } catch {}
        return json({ ok: false, error: 'Callback handler error' }, 500);
      }
    }
  
    const message = update?.message;
    if (!message) return json({ ok: true, ignored: true });
  
    const messageUserId = Number(message.from?.id || 0);
    if (messageUserId) {
      try {
        await env.DB.prepare(`INSERT INTO users (telegram_id, telegram_username, mc_nickname, status, created_at) VALUES (?, ?, NULL, 'none', ?) ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`).bind(messageUserId, message.from?.username || null, Date.now()).run();
        await syncTelegramUsernameEverywhere(env,message.from);
      } catch (e) { console.error('Could not sync Telegram user:', e); }
      await notifyPendingInvitesForUser(env, messageUserId);
    }
  
    const withdrawalResult = await handleUserGemWithdrawal(env, update, message);
    if (withdrawalResult) return withdrawalResult;
  
    const bankResult = await handleBankMessage(env, update, message);
    if (bankResult) return bankResult;
  
    const role = await getRoleByTelegramId(env, messageUserId, message.from?.username || "");
    if (role !== "main_inspector") return json({ ok: true, ignored: true });
  
    const text = String(message.text || "").trim();
    if (!text) return json({ ok: true, ignored: true });
  
    if (await handleTerritoryApprovalStep(env, message)) {
      return json({ ok: true, handled: "territory_approval_step" });
    }
  
    const visualCommandResult=await handleVisualInventoryCommand(env,message,text);
    if(visualCommandResult)return visualCommandResult;
  
    return json({ ok: true, ignored: true });
  }
  
  // ---------------------------------------------------------------------------
  // v19: event calendar, scheduled reminders, city additional info and banker
  // ---------------------------------------------------------------------------
  return webhook;
}
