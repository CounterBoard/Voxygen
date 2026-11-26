import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { defaultGlobalExpiryDateParts, globalExpiryDatePartsFromTimestamp, globalExpiryPartsTimestamp, normalizeTimezoneOffset } from '../events/date-time.js';
import { EventDateTimeFields } from '../events/DateTimeFields.jsx';
import { THEME_CATALOG, normalizeThemeId } from '../../../shared/theme-catalog.js';
import { normalizeMapZoomPercent } from '../../../shared/world-map-coordinates.js';
import { ChevronDown, ChevronUp, Eye, EyeOff, X } from 'lucide-react';

export function GlobalSettingsPanel({ initData, onSettingsChanged, onClose, timezoneOffset='UTC+3', ui = {} }) {
  const { apiErrorMessage, safeCaughtError, useAnimatedClose, IconButton, SelectField, Slider, TextAreaField } = ui;
  const [entries,setEntries] = useState([]);
  const [mapZoom,setMapZoom] = useState(88);
  const [theme,setTheme] = useState('vox');
  const [expiresAtParts,setExpiresAtParts] = useState(()=>defaultGlobalExpiryDateParts(timezoneOffset));
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [reloadToken,setReloadToken] = useState(0);
  // Theme access controls are rendered below and must be initialized before load().
  const [themeAccess,setThemeAccess] = useState({});
  const [themeNamesDraft,setThemeNamesDraft] = useState({});
  const [expandedThemeId,setExpandedThemeId] = useState('');
  const { closing, requestClose } = useAnimatedClose(onClose,175);
  async function load(){
    try{
      setLoading(true);setError('');
      const response=await fetch(API_BASE+'/api/admin/global-settings',{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось загрузить глобальные настройки.'));
      const rows=Array.isArray(data.settings)?data.settings:[];
      setEntries(rows);
      setThemeAccess(data.themeAccess&&typeof data.themeAccess==='object'?data.themeAccess:{});
      const zoom=rows.find(row=>row.key==='map_zoom'),themeRow=rows.find(row=>row.key==='theme');
      setMapZoom(zoom?normalizeMapZoomPercent(zoom.value):88);
      setTheme(themeRow?String(themeRow.value||'vox'):'vox');
      const expiryRows=rows.filter(row=>row.active&&row.expiresAt!=null);
      if(expiryRows.length){const earliest=Math.min(...expiryRows.map(row=>Number(row.expiresAt)).filter(Number.isFinite));if(Number.isFinite(earliest))setExpiresAtParts(globalExpiryDatePartsFromTimestamp(Math.max(Date.now()+60000,earliest),timezoneOffset));}
      else setExpiresAtParts(defaultGlobalExpiryDateParts(timezoneOffset));
    }catch(e){setError(safeCaughtError(e,'Не удалось загрузить глобальные настройки.'));}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(initData)load();},[initData,reloadToken]);
  async function refreshEffectiveSettings(){const response=await fetch(API_BASE+'/api/user-settings',{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});const data=await response.json().catch(()=>null);if(response.ok&&data?.ok&&data?.settings)onSettingsChanged?.(data.settings);}
  async function apply(key,permanent=false){
    try{
      setBusy(true);setError('');setNotice('');
      const expiresAt=permanent?undefined:globalExpiryPartsTimestamp(expiresAtParts,timezoneOffset);
      if(!permanent&&!expiresAt)throw new Error('Выберите корректную дату и время в будущем.');
      const value=key==='map_zoom'?normalizeMapZoomPercent(mapZoom):theme;
      const payload={initData,settings:{[key]:value},...(permanent?{permanent:true}:{expiresAt})};
      const response=await fetch(API_BASE+'/api/admin/global-settings',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось применить глобальную настройку.'));
      setEntries(Array.isArray(data.settings)?data.settings:[]);await refreshEffectiveSettings();
      setNotice((key==='map_zoom'?'Глобальный масштаб':'Глобальная тема')+(permanent?' применён навсегда':' применён до указанного времени'));
    }catch(e){setError(safeCaughtError(e,'Не удалось применить глобальную настройку.'));}
    finally{setBusy(false);}
  }
  async function saveThemeAccess(themeId,visibility,usernames){
    try{
      setBusy(true);setError('');setNotice('');
      const names=String(usernames??'').split(/[\\n,;]+/).map(value=>value.replace(/^@+/,'').trim().toLowerCase()).filter(Boolean);
      const response=await fetch(API_BASE+'/api/admin/global-settings',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,themeAccess:{themeId,visibility,usernames:names}})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить доступ к теме.'));
      setThemeAccess(data.themeAccess||{});setNotice('Доступ к теме «'+(THEME_CATALOG[themeId]?.name||themeId)+'» сохранён');
      await refreshEffectiveSettings();
    }catch(e){setError(safeCaughtError(e,'Не удалось сохранить доступ к теме.'));}
    finally{setBusy(false);}
  }
  async function clear(key){
    try{
      setBusy(true);setError('');setNotice('');
      const response=await fetch(API_BASE+'/api/admin/global-settings',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,clear:true,key})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось снять глобальную настройку.'));
      setEntries(Array.isArray(data.settings)?data.settings:[]);await refreshEffectiveSettings();
      setNotice(key==='map_zoom'?'Глобальный масштаб снят':'Глобальная тема снята');
    }catch(e){setError(safeCaughtError(e,'Не удалось снять глобальную настройку.'));}
    finally{setBusy(false);}
  }
  const status=entry=>!entry?'Не задано':!entry.active?'Срок действия истёк':entry.expiresAt==null?'Действует постоянно':'До '+new Date(Number(entry.expiresAt)).toLocaleString('ru-RU');
  const zoomRow=entries.find(item=>item.key==='map_zoom'),themeRow=entries.find(item=>item.key==='theme');
  const sectionStyle={background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:13,padding: 12,marginBottom: 12};
  const actionStyle={minHeight:38,border:0,borderRadius:9,padding: '0 11px',background:'var(--theme-color-status-success)',color:'var(--theme-color-status-success-contrast)',fontWeight:800,fontSize:12};
  const secondaryStyle={minHeight:38,border:'1px solid var(--theme-color-border)',borderRadius:9,padding: '0 11px',background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',fontWeight:700,fontSize:12};
  return <div className={'atlas-overlay'+(closing?' atlas-closing':'')} style={{position:'fixed',inset:0,zIndex:140,background:'var(--theme-color-overlay-scrim)',display:'flex',alignItems:'center',justifyContent:'center',padding: '18px 12px'}} onClick={requestClose}>
    <div onClick={e=>e.stopPropagation()} className={'atlas-modal-shell'+(closing?' atlas-closing':'')} style={{width:'min(var(--theme-modal-max-width),100%)',maxHeight:'min(var(--theme-modal-max-height-expanded), var(--theme-modal-viewport-safe-height))',overflowY:'auto',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-modal)',padding: 'var(--theme-modal-content-padding)',boxSizing:'border-box'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap: 12,marginBottom: 8}}><div className="atlas-display" style={{fontSize:19,fontWeight:800}}>Глобальные настройки</div><IconButton icon={X} label="Закрыть глобальные настройки" onClick={requestClose} /></div>
      <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',lineHeight:1.45,marginBottom: 12}}>Каждая настройка включается и снимается независимо. Глобальные значения временно заменяют личные настройки пользователей, пока те не выберут собственное значение или пока не закончится срок действия.</div>
      {loading?<div style={{padding: 15,color:'var(--theme-color-text-muted)',fontSize:12}}>Загрузка…</div>:<>
        <div style={sectionStyle}><div style={{fontSize:13,fontWeight:750,marginBottom: 4}}>Тема</div><div style={{fontSize:11,color:'var(--theme-color-text-muted)',marginBottom: 8}}>{status(themeRow)}</div>
          <SelectField value={normalizeThemeId(theme)} onChange={e=>setTheme(normalizeThemeId(e.target.value))} style={{marginBottom: 8}} aria-label="Глобальная тема интерфейса">{Object.values(THEME_CATALOG).filter(item=>item.status==='active').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
          <div style={{display:'flex',gap: 6,flexWrap:'wrap'}}><button onClick={()=>apply('theme',false)} disabled={busy} className="press" style={{...actionStyle,flex:'1 1 130px'}}>Применить до даты</button><button onClick={()=>apply('theme',true)} disabled={busy} className="press" style={secondaryStyle}>Навсегда</button><button onClick={()=>clear('theme')} disabled={busy||!themeRow?.active} className="press" style={secondaryStyle}>Снять тему</button></div>
        </div>
        <div style={sectionStyle}><div style={{fontSize:13,fontWeight:750,marginBottom: 4}}>Масштаб карты</div><div style={{fontSize:11,color:'var(--theme-color-text-muted)',marginBottom: 8}}>{status(zoomRow)}</div>
          <Slider label="Масштаб карты" variant="inspector" min="1" max="100" step="1" value={mapZoom} onChange={e=>setMapZoom(normalizeMapZoomPercent(e.target.value))} style={{'--slider-progress':`${(mapZoom-1)/99*100}%`}}/><div style={{fontSize:12,color:'var(--theme-color-text-primary)',fontWeight:700,textAlign:'center',marginBottom: 8}}>{mapZoom}%</div>
          <div style={{display:'flex',gap: 6,flexWrap:'wrap'}}><button onClick={()=>apply('map_zoom',false)} disabled={busy} className="press" style={{...actionStyle,flex:'1 1 130px'}}>Применить до даты</button><button onClick={()=>apply('map_zoom',true)} disabled={busy} className="press" style={secondaryStyle}>Навсегда</button><button onClick={()=>clear('map_zoom')} disabled={busy||!zoomRow?.active} className="press" style={secondaryStyle}>Снять масштаб</button></div>
        </div>
        <div style={{fontSize:12,fontWeight:750,marginBottom: 3}}>Срок действия для применения до даты</div><div style={{fontSize:10.5,color:'var(--theme-color-text-muted)',marginBottom: 4}}>Время указано по часовому поясу вашего профиля: {normalizeTimezoneOffset(timezoneOffset)}</div><EventDateTimeFields parts={expiresAtParts} onChange={setExpiresAtParts} includeYear timezoneOffset={timezoneOffset}/>
        <div style={{fontSize:13,fontWeight:800,marginTop: 15,marginBottom: 8}}>Доступность тем</div>
        <div style={{fontSize:11,color:'var(--theme-color-text-muted)',lineHeight:1.45,marginBottom: 8}}>Открытый глаз — тема доступна всем, кроме указанных пользователей. Закрытый глаз — тема доступна только главному инспектору и указанным пользователям.</div>
        {Object.values(THEME_CATALOG).filter(item=>item.status==='active').map(item=>{
          const rule=themeAccess[item.id]||{visibility:'public',usernames:[]};
          const names=Array.isArray(rule.usernames)?rule.usernames:[];
          const draft=themeNamesDraft[item.id]??names.join(', ');
          const expanded=expandedThemeId===item.id;
          const isPrivate=rule.visibility==='private';
          return <div key={item.id} style={{border:'1px solid var(--theme-color-border)',borderRadius:11,background:'var(--theme-color-surface-raised)',marginBottom: 6,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap: 8,padding: '8px 10px'}}>
              <button type="button" onClick={()=>setExpandedThemeId(expanded?'':item.id)} className="press" style={{flex:1,minWidth:0,textAlign:'left',border:0,background:'transparent',color:'var(--theme-color-text-primary)',fontSize:12.5,fontWeight:750,padding: '4px 0'}}>{item.name}{expanded?<ChevronUp size={14} style={{verticalAlign:'middle',marginLeft: 6}}/>:<ChevronDown size={14} style={{verticalAlign:'middle',marginLeft: 6}}/>}</button>
              <button type="button" disabled={busy} onClick={()=>saveThemeAccess(item.id,isPrivate?'public':'private',names.join(', '))} className="press" title={isPrivate?'Тема скрыта от всех, кроме разрешённых':'Тема видна всем, кроме исключённых'} aria-label={isPrivate?'Открыть видимость темы':'Закрыть видимость темы'} style={{width:35,height:35,border:'1px solid var(--theme-color-border)',borderRadius:9,background:'var(--theme-color-surface)',color:isPrivate?'var(--theme-color-status-warning)':'var(--theme-color-status-success)',display:'grid',placeItems:'center'}}>{isPrivate?<EyeOff size={17}/>:<Eye size={17}/>}</button>
            </div>
            {expanded&&<div style={{padding: '0 10px 10px'}}>
              <div style={{fontSize:10.5,color:'var(--theme-color-text-muted)',marginBottom: 6}}>{isPrivate?'Только главный инспектор и перечисленные пользователи':'Все пользователи, кроме перечисленных ниже'}</div>
              <TextAreaField value={draft} onChange={e=>setThemeNamesDraft(value=>({...value,[item.id]:e.target.value}))} placeholder="@username1, @username2" rows={3} style={{width:'100%',marginBottom: 6}}/>
              <button type="button" disabled={busy} onClick={()=>saveThemeAccess(item.id,rule.visibility||'public',draft)} className="press" style={{...actionStyle,width:'100%'}}>Сохранить список пользователей</button>
            </div>}
          </div>;
        })}

      </>}
      {error&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 10}}>{error}</div>}{notice&&<div role="status" style={{fontSize:12,color:'var(--theme-color-status-success)',marginTop: 10}}>{notice}</div>}
      <div style={{fontSize:10.5,color:'var(--theme-color-text-muted)',lineHeight:1.4,marginTop: 10}}>Тема: {status(themeRow)}. Масштаб: {status(zoomRow)}.</div>
      {!loading&&error&&<button onClick={()=>setReloadToken(value=>value+1)} className="press" style={{width:'100%',marginTop: 10,padding: '8px',border:'1px solid var(--theme-color-border)',borderRadius:10,background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Повторить загрузку</button>}
    </div>
  </div>;
}
