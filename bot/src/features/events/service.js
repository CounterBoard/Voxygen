export function createEventsService({
  ensureEventsTables,
  ensureWorldTables,
  ensureUserPreferenceTables,
  requireUser,
  requireMainInspector,
  getCurrentUser,
  getRoleByTelegramId,
  isTerritoryManager,
  json,
  telegram,
  normalizeUserTimezone,
  escapeHtml,
  stripMinecraftFormatting,
  formatEventTimeForUser,
  formatTerritoryCoords,
} = {}) {
  async function purgeExpiredEvents(env, at = Date.now()) {
    await ensureEventsTables(env);
    const cutoff = Number(at || Date.now()) - 24 * 60 * 60 * 1000;
    // Keep reminder/event/request cleanup atomic so a failed statement cannot leave
    // expired events without their reminders (or remove reminders while retaining events).
    const batch = await env.DB.batch([
      env.DB.prepare(`DELETE FROM event_reminders WHERE event_id IN (SELECT id FROM events WHERE event_at<=?)`).bind(cutoff),
      env.DB.prepare(`DELETE FROM events WHERE event_at<=?`).bind(cutoff),
      env.DB.prepare(`DELETE FROM event_create_requests WHERE created_at<?`).bind(Number(at || Date.now()) - 30 * 24 * 60 * 60 * 1000),
    ]);
    return Number(batch?.[1]?.meta?.changes || 0);
  }
  
  async function getEvents(request, env) {
    const url = new URL(request.url);
    const manage = url.searchParams.get('manage') === '1';
    if (manage) {
      const auth = await requireMainInspector(request, env);
      if (auth.error) return auth.error;
    }
    await ensureEventsTables(env);
    const now = Date.now();
    const viewer = await getCurrentUser(request, env);
    await purgeExpiredEvents(env, now);
    const cutoff = now - 24 * 60 * 60 * 1000;
    // Return upcoming events and events that started within the last 24 hours.
    // The frontend separates them into upcoming/past sections; older events are permanently purged above.
    const activeWhere = 'e.active=1 AND e.event_at>?';
    const rows = viewer?.id
      ? await env.DB.prepare(`SELECT e.*,t.name AS territory_name,r.id AS reminder_id,r.lead_value AS reminder_value,r.lead_unit AS reminder_unit,r.remind_at AS reminder_at,r.status AS reminder_status
          FROM events e LEFT JOIN territories t ON t.id=e.territory_id
          LEFT JOIN event_reminders r ON r.event_id=e.id AND r.telegram_id=?
          WHERE ${activeWhere} ORDER BY e.event_at ASC LIMIT 100`).bind(Number(viewer.id), cutoff).all()
      : await env.DB.prepare(`SELECT e.*,t.name AS territory_name,NULL AS reminder_id,NULL AS reminder_value,NULL AS reminder_unit,NULL AS reminder_at,NULL AS reminder_status
          FROM events e LEFT JOIN territories t ON t.id=e.territory_id
          WHERE ${activeWhere} ORDER BY e.event_at ASC LIMIT 100`).bind(cutoff).all();
    return json({ ok: true, events: (rows.results || []).map(row => ({
      ...row,
      reminder: row.reminder_id ? { id: row.reminder_id, value: Number(row.reminder_value || 0), unit: row.reminder_unit || 'minutes', remind_at: Number(row.reminder_at || 0), status: row.reminder_status || 'pending' } : null,
    })) });
  }
  
  function addUtcCalendarMonths(timestamp,months=2){
    const date=new Date(Number(timestamp));
    if(!Number.isFinite(date.getTime())||!Number.isInteger(months))return NaN;
    const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
    const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,lastDay));return date.getTime();
  }
  function eventDateExceedsTwoMonths(eventAt,now=Date.now()){
    return Number(eventAt)>addUtcCalendarMonths(now,2);
  }
  function calculateDiscountedPrice(price,percent){
    const base=Number(price),discount=Math.max(0,Math.min(100,Math.floor(Number(percent)||0)));
    if(!Number.isSafeInteger(base)||base<0)return NaN;
    return discount>0?Math.max(0,Math.round(base*(100-discount)/100)):base;
  }
  
  function validateEventBody(body, { partial = false } = {}) {
    const out = {};
    if (!partial || body.title !== undefined) out.title = String(body?.title || '').trim();
    if (!partial || body.territoryId !== undefined) out.territoryId = String(body?.territoryId || '').trim() || null;
    if (!partial || body.place !== undefined) out.place = String(body?.place || '').trim();
    if (!partial || body.eventAt !== undefined) out.eventAt = Number(body?.eventAt);
    if (!partial || body.coords !== undefined) out.coords = String(body?.coords || '').trim();
    if (!partial || body.description !== undefined) out.description = String(body?.description || '').trim();
    if (!partial || body.imageData !== undefined) out.imageData = String(body?.imageData || '').trim() || null;
    if (!partial || body.pageUrl !== undefined) out.pageUrl = String(body?.pageUrl || '').trim() || null;
    if (!partial || body.eventTimezone !== undefined) out.eventTimezone = String(body?.eventTimezone || 'UTC').trim() || 'UTC';
    if (out.title !== undefined && (!out.title || out.title.length > 160)) return { error: 'Название события должно содержать 1–160 символов' };
    if (out.place !== undefined && out.place.length > 200) return { error: 'Место проведения не должно превышать 200 символов' };
    const validationNow=Date.now();
    if (out.eventAt !== undefined && (!Number.isSafeInteger(out.eventAt) || ((!partial || body?.eventAt !== undefined) && out.eventAt <= validationNow))) return { error: 'Укажите дату и время в будущем' };
    if (out.eventAt !== undefined && eventDateExceedsTwoMonths(out.eventAt,validationNow)) return { error: 'Создавать ивенты можно максимум за 2 месяца до начала' };
    if (out.coords !== undefined && out.coords.length > 180) return { error: 'Координаты слишком длинные' };
    if (out.description !== undefined && out.description.length > 542) return { error: 'Описание ивента не должно превышать 542 символа' };
    if (out.imageData && (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(out.imageData) || out.imageData.length > 1_500_000)) return { error: 'Изображение должно быть PNG, JPG или WebP размером до 1,1 МБ' };
    if (out.pageUrl && (out.pageUrl.length > 1000 || !/^https?:\/\//i.test(out.pageUrl))) return { error: 'Ссылка должна начинаться с http:// или https://' };
    if (out.eventTimezone !== undefined && out.eventTimezone.length > 80) return { error: 'Часовой пояс указан некорректно' };
    if (out.eventTimezone !== undefined) {
      const rawZone=out.eventTimezone.replace(/^UTC/i,'').trim();
      const offsetMatch=rawZone.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
      if(offsetMatch){
        const sign=offsetMatch[1],hours=Number(offsetMatch[2]),minutes=Number(offsetMatch[3]||0),maxHours=sign==='-'?12:14;
        if(hours>maxHours||minutes>=60||minutes%15!==0||(hours===14&&(sign!=='+'||minutes!==0))||(sign==='-'&&hours===12&&minutes!==0))return {error:'Часовой пояс указан некорректно'};
        out.eventTimezone=normalizeUserTimezone(out.eventTimezone);
      } else {
        try { new Intl.DateTimeFormat('ru-RU', { timeZone: out.eventTimezone }).format(new Date()); }
        catch { return { error: 'Часовой пояс указан некорректно' }; }
      }
    }
    if (out.territoryId) {
      // checked in create/update route as part of the DB operation
    }
    return { value: out };
  }
  
  async function notifyUsersOfNewEvent(env, event) {
    await ensureUserPreferenceTables(env);
    const subscribers = await env.DB.prepare(`SELECT telegram_id,timezone FROM user_preferences WHERE all_notifications=1 AND event_notifications=1`).all();
    const title = escapeHtml(stripMinecraftFormatting(event.title || 'Ивент'));
    const place = String(stripMinecraftFormatting(event.place || '')).trim();
    for (const row of subscribers.results || []) {
      const date = formatEventTimeForUser(event.eventAt, row.timezone);
      const text = `📅 <b>Создан новый ивент</b>\n\n<b>${title}</b>\n\n🕒 ${escapeHtml(date)}${place && place !== 'Не указано' ? `\n🏙 ${escapeHtml(place)}` : ''}`;
      try {
        const result = await telegram(env, 'sendMessage', { chat_id: Number(row.telegram_id), text, parse_mode: 'HTML', disable_web_page_preview: true });
        if (!result.response.ok || !result.data?.ok) console.error('New event notification rejected by Telegram:', row.telegram_id, result.data?.error_code || result.response.status, result.data?.description || '');
      } catch (error) { console.error('New event notification failed:', row.telegram_id, error); }
    }
  }
  
  async function createEvent(request, env) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth.error;
    await ensureWorldTables(env);
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    const parsed = validateEventBody(body);
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const e = parsed.value;
    const creatorId = Number(auth.user.id);
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(creatorId).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    const creatorRole = await getRoleByTelegramId(env, creatorId, auth.user.username || '');
    const isMainInspector = creatorRole === 'main_inspector';
    let selectedCity = null;
  
    if (e.territoryId) {
      selectedCity = await env.DB.prepare(`SELECT id,name,coords,is_government FROM territories WHERE id=? AND status='approved' LIMIT 1`).bind(e.territoryId).first();
      if (!selectedCity) return json({ ok: false, error: 'Выбранная территория не найдена' }, 404);
      if (!isMainInspector && Number(selectedCity.is_government || 0) === 1) return json({ ok: false, error: 'Нельзя создать ивент от государственной территории' }, 403);
      if (!isMainInspector) {
        const isManager = await isTerritoryManager(env, e.territoryId, creatorId);
        const member = await env.DB.prepare(`SELECT 1 AS ok FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(e.territoryId,creatorId).first();
        if (!isManager && !member) return json({ ok: false, error: 'Выбрать можно только территорию, где вы основатель/мэр или житель' }, 403);
      }
    }
  
    // The venue is always derived from a verified, allowed territory; otherwise it is explicitly unset.
    e.place = selectedCity ? String(selectedCity.name || '') : 'Не указано';
    if (!e.place) e.place = 'Не указано';
    const now = Date.now();
    await ensureEventsTables(env);
    const requestKey = String(body?.requestKey || '').trim() || crypto.randomUUID();
    if (requestKey.length < 8 || requestKey.length > 120) return json({ ok: false, error: 'Некорректный ключ отправки ивента' }, 400);
    const payloadForHash = JSON.stringify([
      e.title, e.territoryId, e.place, e.eventAt, e.coords, e.description,
      e.imageData, e.pageUrl, e.eventTimezone,
    ]);
    const payloadDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadForHash));
    const payloadHash = [...new Uint8Array(payloadDigest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const candidateId = crypto.randomUUID();
    try{
      await env.DB.prepare(`INSERT OR IGNORE INTO event_create_requests(telegram_id,request_key,event_id,payload_hash,status,created_at,updated_at)
        VALUES(?,?,?,?, 'processing',?,?)`).bind(creatorId,requestKey,candidateId,payloadHash,now,now).run();
    }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
    let reservation = await env.DB.prepare(`SELECT event_id,payload_hash FROM event_create_requests WHERE telegram_id=? AND request_key=? LIMIT 1`).bind(creatorId,requestKey).first();
    if (!reservation?.event_id) return json({ ok: false, error: 'Не удалось зарезервировать публикацию ивента' }, 500);
    // Backfill keys created by older versions without a payload fingerprint. The
    // conditional update makes competing retries agree on the first accepted body.
    if (!reservation.payload_hash) {
      try{
        await env.DB.prepare(`UPDATE event_create_requests SET payload_hash=?,updated_at=?
          WHERE telegram_id=? AND request_key=? AND payload_hash IS NULL`).bind(payloadHash,now,creatorId,requestKey).run();
      }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
      reservation = await env.DB.prepare(`SELECT event_id,payload_hash FROM event_create_requests WHERE telegram_id=? AND request_key=? LIMIT 1`).bind(creatorId,requestKey).first();
    }
    if (String(reservation?.payload_hash || '') !== payloadHash) {
      return json({ ok: false, error: 'Этот ключ отправки уже связан с другим содержимым ивента. Измените черновик и отправьте его заново.' }, 409);
    }
    const id = String(reservation.event_id);
    const existing = await env.DB.prepare(`SELECT id FROM events WHERE id=? LIMIT 1`).bind(id).first();
    if (existing) {
      try{await env.DB.prepare(`UPDATE event_create_requests SET status='completed',updated_at=? WHERE telegram_id=? AND request_key=?`).bind(now,creatorId,requestKey).run();}
      catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
      return json({ ok: true, id, status: 'created', replayed: true });
    }
    let inserted;
    try{
      const batch=await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO events(id,title,territory_id,place,event_at,coords,description,image_data,page_url,event_timezone,created_by,created_at,updated_at,active)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(id,e.title,e.territoryId,e.place,e.eventAt,e.coords,e.description,e.imageData,e.pageUrl,e.eventTimezone,creatorId,now,now),
        env.DB.prepare(`UPDATE event_create_requests SET status='completed',updated_at=? WHERE telegram_id=? AND request_key=?`).bind(now,creatorId,requestKey)
      ]);
      inserted=batch[0];
    }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
    const created = await env.DB.prepare(`SELECT id FROM events WHERE id=? LIMIT 1`).bind(id).first();
    if (!created) return json({ ok: false, error: 'Не удалось сохранить ивент. Повторите отправку.' }, 500);
    if (Number(inserted.meta?.changes || 0) > 0) {
      try { await notifyUsersOfNewEvent(env, e); } catch (error) { console.error('New event notification pass failed:', error); }
    }
    return json({ ok: true, id, status: 'created', replayed: Number(inserted.meta?.changes || 0) === 0 });
  }
  
  async function updateEvent(request, env) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth.error;
    await ensureWorldTables(env);
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    const id = String(body?.id || '').trim();
    if (!id) return json({ ok: false, error: 'Событие не найдено' }, 400);
    await ensureEventsTables(env);
    const current = await env.DB.prepare(`SELECT * FROM events WHERE id=? AND active=1 LIMIT 1`).bind(id).first();
    if (!current) return json({ ok: false, error: 'Событие не найдено' }, 404);
    if (Number(current.event_at) <= Date.now()) return json({ ok:false, error:'Прошедшие ивенты нельзя редактировать' },403);
    const creatorId=Number(auth.user.id),creatorRole=await getRoleByTelegramId(env,creatorId,auth.user.username||'');
    const isMainInspector=creatorRole==='main_inspector';
    if (!isMainInspector && Number(current.created_by)!==creatorId) return json({ ok:false,error:'Редактировать ивент может только его создатель' },403);
    const updateBody={...body};
    // Existing event dates remain editable when the date itself was not changed.
    if(body?.eventAt!==undefined&&Number(body.eventAt)===Number(current.event_at))delete updateBody.eventAt;
    const parsed = validateEventBody(updateBody, { partial: true });
    if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
    const e = parsed.value;
    let selectedCity=null;
    if (e.territoryId) {
      selectedCity = await env.DB.prepare(`SELECT id,name,is_government FROM territories WHERE id=? AND status='approved' LIMIT 1`).bind(e.territoryId).first();
      if (!selectedCity) return json({ ok: false, error: 'Выбранная территория не найдена' }, 404);
      if (!isMainInspector && String(e.territoryId)!==String(current.territory_id||'')) {
        if (Number(selectedCity.is_government||0)===1) return json({ok:false,error:'Нельзя выбрать государственную территорию'},403);
        const isManager=await isTerritoryManager(env,e.territoryId,creatorId);
        const member=await env.DB.prepare(`SELECT 1 AS ok FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(e.territoryId,creatorId).first();
        if(!isManager&&!member)return json({ok:false,error:'Выбрать можно только территорию, где вы основатель/мэр или житель'},403);
      }
    }
    const nextTerritoryId=e.territoryId!==undefined?e.territoryId:current.territory_id;
    const nextPlace=e.territoryId!==undefined?(selectedCity?.name||'Не указано'):(e.place??current.place);
    const value = {
      title: e.title ?? current.title, territoryId: nextTerritoryId,
      place: nextPlace, eventAt: e.eventAt ?? Number(current.event_at), coords: e.coords ?? current.coords,
      description: e.description ?? current.description, imageData: e.imageData !== undefined ? e.imageData : current.image_data,
      pageUrl: e.pageUrl !== undefined ? e.pageUrl : current.page_url,
      eventTimezone: e.eventTimezone ?? current.event_timezone ?? 'UTC',
    };
    const now = Date.now();
    const eventUpdate = env.DB.prepare(`UPDATE events SET title=?,territory_id=?,place=?,event_at=?,coords=?,description=?,image_data=?,page_url=?,event_timezone=?,updated_at=? WHERE id=? AND active=1`)
      .bind(value.title,value.territoryId,value.place,value.eventAt,value.coords,value.description,value.imageData,value.pageUrl,value.eventTimezone,now,id);
    if (e.eventAt !== undefined && Number(e.eventAt)!==Number(current.event_at)) {
      // Update the event and its reminder schedule atomically. Cron cannot observe a mixed state
      // with the new date but the previous remind_at (or vice versa).
      const reminderUpdate = env.DB.prepare(`UPDATE event_reminders SET remind_at=? - CASE WHEN lead_unit='hours' THEN lead_value*3600000 ELSE lead_value*60000 END,
        status=CASE WHEN (? - CASE WHEN lead_unit='hours' THEN lead_value*3600000 ELSE lead_value*60000 END)<=? THEN 'expired' ELSE 'pending' END,
        attempts=0,next_attempt_at=0,claim_token=NULL,sent_at=NULL,updated_at=? WHERE event_id=? AND status IN ('pending','sending','sent','failed','expired')
        AND EXISTS(SELECT 1 FROM events WHERE id=? AND active=1)`)
        .bind(value.eventAt,value.eventAt,now,now,id,id);
      const batch = await env.DB.batch([eventUpdate,reminderUpdate]);
      if (!Number(batch?.[0]?.meta?.changes || 0)) return json({ok:false,error:'Событие не найдено'},404);
    } else {
      const updated = await eventUpdate.run();
      if (!Number(updated.meta?.changes || 0)) return json({ok:false,error:'Событие не найдено'},404);
    }
    return json({ ok: true, id, status: 'updated' });
  }
  
  async function deleteEvent(request, env) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth.error;
    await ensureWorldTables(env);
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    const id = String(body?.id || '').trim();
    if (!id) return json({ ok: false, error: 'Событие не найдено' }, 400);
    await ensureEventsTables(env);
    const event = await env.DB.prepare(`SELECT id,created_by,active FROM events WHERE id=? LIMIT 1`).bind(id).first();
    if (!event || Number(event.active||0)!==1) return json({ ok: false, error: 'Событие не найдено' }, 404);
    const role = await getRoleByTelegramId(env, Number(auth.user.id), auth.user.username || '');
    if (role !== 'main_inspector' && Number(event.created_by) !== Number(auth.user.id)) {
      return json({ ok:false, error:'Удалить ивент может только его создатель или главный инспектор' },403);
    }
    const now=Date.now();
    const batch = await env.DB.batch([
      env.DB.prepare(`UPDATE events SET active=0,updated_at=? WHERE id=? AND active=1`).bind(now,id),
      env.DB.prepare(`UPDATE event_reminders SET status='cancelled',claim_token=NULL,updated_at=? WHERE event_id=? AND status IN ('pending','sending')`).bind(now,id),
    ]);
    if (!Number(batch?.[0]?.meta?.changes || 0)) return json({ ok: false, error: 'Событие не найдено' }, 404);
    return json({ ok: true, id, status: 'deleted' });
  }
  
  async function saveEventReminder(request, env, remove = false) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth.error;
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    const eventId = String(body?.eventId || '').trim();
    if (!eventId) return json({ ok: false, error: 'Событие не найдено' }, 400);
    await ensureEventsTables(env);
    if (remove) {
      await env.DB.prepare(`DELETE FROM event_reminders WHERE event_id=? AND telegram_id=?`).bind(eventId,Number(auth.user.id)).run();
      return json({ ok: true, removed: true });
    }
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    const value = Number(body?.value);
    const unit = String(body?.unit || 'minutes') === 'hours' ? 'hours' : 'minutes';
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000) return json({ ok: false, error: 'Укажите число от 1 до 10000' }, 400);
    const event = await env.DB.prepare(`SELECT id,title,event_at FROM events WHERE id=? AND active=1 LIMIT 1`).bind(eventId).first();
    if (!event) return json({ ok: false, error: 'Событие не найдено' }, 404);
    const eventAt = Number(event.event_at), remindAt = eventAt - value * (unit === 'hours' ? 3600000 : 60000), now = Date.now();
    if (eventAt <= now || remindAt <= now) return json({ ok: false, error: 'Это время напоминания уже прошло' }, 400);
    const id = crypto.randomUUID();
    try{
      await env.DB.prepare(`INSERT INTO event_reminders(id,event_id,telegram_id,lead_value,lead_unit,remind_at,status,attempts,next_attempt_at,claim_token,created_at,updated_at,sent_at)
        VALUES(?,?,?,?,?,?,'pending',0,0,NULL,?,?,NULL)
        ON CONFLICT(event_id,telegram_id) DO UPDATE SET lead_value=excluded.lead_value,lead_unit=excluded.lead_unit,remind_at=excluded.remind_at,status='pending',attempts=0,next_attempt_at=0,claim_token=NULL,updated_at=excluded.updated_at,sent_at=NULL`)
        .bind(id,eventId,Number(auth.user.id),value,unit,remindAt,now,now).run();
    }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);throw error;}
    const saved = await env.DB.prepare(`SELECT id,lead_value,lead_unit,remind_at,status FROM event_reminders WHERE event_id=? AND telegram_id=?`).bind(eventId,Number(auth.user.id)).first();
    return json({ ok: true, reminder: saved });
  }
  
  async function deliverEventReminders(env, at = Date.now()) {
    await ensureEventsTables(env);
    await ensureUserPreferenceTables(env);
    const now = Number(at || Date.now());
    await env.DB.prepare(`UPDATE event_reminders SET status='expired',claim_token=NULL,updated_at=?
      WHERE status IN ('pending','sending') AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id) AND event_id IN (SELECT id FROM events WHERE active=0 OR event_at<=?)`).bind(now,now).run();
    // Recover stale claims with a delay. A Worker deployment must not cause an immediate retry storm.
    const staleLeaseAt = now - 5 * 60 * 1000;
    const stale = await env.DB.prepare(`SELECT id,attempts FROM event_reminders WHERE status='sending' AND updated_at<? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id) LIMIT 100`).bind(staleLeaseAt).all();
    for (const row of stale.results || []) {
      const attempts = Number(row.attempts || 0) + 1;
      const delay = Math.min(60_000 * (2 ** Math.max(0, attempts - 1)), 30 * 60 * 1000);
      await env.DB.prepare(`UPDATE event_reminders SET status=?,attempts=?,next_attempt_at=?,claim_token=NULL,updated_at=?
        WHERE id=? AND status='sending' AND updated_at<? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(attempts >= 8 ? 'failed' : 'pending',attempts,now+delay,now,row.id,staleLeaseAt).run();
    }
    const due = await env.DB.prepare(`SELECT r.id,r.telegram_id,r.event_id
      FROM event_reminders r JOIN events e ON e.id=r.event_id
      WHERE r.status='pending' AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=r.telegram_id) AND r.remind_at<=? AND r.next_attempt_at<=? AND e.active=1 AND e.event_at>?
      ORDER BY r.remind_at ASC LIMIT 50`).bind(now,now,now).all();
    for (const item of due.results || []) {
      const claimToken = crypto.randomUUID();
      const claim = await env.DB.prepare(`UPDATE event_reminders SET status='sending',claim_token=?,updated_at=?
        WHERE id=? AND status='pending' AND next_attempt_at<=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(claimToken,now,item.id,now).run();
      if (!claim.meta?.changes) continue;
      // Re-read after the atomic claim. Event edits/deletes may have raced with queue discovery.
      const fresh = await env.DB.prepare(`SELECT r.id,r.telegram_id,r.event_id,r.attempts,r.remind_at,
          e.title,e.place,e.coords,e.description,e.event_at,e.active,e.event_timezone,
          t.name AS territory_name,p.timezone AS user_timezone
        FROM event_reminders r JOIN events e ON e.id=r.event_id
        LEFT JOIN territories t ON t.id=e.territory_id
        LEFT JOIN user_preferences p ON p.telegram_id=r.telegram_id
        WHERE r.id=? AND r.status='sending' AND r.claim_token=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=r.telegram_id) LIMIT 1`).bind(item.id,claimToken).first();
      if (!fresh) continue;
      const eventAt = Number(fresh.event_at || 0);
      if (Number(fresh.active) !== 1 || eventAt <= now || Number(fresh.remind_at) > now) {
        await env.DB.prepare(`UPDATE event_reminders SET status=?,claim_token=NULL,updated_at=?
          WHERE id=? AND status='sending' AND claim_token=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(Number(fresh.active) === 1 && eventAt > now ? 'pending' : 'expired',now,item.id,claimToken).run();
        continue;
      }
      const date = formatEventTimeForUser(eventAt, fresh.user_timezone);
      const cleanTitle=stripMinecraftFormatting(fresh.title||'').trim()||'Ивент';
      const placeSource=stripMinecraftFormatting(fresh.territory_name||'').trim()||stripMinecraftFormatting(fresh.place||'').trim();
      const cleanPlace=/^(не указано|место не указано)$/i.test(placeSource)?'':placeSource;
      const rawCoords=stripMinecraftFormatting(fresh.coords||'').trim();
      const cleanCoords=rawCoords?formatTerritoryCoords(rawCoords):'Координаты не указаны';
      const cleanDescription=stripMinecraftFormatting(String(fresh.description||'')).trim().slice(0,2000);
      let text = `🔔 <b>Напоминание об ивенте</b>\n\n<b>${escapeHtml(cleanTitle)}</b>\n\n📅 ${escapeHtml(date)}`;
      if (cleanPlace) text += `\n🏙 ${escapeHtml(cleanPlace)}`;
      text += `\n🧭 ${escapeHtml(cleanCoords)}`;
      if (cleanDescription) text += `\n\n${escapeHtml(cleanDescription)}`;
      try {
        const { response, data } = await telegram(env,'sendMessage',{chat_id:Number(fresh.telegram_id),text,parse_mode:'HTML',disable_web_page_preview:true});
        if (!response.ok || !data?.ok) {
          const status = Number(data?.error_code || response.status || 0);
          const retryAfter = Number(data?.parameters?.retry_after || 0);
          const attempts = Number(fresh.attempts || 0) + 1;
          const permanent = [400,401,403].includes(status) || attempts >= 8;
          const exponentialDelay = Math.min(60_000 * (2 ** Math.max(0, attempts - 1)), 30 * 60 * 1000);
          const delay = retryAfter > 0 ? Math.max(1000,retryAfter * 1000) : exponentialDelay;
          await env.DB.prepare(`UPDATE event_reminders SET status=?,attempts=?,next_attempt_at=?,claim_token=NULL,updated_at=?
            WHERE id=? AND status='sending' AND claim_token=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(permanent?'failed':'pending',attempts,now+delay,now,item.id,claimToken).run();
          console.error(JSON.stringify({event:'event_reminder_send_rejected',reminderId:item.id,attempts,telegramStatus:status,retryAfter:retryAfter||null,code:'TELEGRAM_SEND_FAILED'}));
          continue;
        }
        await env.DB.prepare(`UPDATE event_reminders SET status='sent',sent_at=?,next_attempt_at=0,claim_token=NULL,updated_at=?
          WHERE id=? AND status='sending' AND claim_token=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(now,now,item.id,claimToken).run();
      } catch (error) {
        const attempts = Number(fresh.attempts || 0) + 1;
        const delay = Math.min(60_000 * (2 ** Math.max(0, attempts - 1)), 30 * 60 * 1000);
        await env.DB.prepare(`UPDATE event_reminders SET status=?,attempts=?,next_attempt_at=?,claim_token=NULL,updated_at=?
          WHERE id=? AND status='sending' AND claim_token=? AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=event_reminders.telegram_id)`).bind(attempts>=8?'failed':'pending',attempts,now+delay,now,item.id,claimToken).run();
        console.error(JSON.stringify({event:'event_reminder_send_failed',reminderId:item.id,attempts,code:'TELEGRAM_SEND_FAILED',message:String(error?.message||error).slice(0,180)}));
      }
    }
    return { processed: (due.results || []).length };
  }

  return {
    purgeExpiredEvents,
    getEvents,
    addUtcCalendarMonths,
    eventDateExceedsTwoMonths,
    calculateDiscountedPrice,
    validateEventBody,
    createEvent,
    updateEvent,
    deleteEvent,
    saveEventReminder,
    deliverEventReminders,
  };
}
