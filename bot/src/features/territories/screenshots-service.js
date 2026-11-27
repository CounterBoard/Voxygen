/**
 * Territory screenshot upload, moderation, listing and delivery workflows.
 *
 * The Worker retains HTTP routing and Telegram webhook dispatch. Runtime,
 * authorization, D1 initialization, notifications and response helpers are
 * injected to keep this feature independent from the Worker entry point.
 */
export function createTerritoryScreenshotsService({
  requireUser,
  requireVerifiedUser,
  ensureWorldTables,
  getRoleByTelegramId,
  getTerritoryManagerRows,
  normalizeUsername,
  isTerritoryManager,
  telegram,
  TELEGRAM_API,
  evaluateAchievementsForTerritory,
  json,
  withCors,
} = {}) {
async function uploadScreenshot(request, env) {
  const auth=await requireVerifiedUser(request,env);if(auth.error)return auth.error;await ensureWorldTables(env);const user=auth.user;let form;try{form=await request.formData()}catch(error){return json({ok:false,error:'Не удалось прочитать изображение',details:String(error)},400)}
  const territoryId=String(form.get('territoryId')||'').trim(),file=form.get('photo');if(!territoryId||!(file instanceof File))return json({ok:false,error:'territoryId and photo are required'},400);if(file.type!=='image/jpeg')return json({ok:false,error:'Скриншот должен быть подготовлен в формате JPEG'},400);if(file.size>10_000_000)return json({ok:false,error:'Файл слишком большой'},413);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,owner_telegram_username,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();if(!territory)return json({ok:false,error:'City not found'},404);
  const role=await getRoleByTelegramId(env,user.id);
  const isGovernment=Number(territory.is_government||0)===1;
  const managers=await getTerritoryManagerRows(env,territoryId); const founderId=Number(managers[0]?.telegram_id||territory.owner_telegram_id||0);
  if(role==='user'&&!founderId&&!isGovernment)return json({ok:false,error:'У города пока не привязан Telegram основателя/мэра'},409);
  const username=normalizeUsername(user.username)||`id${user.id}`,token=String(env.BOT_TOKEN||'').trim(),screenshotId=crypto.randomUUID(),status=(isGovernment||role==='inspector'||role==='main_inspector')?'approved':'pending';
  // Government screenshots do not need Telegram moderation. Store the prepared file
  // directly so any authorized user can add them even though the territory has no owner.
  if(isGovernment){
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(bytes.byteLength>900000)return json({ok:false,error:'Скриншот слишком большой после сжатия'},413);
      let binary='';
      const chunk=0x8000;
      for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
      const imageData=btoa(binary);
      await env.DB.prepare(`INSERT INTO screenshots(id,territory_id,telegram_id,telegram_username,file_id,file_unique_id,status,image_data,created_at,moderated_by,moderated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(screenshotId,territoryId,Number(user.id),username,'',null,'approved',imageData,Date.now(),Number(user.id),Date.now()).run();
      return json({ok:true,screenshot:{id:screenshotId,status:'approved',url:`/api/screenshots/${screenshotId}`}});
    }catch(error){
      console.error('Government screenshot direct upload error:',error);
      return json({ok:false,error:'Не удалось сохранить скриншот государственной территории'},500);
    }
  }
  let tgData=null;
  if(status==='pending'){
    const targets=[...new Set(managers.map(m=>Number(m.telegram_id)).filter(Boolean))];
    if(!targets.length) return json({ok:false,error:'У города пока нет Telegram основателя/мэра'},409);
    for(const targetId of targets){
      try{
        const tgForm=new FormData();tgForm.append('chat_id',String(targetId));tgForm.append('photo',file,'screenshot.jpg');
        tgForm.append('caption',`📷 Новый скриншот\n\n👤 ${username}\n🏙 ${territory.name}\n\nВыберите действие:`);
        const response=await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`,{method:'POST',body:tgForm});
        const data=await response.json();
        if(response.ok&&data?.ok){
          try{await telegram(env,'editMessageReplyMarkup',{chat_id:targetId,message_id:data.result.message_id,reply_markup:{inline_keyboard:[[{text:'✅ Одобрить',callback_data:`screenshot_ok:${screenshotId}`},{text:'❌ Отклонить',callback_data:`screenshot_no:${screenshotId}`}]]}})}catch(error){console.error('Screenshot moderation buttons error:',error)}
          if(!tgData) tgData=data;
        }
      }catch(error){console.error('Screenshot manager notification error:',targetId,error)}
    }
    if(!tgData) return json({ok:false,error:'Не удалось отправить скриншот основателям/мэрам'},502);
  } else {
    const tgForm=new FormData();tgForm.append('chat_id',String(user.id));tgForm.append('photo',file,'screenshot.jpg');
    tgForm.append('caption',`📷 Скриншот добавлен\n\n🏙 ${territory.name}`);
    const response=await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`,{method:'POST',body:tgForm});
    const data=await response.json();
    if(!response.ok||!data?.ok)return json({ok:false,error:'Не удалось отправить скриншот в Telegram',details:data?.description||'Telegram API error',telegram:data},502);
    tgData=data;
  }
  const photo=Array.isArray(tgData.result?.photo)?tgData.result.photo[tgData.result.photo.length-1]:null;if(!photo?.file_id)return json({ok:false,error:'Telegram did not return file_id'},502);
  let imageData=null;
  try {
    const tgFile=await telegram(env,'getFile',{file_id:photo.file_id});
    const filePath=tgFile.data?.result?.file_path;
    if(filePath){
      const imageResponse=await fetch(`${TELEGRAM_API}/file/bot${token}/${filePath}`);
      if(imageResponse.ok){
        const bytes=new Uint8Array(await imageResponse.arrayBuffer());
        if(bytes.byteLength<=850000){
          let binary='';
          const chunk=0x8000;
          for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
          imageData=btoa(binary);
        }
      }
    }
  } catch(error) { console.error('Screenshot cache error:',error); }
  const authorNickname=String((await env.DB.prepare(`SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(user.id)).first())?.mc_nickname||'').trim()||null;
  await env.DB.prepare(`INSERT INTO screenshots(id,territory_id,telegram_id,telegram_username,author_mc_nickname,file_id,file_unique_id,status,image_data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(screenshotId,territoryId,Number(user.id),username,authorNickname,photo.file_id,photo.file_unique_id||null,status,imageData,Date.now()).run();
  if(status==='approved') await evaluateAchievementsForTerritory(env,territoryId).catch(error=>console.error('Achievement evaluation after direct screenshot approval:',error));
  return json({ok:true,screenshot:{id:screenshotId,status,url:`/api/screenshots/${screenshotId}`}});
}
async function getScreenshots(request, env, url) {
  await ensureWorldTables(env);
  const territoryId = url.searchParams.get("territoryId");
  if (!territoryId) return json({ ok: false, error: "territoryId is required" }, 400);

  const rows = await env.DB.prepare(`
    SELECT s.id, s.territory_id, s.telegram_id, s.telegram_username, s.status, s.created_at, COALESCE(s.author_mc_nickname,u.mc_nickname) AS mc_nickname
    FROM screenshots s JOIN territories t ON t.id=s.territory_id AND t.status='approved' LEFT JOIN users u ON u.telegram_id=s.telegram_id
    WHERE s.territory_id = ? AND s.status = 'approved'
    ORDER BY s.created_at DESC
  `).bind(territoryId).all();

  const base = new URL(request.url).origin;
  return json({
    ok: true,
    screenshots: (rows.results || []).map((row) => ({
      ...row,
      url: `${base}/api/screenshots/${row.id}`,
      author: row.mc_nickname || row.telegram_username || `id${row.telegram_id}`,
    })),
  });
}

async function moderateScreenshot(request, env, screenshotId, approve) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  if (typeof approve !== 'boolean') {
    let body; try { body = await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
    if (typeof body?.approve === 'boolean') approve = body.approve;
    else if (body?.status === 'approved') approve = true;
    else if (body?.status === 'rejected') approve = false;
    else return json({ok:false,error:'Укажите approve: true или false'},400);
  }

  const screenshot = await env.DB.prepare(`
    SELECT s.*, t.owner_telegram_id, t.requested_by_id
    FROM screenshots s
    JOIN territories t ON t.id = s.territory_id
    WHERE s.id = ?
  `).bind(screenshotId).first();

  if (!screenshot) return json({ ok: false, error: "Screenshot not found" }, 404);
  if (screenshot.status !== 'pending') return json({ok:false,error:'Скриншот уже обработан'},409);

  const role = await getRoleByTelegramId(env, auth.user.id);
  const isFounder = await isTerritoryManager(env,screenshot.territory_id,auth.user.id);

  if (role !== "main_inspector" && !isFounder) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const changed = await env.DB.prepare(`
    UPDATE screenshots
    SET status = ?, moderated_by = ?, moderated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(
    approve ? "approved" : "rejected",
    Number(auth.user.id),
    Date.now(),
    screenshotId
  ).run();
  if (!Number(changed.meta?.changes || 0)) return json({ok:false,error:'Скриншот уже обработан'},409);

  if(approve) await evaluateAchievementsForTerritory(env, screenshot.territory_id).catch(error=>console.error('Achievement evaluation after screenshot:',error));
  return json({ ok: true, status: approve ? "approved" : "rejected" });
}

