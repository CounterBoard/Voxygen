import React, { useEffect, useRef, useState } from 'react';
import {
  Bell, CalendarDays, Check, ChevronDown, ChevronUp, Clock, ExternalLink,
  ImagePlus, MapPin, Pencil, Plus, Sparkles, Trash2,
} from 'lucide-react';
import { API_BASE } from '../../config/api.js';
import { readEventImage } from '../../shared/image-utils.js';
import { EventDateTimeFields } from './DateTimeFields.jsx';
import {
  EVENT_DATE_LIMIT_MESSAGE, addUtcCalendarMonths, defaultEventDateParts,
  eventDateLabel, eventDatePartsFromTimestamp, eventDatePartsTimestamp,
  formatEventCoords, normalizeTimezoneOffset, reminderUnitLabel, sanitizeEventCoords,
} from './date-time.js';

export function EventsScreen({ initData, territories = [], onSelectTerritory, isMainInspector = false, tgUser = null, expandedEventId = null, setExpandedEventId = () => {}, timezoneOffset = 'UTC+3', timezoneReady = true, timezoneLoadError = '', onRetryTimezone = () => {}, ui = {} }) {
  const { MinecraftText, FixedToast, Field, TextAreaField, apiErrorMessage, safeCaughtError, stripMinecraftCodes, readEventImage } = ui;
  const [events, setEvents] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [createExpanded,setCreateExpanded]=useState(false);
  const [drafts, setDrafts] = useState({}), [busyId, setBusyId] = useState(null), [notice, setNotice] = useState(''), [editingEventId,setEditingEventId]=useState(null);
  const [clockNow,setClockNow]=useState(Date.now());
  const eventLoadVersionRef=useRef(0), eventLoadControllerRef=useRef(null);
  async function load() {
    if(document.visibilityState==='hidden')return;
    const requestVersion=++eventLoadVersionRef.current;
    eventLoadControllerRef.current?.abort();
    const controller=new AbortController();
    eventLoadControllerRef.current=controller;
    try {
      setError('');
      const response = await fetch(`${API_BASE}/api/events`, { headers: { 'X-Telegram-Init-Data': initData }, cache: 'no-store', signal:controller.signal });
      const data = await response.json().catch(() => null);
      if(requestVersion!==eventLoadVersionRef.current)return;
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось загрузить ивенты.'));
      const items = (data.events || []).sort((a,b) => Number(a.event_at)-Number(b.event_at));
      setEvents(items);
      setDrafts(prev => {
        const next = { ...prev };
        for (const event of items) if (!next[event.id]) next[event.id] = { value: '', unit: event.reminder?.unit || 'minutes' };
        return next;
      });
    } catch (e) {
      if(requestVersion!==eventLoadVersionRef.current||e?.name==='AbortError')return;
      setError(safeCaughtError(e, 'Не удалось загрузить ивенты.'));
    } finally {
      if(requestVersion===eventLoadVersionRef.current){eventLoadControllerRef.current=null;setLoading(false);}
    }
  }
  useEffect(() => {
    load();
    const timer=setInterval(load,60000);
    const onVisible=()=>{
      if(document.visibilityState==='visible')load();
      else{eventLoadVersionRef.current+=1;eventLoadControllerRef.current?.abort();eventLoadControllerRef.current=null;}
    };
    document.addEventListener('visibilitychange',onVisible);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);eventLoadVersionRef.current+=1;eventLoadControllerRef.current?.abort();eventLoadControllerRef.current=null;};
  }, [initData]);
  useEffect(() => {
    const tick=()=>setClockNow(Date.now());
    const onVisible=()=>{if(document.visibilityState==='visible')tick();};
    const timer=setInterval(tick,15000);
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  }, []);
  function updateDraft(id, patch) { setDrafts(prev => ({ ...prev, [id]: { value: prev[id]?.value ?? '', unit: prev[id]?.unit ?? 'minutes', ...patch } })); }
  async function saveReminder(event) {
    const draft = drafts[event.id] || { value: '', unit: 'minutes' };
    const value = Number(draft.value);
    if (!Number.isSafeInteger(value) || value < 1) { setError('Введите положительное число для напоминания.'); return; }
    try {
      setBusyId(event.id); setError(''); setNotice('');
      const response = await fetch(`${API_BASE}/api/events/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ initData, eventId: event.id, value, unit: draft.unit }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось сохранить напоминание.'));
      setEvents(prev => prev.map(item => item.id === event.id ? { ...item, reminder: data.reminder ? { id:data.reminder.id, value:Number(data.reminder.lead_value ?? data.reminder.value), unit:data.reminder.lead_unit ?? data.reminder.unit, remind_at:Number(data.reminder.remind_at), status:data.reminder.status } : item.reminder } : item));
      setDrafts(prev=>({...prev,[event.id]:{value:'',unit:draft.unit||'minutes'}}));
      setNotice('Напоминание сохранено');
    } catch (e) { const message=safeCaughtError(e, 'Не удалось сохранить напоминание.'); if (/это время напоминания уже прошло/i.test(message)) { setError(''); setNotice('Это время напоминания уже прошло'); } else setError(message); }
    finally { setBusyId(null); }
  }
  async function removeReminder(event) {
    try {
      setBusyId(event.id); setError('');
      const response = await fetch(`${API_BASE}/api/events/reminder`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ initData, eventId:event.id }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось удалить напоминание.'));
      setEvents(prev => prev.map(item => item.id===event.id ? { ...item, reminder:null } : item));
      setDrafts(prev=>({...prev,[event.id]:{value:'',unit:'minutes'}})); setNotice('Напоминание удалено');
    } catch (e) { setError(safeCaughtError(e, 'Не удалось удалить напоминание.')); }
    finally { setBusyId(null); }
  }
  const coords = value => { const raw=String(value||'').trim(); if(/§(?:x(?:§[0-9a-fA-F]){6}|#[0-9a-fA-F]{6}|[0-9a-fK-OrR])/i.test(raw))return raw.replace(/\s*\/\s*/g,' / '); return raw.replace(/\b[ZX]\s*[:=]?\s*/gi,'').replace(/\s*\/\s*/g,' / ').trim().replace(/^[:/ ]+|[:/ ]+$/g,''); };
  const openEventPage = url => {
    if (!url) return;
    try { if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
  };
  const recentWindowStart=clockNow-24*60*60*1000;
  const visibleEvents=events.filter(event=>Number(event.event_at)>recentWindowStart);
  const upcomingEvents=visibleEvents.filter(event=>Number(event.event_at)>clockNow).sort((a,b)=>Number(a.event_at)-Number(b.event_at));
  const pastEvents=visibleEvents.filter(event=>Number(event.event_at)<=clockNow).sort((a,b)=>Number(b.event_at)-Number(a.event_at));
  function renderEventCard(event,isPast=false) {
    const open = expandedEventId===event.id, draft = drafts[event.id] || { value:'', unit:event.reminder?.unit||'minutes' }, busy=busyId===event.id;
    const rawPlace = event.territory_name || event.place || '';
    const place = /^(не указано|место не указано)$/i.test(stripMinecraftCodes(String(rawPlace)).trim()) ? '' : String(rawPlace).trim();
    const hasPlace = Boolean(place);
    const eventCoords = coords(event.coords);
    const reminderLabel = event.reminder?.status==='sent' ? 'Напоминание уже отправлено' : event.reminder ? `Напомнить за ${event.reminder.value} ${reminderUnitLabel(event.reminder.value,event.reminder.unit)}` : '';
    const isCreator = Number(tgUser?.id||0)>0 && Number(event.created_by||0)===Number(tgUser.id);
    return <div key={`${isPast?'past':'upcoming'}-${event.id}`} className="atlas-recruitment-card" style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,overflow:'hidden',opacity:isPast ? .94 : 1}}>
      <button onClick={()=>setExpandedEventId(open?null:event.id)} className="press" aria-expanded={open} style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap: 12,padding: '12px 12px',border:0,background:'transparent',color:'var(--theme-color-text-primary)'}}>
        {event.image_data ? <img src={event.image_data} alt="" style={{width:64,height:64,objectFit:'cover',borderRadius:11,flexShrink:0,background:'var(--theme-color-surface-raised)'}}/> : <div style={{width:64,height:64,borderRadius:11,background:'var(--theme-color-surface-raised)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Sparkles size={22} color="var(--theme-color-action-primary)"/></div>}
        <div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={event.title} className="atlas-display" style={{fontSize:16,fontWeight:800,lineHeight:1.25,marginBottom: 6}}/>{hasPlace&&<div style={{display:'flex',alignItems:'center',gap: 4,color:'var(--theme-color-text-muted)',fontSize:12,marginBottom: 4}}><MapPin size={12}/><MinecraftText text={place} style={{fontSize:12,overflowWrap:'anywhere'}}/></div>}<div style={{display:'flex',alignItems:'center',gap: 4,color:isPast?'var(--theme-color-text-muted)':'var(--theme-color-action-primary)',fontSize:12,fontWeight:700}}><Clock size={12}/>{eventDateLabel(event.event_at, timezoneOffset)}</div><div style={{fontSize:11,color:'var(--theme-color-text-muted)',marginTop: 4}}>{eventCoords?<>Координаты: <MinecraftText text={eventCoords}/></>:'Координаты не указаны'}</div>{!isPast&&event.reminder&&<div style={{fontSize:10.5,color:event.reminder.status==='sent'?'var(--theme-color-status-success)':'var(--theme-color-text-muted)',marginTop: 4}}>{reminderLabel}</div>}</div>
        <span style={{fontSize:19,color:'var(--theme-color-text-muted)',padding: '0 3px'}}>{open?'−':'+'}</span>
      </button>
      {open && <div style={{padding: '0 12px 12px'}}>
        {event.image_data && <img src={event.image_data} alt={`Ивент: ${event.title}`} style={{display:'block',width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12,margin: '0 0 12px'}}/>}
        {event.description && <MinecraftText as="div" text={event.description} style={{fontSize:13.5,lineHeight:1.55,marginBottom: 12,whiteSpace:'pre-wrap'}}/>}
        {!isPast && <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:13,padding: 10,marginBottom: 8}}>
          <div style={{display:'flex',alignItems:'center',gap: 6,fontSize:13,fontWeight:800,marginBottom: 8}}><Bell size={15} color="var(--theme-color-action-primary)"/>Напомнить об ивенте за</div>
          {event.reminder && <div style={{fontSize:12,color:'var(--theme-color-status-success)',marginBottom: 8}}>Текущая настройка: за {event.reminder.value} {reminderUnitLabel(event.reminder.value,event.reminder.unit)} до начала{event.reminder.status==='sent'?' · уже отправлено':''}.</div>}
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.1fr)',gap: 8,marginBottom: 8}}>
            <input value={draft.value} onChange={e=>updateDraft(event.id,{value:e.target.value.replace(/\D/g,'')})} inputMode="numeric" placeholder="Количество" style={{minWidth:0,width:'100%',boxSizing:'border-box',minHeight:44,background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-control)',padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:14}}/>
            <div className="event-reminder-unit-switch" style={{display:'flex',minHeight:44,padding:0,borderRadius:'var(--theme-radius-control)',overflow:'hidden',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',gap:0}}>{[{value:'minutes',label:reminderUnitLabel(draft.value,'minutes')},{value:'hours',label:reminderUnitLabel(draft.value,'hours')}].map(unit=><button key={unit.value} type="button" onClick={()=>updateDraft(event.id,{unit:unit.value})} className="press event-reminder-unit-option" style={{flex:'1 1 50%',minWidth:0,minHeight:42,padding:0,border:0,borderRadius:0,background:draft.unit===unit.value?'var(--theme-color-action-primary)':'var(--theme-color-surface-raised)',color:draft.unit===unit.value?'var(--theme-color-action-primary-contrast)':'var(--theme-color-text-muted)',fontSize:12,fontWeight:700}}>{unit.label}</button>)}</div>
          </div>
          <button onClick={()=>saveReminder(event)} disabled={busy} className="press" style={{width:'100%',border:0,borderRadius:'var(--theme-radius-control)',padding: '10px 12px',minHeight:44,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800}}>{busy?'Сохранение…':event.reminder?'Сохранить изменения':'Подтвердить напоминание'}</button>
          {event.reminder && <button onClick={()=>removeReminder(event)} disabled={busy} className="press" style={{width:'100%',marginTop: 6,border:'1px solid var(--theme-color-status-danger-border)',borderRadius:10,padding: '8px 12px',minHeight:44,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',fontWeight:800}}>Удалить напоминание</button>}
        </div>}
        <div style={{display:'flex',flexDirection:'column',gap: 8}}>
          {event.page_url && <button onClick={()=>openEventPage(event.page_url)} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap: 6,border:0,borderRadius:11,padding: '11px',minHeight:44,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800}}><ExternalLink size={15}/>Перейти на страницу ивента</button>}
          {!isPast && isCreator && (editingEventId===event.id
            ? <EventInlineEditor ui={ui} key={event.id} initData={initData} event={event} territories={territories} tgUser={tgUser} isMainInspector={isMainInspector} timezoneOffset={timezoneOffset} onCancel={()=>setEditingEventId(null)} onSaved={async()=>{setEditingEventId(null);setNotice('Ивент обновлён');await load();}} onDeleted={()=>{setEvents(prev=>prev.filter(item=>item.id!==event.id));setEditingEventId(null);setExpandedEventId(null);setNotice('Ивент удалён');}}/>
            : <button onClick={()=>setEditingEventId(event.id)} disabled={!timezoneReady} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap: 6,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,padding: '11px',minHeight:44,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800,opacity:timezoneReady?1:.55}}><Pencil size={15}/>Редактировать</button>)}
          {event.territory_id && territories.some(city=>String(city.id)===String(event.territory_id)) && <button onClick={()=>onSelectTerritory?.(event.territory_id)} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap: 6,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,padding: '11px',minHeight:44,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800}}>Перейти на страницу территории</button>}
        </div>
      </div>}
    </div>;
  }
  return <div className="atlas-page atlas-page--events" style={{ padding: '15px 15px 100px' }}>
    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:15,overflow:'hidden',marginTop: 0,marginBottom: 8}}>
      {!timezoneReady&&<div role="status" style={{padding: '8px 12px',borderBottom:'1px solid var(--theme-color-border)',fontSize:11.5,color:timezoneLoadError?'var(--theme-color-status-danger)':'var(--theme-color-text-muted)'}}>{timezoneLoadError||'Подготавливаются настройки времени…'}{timezoneLoadError&&<button type="button" onClick={onRetryTimezone} className="press" style={{marginLeft: 8,border:0,background:'transparent',color:'var(--theme-color-action-primary)',fontWeight:800}}>Повторить</button>}</div>}
      <button type="button" aria-expanded={createExpanded} disabled={!timezoneReady} onClick={()=>setCreateExpanded(value=>!value)} className="press" style={{width:'100%',minHeight:58,display:'flex',alignItems:'center',gap: 10,padding: '12px 15px',border:0,background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',textAlign:'left',opacity:timezoneReady?1:.55}}>
        <span style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',flexShrink:0}}><Plus size={19}/></span>
        <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:800}}>Создать ивент</span>
        {createExpanded?<ChevronUp size={18} color="var(--theme-color-action-primary)"/>:<ChevronDown size={18} color="var(--theme-color-action-primary)"/>}
      </button>
      {createExpanded&&<div style={{borderTop:'1px solid var(--theme-color-border)',padding: '0 12px 12px'}}><ProfileEventCreateForm ui={ui} embedded initData={initData} territories={territories} isMainInspector={isMainInspector} tgUser={tgUser} timezoneOffset={timezoneOffset} onPublished={load}/></div>}
    </div>
    <div style={{ display:'flex', alignItems:'center', gap: 8, margin: '0 0 8px' }}><CalendarDays size={18} color="var(--theme-color-action-primary)"/><div className="atlas-display" style={{fontSize:19,fontWeight:800}}>Ближайшие ивенты</div><span style={{marginLeft: 'auto',fontSize:12,color:'var(--theme-color-text-muted)'}}>{upcomingEvents.length}</span></div>
    {!loading && !upcomingEvents.length && <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 18,color:'var(--theme-color-text-muted)',fontSize:13,lineHeight:1.5}}>Предстоящих ивентов пока нет.</div>}
    {upcomingEvents.length>0 && <div style={{display:'flex',flexDirection:'column',gap: 8}}>{upcomingEvents.map(event=>renderEventCard(event,false))}</div>}
    {pastEvents.length>0 && <section style={{marginTop: 8}}><div style={{display:'flex',alignItems:'center',gap: 8,margin: '0 0 8px'}}><Check size={18} color="var(--theme-color-text-muted)"/><div className="atlas-display" style={{fontSize:19,fontWeight:800}}>Прошедшие ивенты</div><span style={{marginLeft: 'auto',fontSize:12,color:'var(--theme-color-text-muted)'}}>{pastEvents.length}</span></div><div style={{display:'flex',flexDirection:'column',gap: 8}}>{pastEvents.map(event=>renderEventCard(event,true))}</div></section>}
    {error && <div role="status" style={{marginTop: 10,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-status-danger)',borderRadius:12,padding: 10,color:'var(--theme-color-status-danger)',fontSize:12.5}}>{error}<button onClick={load} className="press" style={{marginLeft: 8,border:0,background:'transparent',color:'var(--theme-color-action-primary)',fontWeight:800}}>Повторить</button></div>}
    {notice && <FixedToast key={notice} message={notice} type={notice==='Это время напоминания уже прошло'?'warning':null}/>}
    {isMainInspector && <div style={{marginTop: 0}}><EventManagementPanel ui={ui} initData={initData} territories={territories} timezoneOffset={timezoneOffset} timezoneReady={timezoneReady}/></div>}
  </div>;
}

function ProfileEventCreateForm({ initData, territories = [], isMainInspector = false, tgUser = null, embedded = false, timezoneOffset = 'UTC+3', onPublished = () => {}, ui = {} }) {
  const { MinecraftText, FixedToast, Field, TextAreaField, apiErrorMessage, safeCaughtError, stripMinecraftCodes, readEventImage } = ui;
  const userId=String(tgUser?.id||'');
  const eventInputTimezone=normalizeTimezoneOffset(timezoneOffset);
  const creationWindowStartedAt=useRef(Date.now());
  const draftStorageKey=`voxygen:event-create-draft:${userId||'anonymous'}`;
  const [restoredDraft]=useState(()=>{try{const raw=localStorage.getItem(draftStorageKey);const value=raw?JSON.parse(raw):null;return value&&typeof value==='object'?value:null;}catch{return null;}});
  const userTerritories=(territories||[]).filter(city=>isMainInspector || String(city.owner_telegram_id||'')===userId || (Array.isArray(city.manager_telegram_ids)&&city.manager_telegram_ids.map(String).includes(userId)) || (Array.isArray(city.resident_telegram_ids)&&city.resident_telegram_ids.map(String).includes(userId)));
  const selectable=userTerritories.filter(city=>city&&!Number(city.is_government||0)&&city.status!=='pending');
  const [placeId,setPlaceId]=useState(()=>String(restoredDraft?.placeId||''));
  const [dateParts,setDateParts]=useState(()=>restoredDraft?.dateParts||defaultEventDateParts(eventInputTimezone));
  const [dateEdited,setDateEdited]=useState(()=>Boolean(restoredDraft?.dateEdited));
  const dateTimezoneRef=useRef(eventInputTimezone);
  const [form,setForm]=useState(()=>{
    const defaults={title:'',coords:'',description:'',imageData:null,requestKey:null,requestAttempted:false};
    if(!restoredDraft?.form||typeof restoredDraft.form!=='object')return defaults;
    const saved=restoredDraft.form;
    return {...defaults,...saved,requestAttempted:typeof saved.requestAttempted==='boolean'?saved.requestAttempted:Boolean(saved.requestKey)};
  });
  const [busy,setBusy]=useState(false),[imageBusy,setImageBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(restoredDraft?'Черновик ивента восстановлен после перезапуска.':''),[dateLimitToast,setDateLimitToast]=useState(0);
  const fileRef=useRef(null);
  useEffect(()=>{
    if(dateTimezoneRef.current!==eventInputTimezone){
      if(!dateEdited)setDateParts(defaultEventDateParts(eventInputTimezone));
      dateTimezoneRef.current=eventInputTimezone;
    }
  },[eventInputTimezone,dateEdited]);
  const selectedPlace=selectable.find(city=>String(city.id)===String(placeId))||null;
  useEffect(()=>{
    const hasContent=Boolean(String(form.title||'').trim()||String(form.coords||'').trim()||String(form.description||'').trim()||form.imageData||placeId||dateEdited);
    if(!hasContent){try{localStorage.removeItem(draftStorageKey);}catch{}return;}
    const draft={form,placeId,dateParts,dateEdited,savedAt:Date.now()};
    try{localStorage.setItem(draftStorageKey,JSON.stringify(draft));}
    catch{try{localStorage.setItem(draftStorageKey,JSON.stringify({...draft,form:{...form,imageData:null}}));}catch{}}
  },[draftStorageKey,form,placeId,dateParts,dateEdited]);
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:44,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:11,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginTop: 4};
  function ensureRequestKey(){return form.requestKey||(window.crypto?.randomUUID?.()||`vox-event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);}
  function patch(key,value){if(busy)return;setForm(v=>({...v,[key]:value,requestKey:v.requestAttempted?null:v.requestKey,requestAttempted:false}));}
  function choosePlace(id){if(busy)return;const city=selectable.find(item=>String(item.id)===String(id));setPlaceId(city?String(city.id):'');patch('coords',formatEventCoords(city?.coords||''));setError('');}
  async function chooseImage(event){const input=event.currentTarget,file=input.files?.[0];if(!file){patch('imageData',null);return;}try{setImageBusy(true);setError('');setNotice('');patch('imageData',await readEventImage(file));}catch(e){input.value='';patch('imageData',null);setError(safeCaughtError(e,'Не удалось подготовить изображение.'));}finally{setImageBusy(false);}}
  async function publish(){
    const title=String(form.title||'').trim(),eventAt=eventDatePartsTimestamp(dateParts, eventInputTimezone);
    if(!title||!eventAt){setError('Укажите название, дату и время начала.');return;}
    if(eventAt<=Date.now()){setError('Выберите дату и время в будущем.');return;}
    if(eventAt>addUtcCalendarMonths(creationWindowStartedAt.current,2)){setDateLimitToast(value=>value+1);return;}
    try{
      setBusy(true);setError('');setNotice('');
      const requestKey=ensureRequestKey();
      const attemptedForm={...form,requestKey,requestAttempted:true};
      setForm(attemptedForm);
      const payload={initData,requestKey,title,territoryId:selectedPlace?String(selectedPlace.id):null,place:selectedPlace?String(selectedPlace.name||''):'Не указано',eventAt,eventTimezone:eventInputTimezone,coords:formatEventCoords(form.coords),description:String(form.description||'').trim(),imageData:form.imageData||null};
      try{localStorage.setItem(draftStorageKey,JSON.stringify({form:attemptedForm,placeId,dateParts,dateEdited,savedAt:Date.now()}));}catch{}
      const response=await fetch(`${API_BASE}/api/events`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось опубликовать ивент.'));
      try{localStorage.removeItem(draftStorageKey);}catch{}
      setForm({title:'',coords:'',description:'',imageData:null,requestKey:null,requestAttempted:false});setPlaceId('');setDateParts(defaultEventDateParts(eventInputTimezone));setDateEdited(false);if(fileRef.current)fileRef.current.value='';setNotice(data?.replayed?'Ивент уже был создан ранее. Повтор не создал копию.':'Ивент создан');await onPublished?.(data);
    }catch(e){const message=safeCaughtError(e,'Не удалось опубликовать ивент.');if(message===EVENT_DATE_LIMIT_MESSAGE)setDateLimitToast(value=>value+1);else setError(message);}finally{setBusy(false);}
  }
  const selectBtn=(active)=>({display:'flex',alignItems:'center',gap: 6,minHeight:42,maxWidth:'100%',border:active?'1px solid var(--theme-color-action-primary)':'1px solid var(--theme-color-border)',borderRadius:11,padding: '8px 11px',background:active?'var(--theme-color-action-primary-soft)':'var(--theme-color-surface-raised)',color:active?'var(--theme-color-action-primary)':'var(--theme-color-text-primary)',fontSize:12.5,fontWeight:750,textAlign:'left'});
  return <section style={{marginTop: embedded?8:18,marginBottom: embedded?0:20,padding: embedded?0:15,background:embedded?'transparent':'var(--theme-color-surface)',border:embedded?'none':'1px solid var(--theme-color-border)',borderRadius:embedded?0:17,boxShadow:embedded?'none':'var(--theme-shadow-low)'}}>
    {!embedded&&<div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 12}}><div style={{width:40,height:40,borderRadius:12,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Plus size={20}/></div><div className="atlas-display" style={{fontSize:17,fontWeight:800,lineHeight:1.2}}>Создать ивент</div></div>}
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750}}>Название</label>
    <Field value={form.title} onChange={e=>patch('title',e.target.value)} maxLength={160} placeholder="Название ивента" containerStyle={{marginBottom:0}} style={inputStyle}/>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12,marginBottom: 4}}>Место проведения</div>
    <div style={{display:'flex',flexWrap:'wrap',gap: 6}}>
      <button type="button" aria-pressed={!selectedPlace} onClick={()=>choosePlace('')} className="press" style={selectBtn(!selectedPlace)}>{!selectedPlace?<Check size={14}/>:<MapPin size={14} color="var(--theme-color-text-muted)"/>}Не указано</button>
      {selectable.map(city=>{const active=String(placeId)===String(city.id);return <button type="button" key={city.id} aria-pressed={active} onClick={()=>choosePlace(city.id)} className="press" style={selectBtn(active)}>{active?<Check size={14}/>:<MapPin size={14} color="var(--theme-color-text-muted)"/>}<MinecraftText text={city.name} style={{minWidth:0}}/></button>;})}
    </div>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Дата и время начала</label>
    <EventDateTimeFields parts={dateParts} onChange={parts=>{if(busy)return;setDateParts(parts);setDateEdited(true);setForm(v=>({...v,requestKey:v.requestAttempted?null:v.requestKey,requestAttempted:false}));}}/>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Координаты</label>
    <input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Описание</label>
    <TextAreaField value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder="Расскажите о событии" className="atlas-event-description-field" containerStyle={{marginBottom:0}} style={{...inputStyle,minHeight:104,resize:'none'}}/>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Обложка</label>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/>
    <button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 8,width:'100%',minHeight:46,marginTop: 4,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800,fontSize:13}}><ImagePlus size={17}/>Выбрать файл</button>
    {fileRef.current?.files?.[0]?.name&&<div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginTop: 6,overflowWrap:'anywhere'}}>{fileRef.current.files[0].name}</div>}
    {form.imageData&&<div style={{marginTop: 8}}><img src={form.imageData} alt="Предпросмотр обложки" style={{display:'block',width:'100%',maxHeight:180,objectFit:'cover',borderRadius:12}}/><button type="button" onClick={()=>{patch('imageData',null);if(fileRef.current)fileRef.current.value='';}} className="press" style={{minHeight:40,border:0,background:'transparent',color:'var(--theme-color-status-danger)',padding: '6px 0',fontWeight:750}}>Убрать обложку</button></div>}
    <button onClick={publish} disabled={busy||imageBusy} className="press event-publish-button" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap: 8,minHeight:47,marginTop: 12,border:0,borderRadius:11,padding: '12px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800,fontSize:14,opacity:1,filter:'none'}}><CalendarDays size={17}/>{busy?'Публикация…':'Опубликовать ивент'}</button>
    {error&&<div role="alert" style={{marginTop: 8,border:'1px solid var(--theme-color-status-danger-border)',background:'var(--theme-color-status-danger-soft)',borderRadius:10,padding: 10,fontSize:12.5,color:'var(--theme-color-status-danger)'}}>{error}</div>}
    {notice&&<FixedToast key={notice} message={notice}/>}
     {dateLimitToast>0&&<FixedToast key={dateLimitToast} message={EVENT_DATE_LIMIT_MESSAGE} type="error"/>}
  </section>;
}