async function deleteScreenshot(request, env, screenshotId) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;
  const row=await env.DB.prepare(`SELECT s.id,s.territory_id,t.owner_telegram_id,t.is_government FROM screenshots s JOIN territories t ON t.id=s.territory_id WHERE s.id=? AND s.status='approved'`).bind(screenshotId).first();
  if(!row)return json({ok:false,error:'Screenshot not found'},404);
  const role=await getRoleByTelegramId(env,auth.user.id,auth.user.username);
  if(role!=='main_inspector'){
    if(Number(row.is_government||0)===1)return json({ok:false,error:'Только главный инспектор может удалить скрин с государственной территории'},403);
    if(!(await isTerritoryManager(env,row.territory_id,auth.user.id)))return json({ok:false,error:'Только основатель/мэр или главный инспектор может удалить скрин'},403);
  }
  await env.DB.prepare('DELETE FROM screenshots WHERE id=?').bind(screenshotId).run();return json({ok:true});
}

async function serveScreenshot(request, env, screenshotId) {
  const row = await env.DB.prepare(`
    SELECT s.file_id, s.status, s.image_data FROM screenshots s JOIN territories t ON t.id=s.territory_id AND t.status='approved' WHERE s.id = ?
  `).bind(screenshotId).first();

  if (!row || row.status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  if (row.image_data) {
    try {
      const binary=atob(row.image_data);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return withCors(new Response(bytes,{status:200,headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable'}}));
    } catch(error) { console.error('Cached screenshot decode error:',error); }
  }

  const token = String(env.BOT_TOKEN || "").trim();
  const tg = await telegram(env, "getFile", { file_id: row.file_id });
  if (!tg.data?.ok || !tg.data.result?.file_path) {
    return new Response("Telegram file not found", { status: 404 });
  }

  const fileUrl = `${TELEGRAM_API}/file/bot${token}/${tg.data.result.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) return new Response("Image not found", { status: 404 });

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return withCors(new Response(response.body, {
    status: response.status,
    headers,
  }));
}

async function handleScreenshotCallback(env, callbackQuery) {
  const [action, screenshotId] = String(callbackQuery.data || "").split(":");
  if (!["screenshot_ok", "screenshot_no"].includes(action) || !screenshotId) {
    return json({ ok: true });
  }

  const screenshot = await env.DB.prepare(`
    SELECT s.*, t.owner_telegram_id, t.requested_by_id
    FROM screenshots s JOIN territories t ON t.id = s.territory_id
    WHERE s.id = ?
  `).bind(screenshotId).first();

  if (!screenshot) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Скриншот не найден",
      show_alert: true,
    });
    return json({ ok: true });
  }

  const actorId = String(callbackQuery.from?.id || "");
  const role = await getRoleByTelegramId(env, actorId);
  const isFounder = await isTerritoryManager(env,screenshot.territory_id,actorId) || actorId === String(screenshot.requested_by_id || "");

  if (role !== "main_inspector" && !isFounder) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "⛔ Недостаточно прав",
      show_alert: true,
    });
    return json({ ok: true });
  }

  const approved = action === "screenshot_ok";
  const changed = await env.DB.prepare(`
    UPDATE screenshots
    SET status = ?, moderated_by = ?, moderated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(approved ? "approved" : "rejected", Number(actorId), Date.now(), screenshotId).run();
  if (!Number(changed.meta?.changes || 0)) {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Этот скриншот уже обработан",
      show_alert: true,
    });
    return json({ ok: true, alreadyProcessed: true });
  }

  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: approved ? "Скриншот одобрен" : "Скриншот отклонён",
  });

  try {
    await telegram(env, "editMessageReplyMarkup", {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {}

  return json({ ok: true });
}

  return {
    uploadScreenshot,
    getScreenshots,
    moderateScreenshot,
    deleteScreenshot,
    serveScreenshot,
    handleScreenshotCallback,
  };
}