function EventInlineEditor({ initData, event, territories = [], tgUser = null, isMainInspector = false, timezoneOffset = 'UTC+3', onCancel, onSaved, onDeleted, ui = {} }) {
  const { MinecraftText, FixedToast, Field, TextAreaField, apiErrorMessage, safeCaughtError, stripMinecraftCodes, readEventImage } = ui;
  const userId=String(tgUser?.id||'');
  const selectable=(territories||[]).filter(city=>city&&(isMainInspector||!Number(city.is_government||0))&&city.status!=='pending'&&(
    isMainInspector || String(city.id)===String(event.territory_id||'') ||
    String(city.owner_telegram_id||'')===userId ||
    (Array.isArray(city.manager_telegram_ids)&&city.manager_telegram_ids.map(String).includes(userId)) ||
    (Array.isArray(city.resident_telegram_ids)&&city.resident_telegram_ids.map(String).includes(userId))
  ));
  const [form,setForm]=useState(()=>({title:event.title||'',territoryId:String(event.territory_id||''),coords:formatEventCoords(event.coords||''),description:String(event.description||'').slice(0,542),imageData:event.image_data||null,dateParts:eventDatePartsFromTimestamp(event.event_at,timezoneOffset),dateChanged:false,editorTimezone:normalizeTimezoneOffset(timezoneOffset)}));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dateLimitToast,setDateLimitToast]=useState(0);
  const editWindowStartedAt=useRef(Date.now());
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:43,background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '8px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginTop: 4};
  function patch(key,value){setForm(v=>({...v,[key]:value}));}
  async function chooseImage(e){const input=e.currentTarget,file=input.files?.[0];if(!file)return;try{patch('imageData',await readEventImage(file));setError('');}catch(err){input.value='';setError(safeCaughtError(err,'Не удалось подготовить изображение.'));}}
  async function save(){
    const title=String(form.title||'').trim(),eventAt=form.dateChanged?eventDatePartsTimestamp(form.dateParts,form.editorTimezone||timezoneOffset):Number(event.event_at);
    if(!title||title.length>160||!Number.isSafeInteger(eventAt)){setError('Укажите название, дату и время ивента.');return;}
    if(form.dateChanged&&eventAt<=Date.now()){setError('Выберите дату и время в будущем.');return;}
    if(form.dateChanged&&eventAt>addUtcCalendarMonths(editWindowStartedAt.current,2)){setDateLimitToast(value=>value+1);return;}
    const city=selectable.find(t=>String(t.id)===String(form.territoryId));
    if(form.territoryId&&!city){setError('Выберите доступную территорию или «Не указано».');return;}
    try{
      setBusy(true);setError('');
      const body={initData,id:event.id,title,territoryId:city?String(city.id):null,place:city?String(city.name||''):'Не указано',eventAt,eventTimezone:form.dateChanged?(form.editorTimezone||timezoneOffset):(event.event_timezone||'UTC'),coords:formatEventCoords(form.coords),description:String(form.description||'').trim().slice(0,542),imageData:form.imageData||null};
      const response=await fetch(`${API_BASE}/api/events`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(body)});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить ивент.'));
      onSaved?.();
    }catch(err){const message=safeCaughtError(err,'Не удалось сохранить ивент.');if(message===EVENT_DATE_LIMIT_MESSAGE)setDateLimitToast(value=>value+1);else setError(message);}finally{setBusy(false);}
  }
  async function removeEvent(){
    if(!window.confirm(`Удалить ивент «${event.title}»?`))return;
    try{setBusy(true);setError('');const response=await fetch(`${API_BASE}/api/events`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,id:event.id})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось удалить ивент.'));onDeleted?.();}
    catch(err){setError(safeCaughtError(err,'Не удалось удалить ивент.'));}finally{setBusy(false);}
  }
  return <div style={{border:'1px solid var(--theme-color-action-primary-border)',background:'var(--theme-color-surface-raised)',borderRadius:13,padding: 10,marginBottom: 8}}>
    <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 8}}><div style={{fontSize:13,fontWeight:800,flex:1,minWidth:0}}>Редактировать ивент</div><button type="button" onClick={removeEvent} disabled={busy} title="Удалить ивент" aria-label="Удалить ивент" className="press" style={{width:36,height:36,flex:'0 0 auto',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--theme-color-status-danger-border)',borderRadius:10,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)'}}><Trash2 size={15}/></button></div>
    <label style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700}}>Название</label><Field value={form.title} onChange={e=>patch('title',e.target.value.slice(0,160))} maxLength={160} containerStyle={{marginBottom:0}} style={inputStyle}/>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12,marginBottom: 4}}>Место проведения</div>
    <div style={{display:'flex',flexWrap:'wrap',gap: 6}}><button type="button" onClick={()=>patch('territoryId','')} className="press" style={{...eventManagePlaceStyle(!form.territoryId),minHeight:40}}>Не указано</button>{selectable.map(city=><button key={city.id} type="button" onClick={()=>patch('territoryId',String(city.id))} className="press" style={{...eventManagePlaceStyle(String(form.territoryId)===String(city.id)),minHeight:40}}><MinecraftText text={city.name}/></button>)}</div>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Дата и время начала</label><EventDateTimeFields parts={form.dateParts} onChange={parts=>setForm(v=>({...v,dateParts:parts,dateChanged:true}))}/>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Координаты</label><input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:750,marginTop: 12}}>Описание</label><textarea value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder="Расскажите о событии" className="atlas-event-description-field" style={{...inputStyle,resize:'none',minHeight:95}}/>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/><button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 6,width:'100%',minHeight:42,marginTop: 4,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:10,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800}}><ImagePlus size={16}/>Изменить обложку</button>{form.imageData&&<div style={{marginTop: 8}}><img src={form.imageData} alt="Обложка" style={{display:'block',width:'100%',maxHeight:150,objectFit:'cover',borderRadius:10}}/><button type="button" onClick={()=>patch('imageData',null)} className="press" style={{border:0,background:'transparent',color:'var(--theme-color-status-danger)',padding: '8px 0',fontWeight:700}}>Убрать обложку</button></div>}
    {error&&<div role="alert" style={{border:'1px solid var(--theme-color-status-danger-border)',background:'var(--theme-color-status-danger-soft)',borderRadius:10,padding: 8,marginTop: 8,fontSize:12,color:'var(--theme-color-status-danger)'}}>{error}</div>}
    {dateLimitToast>0&&<FixedToast key={dateLimitToast} message={EVENT_DATE_LIMIT_MESSAGE} type="error"/>}
    <div style={{display:'flex',gap: 8,marginTop: 12}}><button onClick={save} disabled={busy||!form.title.trim()} className="press" style={{flex:1,border:0,borderRadius:10,minHeight:42,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800}}>Сохранить</button><button onClick={onCancel} disabled={busy} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '0 12px',background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Отмена</button></div>
  </div>;
}

function EventManagementPanel({ initData, territories = [], timezoneOffset = 'UTC+3', timezoneReady = true, ui = {} }) {
  const { MinecraftText, FixedToast, Field, TextAreaField, apiErrorMessage, safeCaughtError, stripMinecraftCodes, readEventImage } = ui;
  const [events,setEvents]=useState([]),[editingId,setEditingId]=useState(null),[form,setForm]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dateLimitToast,setDateLimitToast]=useState(0);
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:43,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '8px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginTop: 4};
  async function load(){try{setLoading(true);setError('');const r=await fetch(`${API_BASE}/api/events?manage=1`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось загрузить события.'));setEvents(d.events||[]);}catch(e){setError(safeCaughtError(e,'Не удалось загрузить события.'));}finally{setLoading(false);}}
  useEffect(()=>{if(initData)load();},[initData]);
  function startEdit(event){if(Number(event.event_at)<=Date.now()){setError('Прошедшие ивенты нельзя редактировать.');return;}setEditingId(event.id);setForm({title:event.title||'',territoryId:String(event.territory_id||''),legacyPlace:event.place||'',coords:formatEventCoords(event.coords||''),description:event.description||'',imageData:event.image_data||null,dateParts:eventDatePartsFromTimestamp(event.event_at,timezoneOffset),dateChanged:false,eventAtOriginal:Number(event.event_at),eventTimezoneOriginal:event.event_timezone||'UTC',editorTimezone:normalizeTimezoneOffset(timezoneOffset),dateWindowStartedAt:Date.now()});setError('');setNotice('');}
  function patch(key,value){setForm(v=>v?({...v,[key]:value}):v);}
  function cancelEdit(){setEditingId(null);setForm(null);if(fileRef.current)fileRef.current.value='';}
  async function chooseImage(event){const input=event.currentTarget,file=input.files?.[0];if(!file)return;try{patch('imageData',await readEventImage(file));}catch(e){input.value='';setError(safeCaughtError(e,'Не удалось подготовить изображение.'));}}
  async function save(){if(!form)return;const title=String(form.title||'').trim();const eventAt=form.dateChanged?eventDatePartsTimestamp(form.dateParts,form.editorTimezone||timezoneOffset):Number(form.eventAtOriginal);if(!title||!Number.isSafeInteger(eventAt)){setError('Укажите название, дату и время ивента.');return;}if(form.dateChanged&&eventAt<=Date.now()){setError('Выберите дату и время в будущем.');return;}if(form.dateChanged&&eventAt>addUtcCalendarMonths(form.dateWindowStartedAt||Date.now(),2)){setDateLimitToast(value=>value+1);return;}const city=territories.find(t=>String(t.id)===String(form.territoryId));const place=city?String(city.name||''):String(form.legacyPlace||'Не указано');try{setBusy(true);setError('');setNotice('');const body={initData,id:editingId,title,territoryId:city?String(city.id):null,place,eventAt,eventTimezone:form.dateChanged?(form.editorTimezone||timezoneOffset):(form.eventTimezoneOriginal||'UTC'),coords:formatEventCoords(form.coords),description:String(form.description||'').trim(),imageData:form.imageData||null};const r=await fetch(`${API_BASE}/api/events`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(body)}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось сохранить ивент.'));setNotice('Ивент обновлён');cancelEdit();await load();}catch(e){const message=safeCaughtError(e,'Не удалось сохранить ивент.');if(message===EVENT_DATE_LIMIT_MESSAGE)setDateLimitToast(value=>value+1);else setError(message);}finally{setBusy(false);}}
  async function remove(event){if(!window.confirm(`Удалить ивент «${event.title}»?`))return;try{setBusy(true);setError('');const r=await fetch(`${API_BASE}/api/events`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,id:event.id})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось удалить ивент.'));if(editingId===event.id)cancelEdit();setNotice('Ивент удалён');await load();}catch(e){setError(safeCaughtError(e,'Не удалось удалить ивент.'));}finally{setBusy(false);}}
  return <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 10,marginTop: 8,marginBottom: 8}}>
    <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 8}}><CalendarDays size={17} color="var(--theme-color-action-primary)"/><div className="atlas-display" style={{fontSize:16,fontWeight:800}}>Управление ивентами</div><span style={{marginLeft: 'auto',fontSize:11,color:'var(--theme-color-text-muted)'}}>{events.length}</span></div>
    {loading&&!events.length?null:!events.length?<div style={{fontSize:12,color:'var(--theme-color-text-muted)'}}>Опубликованных ивентов нет.</div>:events.map(event=><div key={event.id} style={{display:'flex',alignItems:'center',gap: 8,padding: '8px 0',borderBottom:'1px solid var(--theme-color-border)'}}><div style={{flex:1,minWidth:0}}><MinecraftText text={event.title} as="div" style={{fontSize:13,fontWeight:750}}/><div style={{fontSize:11,color:'var(--theme-color-text-muted)',marginTop: 3}}>{eventDateLabel(event.event_at,timezoneOffset)}</div></div>{Number(event.event_at)>Date.now()&&<button onClick={()=>startEdit(event)} disabled={!timezoneReady} className="press" style={{border:'1px solid var(--theme-color-action-primary-border)',borderRadius:9,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',padding: 8,minWidth:42,minHeight:42,opacity:timezoneReady?1:.55}} title="Изменить"><Pencil size={14}/></button>}<button onClick={()=>remove(event)} disabled={busy} className="press" style={{border:'1px solid var(--theme-color-status-danger-border)',borderRadius:9,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',padding: 8,minWidth:42,minHeight:42}} title="Удалить"><Trash2 size={14}/></button></div>)}
    {form&&<div style={{borderTop:'1px solid var(--theme-color-border)',marginTop: 12,paddingTop: 12}}><div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 8}}><div style={{fontSize:13,fontWeight:800,flex:1,minWidth:0}}>Редактировать ивент</div><button type="button" onClick={()=>{const event=events.find(item=>String(item.id)===String(editingId));if(event)remove(event);}} disabled={busy} title="Удалить ивент" aria-label="Удалить ивент" className="press" style={{width:36,height:36,flex:'0 0 auto',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--theme-color-status-danger-border)',borderRadius:10,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)'}}><Trash2 size={15}/></button></div><label style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700}}>Название</label><Field value={form.title} onChange={e=>patch('title',e.target.value)} maxLength={160} containerStyle={{marginBottom:0}} style={inputStyle}/><label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Место проведения</label><div style={{display:'flex',flexWrap:'wrap',gap: 6,marginTop: 4}}><button type="button" onClick={()=>{patch('territoryId','');patch('legacyPlace','Не указано')}} className="press" style={{...eventManagePlaceStyle(!form.territoryId),minHeight:40}}>Не указано</button>{territories.filter(t=>!Number(t.is_government||0)).map(t=><button key={t.id} type="button" onClick={()=>{patch('territoryId',String(t.id));patch('legacyPlace',t.name||'');}} className="press" style={{...eventManagePlaceStyle(String(form.territoryId)===String(t.id)),minHeight:40}}><MinecraftText text={t.name}/></button>)}</div><label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Дата и время начала</label><EventDateTimeFields parts={form.dateParts} onChange={parts=>setForm(v=>({...v,dateParts:parts,dateChanged:true}))}/><label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Координаты</label><input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/><label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Описание</label><textarea value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} className="atlas-event-description-field" style={{...inputStyle,resize:'none'}}/><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/><button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 6,width:'100%',minHeight:42,marginTop: 4,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:10,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800}}><ImagePlus size={16}/>Выбрать файл обложки</button>{form.imageData&&<img src={form.imageData} alt="Обложка" style={{width:'100%',maxHeight:140,objectFit:'cover',borderRadius:10,marginTop: 8}}/>}<div style={{display:'flex',gap: 8,marginTop: 12}}><button onClick={save} disabled={busy||!form.title.trim()} className="press" style={{flex:1,border:0,borderRadius:10,minHeight:43,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800}}>{busy?'Сохранение…':'Сохранить изменения'}</button><button onClick={cancelEdit} disabled={busy} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '0 12px',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Отмена</button></div></div>}
    {error&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 8}}>{error}</div>}{notice&&<div role="status" style={{fontSize:12,color:'var(--theme-color-status-success)',marginTop: 8}}>{notice}</div>}
    {dateLimitToast>0&&<FixedToast key={dateLimitToast} message={EVENT_DATE_LIMIT_MESSAGE} type="error"/>}
  </div>;
}
function eventManagePlaceStyle(active){return {border:active?'1px solid var(--theme-color-action-primary)':'1px solid var(--theme-color-border)',borderRadius:10,padding: '8px 10px',background:active?'var(--theme-color-action-primary-soft)':'var(--theme-color-surface-raised)',color:active?'var(--theme-color-action-primary)':'var(--theme-color-text-primary)',fontSize:12,fontWeight:700};}
