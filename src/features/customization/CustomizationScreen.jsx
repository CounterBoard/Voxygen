import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { formatDiscountRemaining } from '../../../shared/customization-visuals.js';
import { ChevronDown, ChevronUp, Eye, EyeOff, Pencil, Trash2, X } from 'lucide-react';
import { ColorDot, VISUAL_COLORS } from './VisualColorPicker.jsx';

function AchievementFields({form,setForm}){
  if(!form.forAchievement)return null;
  const field=(key,label,placeholder,step='1')=>{
    const score=step==='0.1';
    const max=score?10:(key==='achievementGems'?2147483647:1000000);
    return <label style={{display:'block',marginBottom: 8}}>
      <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginBottom: 4}}>{label}</div>
      <input type="number" min="0" max={max} value={form[key]??''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
        placeholder={placeholder} inputMode={score?'decimal':'numeric'} step={step}
        style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: 10,color:'var(--theme-color-text-primary)'}}/>
    </label>;
  };
  return <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:12,padding: 10,marginBottom: 10}}>
    <div className="atlas-display" style={{fontSize:14,fontWeight:700,marginBottom: 8}}>Настройки достижения</div>
    <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',lineHeight:1.45,marginBottom: 8}}>Все заполненные условия должны выполняться одновременно. Город получает достижение, когда текущий показатель больше или равен порогу. Пустое поле отключает условие; 0 — допустимый порог.</div>
    {field('achievementResidents','Количество жителей (основатель/мэр считается)','Например: 5')}
    {field('achievementGems','Потрачено на город самоцветов','Например: 100')}
    {field('achievementInspectorScore','Оценка от инспектора (0–10)','Например: 8.5','0.1')}
    {field('achievementPlayerScore','Оценка от игроков (0–10)','Например: 8.5','0.1')}
    {field('achievementScreenshots','Количество одобренных скриншотов','Например: 10')}
    {field('achievementComments','Количество комментариев','Например: 5')}
    {field('achievementVisuals','Количество визуалов в инвентаре города','Например: 3')}
  </div>;
}

function makeVisualForm(item={}){
  return {
    name:item?.name||'',categories:item?.categories_text||item?.category_name||'',price:String(item?.price??0),
    imageData:item?.image_data||'',color:item?.color||'white',forAchievement:!!item?.achievement_enabled,
    achievementResidents:item?.achievement_residents??'',achievementGems:item?.achievement_gems??'',
    achievementInspectorScore:item?.achievement_inspector_score??'',achievementPlayerScore:item?.achievement_player_score??'',
    achievementScreenshots:item?.achievement_screenshots??'',achievementComments:item?.achievement_comments??'',
    achievementVisuals:item?.achievement_visuals??'',governmentMarker:!!item?.government_marker
  };
}

function VisualEditModal({item,onClose,onSaved,initData,ui={}}){
  const { apiErrorMessage, safeCaughtError, useAnimatedClose, IconButton, Field, readImageData } = ui;
  const [form,setForm]=useState(makeVisualForm(item)),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const { closing, requestClose } = useAnimatedClose(onClose, 175);
  async function pick(file){if(!file)return;try{const imageData=await readImageData(file);setForm(f=>({...f,imageData}));setError('')}catch(e){setError(safeCaughtError(e, 'Ошибка изображения'))}}
  async function save(){
    try{
      setSaving(true);setError('');
      const categories=form.categories.split(',').map(x=>x.trim()).filter(Boolean);
      if(!form.name.trim()||!categories.length)throw new Error('Укажите название и хотя бы один тег');
      if(!form.imageData)throw new Error('Загрузите изображение визуала');
      const r=await fetch(`${API_BASE}/api/customization/items/${encodeURIComponent(item.id)}`,{
        method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},
        body:JSON.stringify({initData,name:form.name.trim(),categories,price:Number(form.price),imageData:form.imageData,color:form.color,
          achievementEnabled:form.forAchievement,achievementResidents:form.achievementResidents,achievementGems:form.achievementGems,
          achievementInspectorScore:form.achievementInspectorScore,achievementPlayerScore:form.achievementPlayerScore,
          achievementScreenshots:form.achievementScreenshots,achievementComments:form.achievementComments,achievementVisuals:form.achievementVisuals,
          governmentMarker:form.governmentMarker})
      });
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      onSaved?.();requestClose();
    }catch(e){setError(safeCaughtError(e, 'Не удалось сохранить визуал'))}finally{setSaving(false)}
  }
  return <div className={`atlas-overlay${closing ? ' atlas-closing' : ''}`} style={{position:'fixed',inset:0,zIndex:120,background:'var(--theme-color-overlay-scrim)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={requestClose}>
    <div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`} style={{width:'100%',maxWidth:'var(--theme-modal-max-width)',maxHeight:'min(var(--theme-modal-max-height-editor), var(--theme-modal-viewport-safe-height))',overflowY:'auto',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-modal)',padding: 'var(--theme-modal-content-padding)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom: 12}}>
        <div className="atlas-display" style={{fontSize:18,fontWeight:700}}>Редактировать визуал</div>
        <IconButton icon={X} label="Закрыть окно" onClick={requestClose} />
      </div>
      <Field value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Название" style={{marginBottom: 8}}/>
      <Field value={form.categories} onChange={e=>setForm(f=>({...f,categories:e.target.value}))} placeholder="Теги через запятую" style={{marginBottom: 8}}/>
      <Field value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value.replace(/\D/g,'')}))} placeholder="Цена" inputMode="numeric" style={{marginBottom: 8}}/>
      <label style={{display:'flex',alignItems:'center',gap: 8,fontSize:13,fontWeight:700,margin: '3px 0 8px',cursor:'pointer'}}>
        <input type="checkbox" checked={form.forAchievement} onChange={e=>setForm(f=>({...f,forAchievement:e.target.checked}))}/>
        За достижение
      </label>
      <label style={{display:'flex',alignItems:'center',gap: 8,fontSize:13,fontWeight:700,margin: '0 0 10px',cursor:'pointer',color:form.governmentMarker?'var(--theme-color-status-success)':'var(--theme-color-text-primary)'}}>
        <input type="checkbox" checked={form.governmentMarker} onChange={e=>setForm(f=>({...f,governmentMarker:e.target.checked}))}/>
        Гос. терра
      </label>
      <AchievementFields form={form} setForm={setForm}/>
      <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginBottom: 6}}>Цвет визуала</div>
      <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap: 6,marginBottom: 8}}>{VISUAL_COLORS.map(([v])=><ColorDot key={v} value={v} selected={form.color===v} onClick={()=>setForm(f=>({...f,color:v}))}/>)}</div>
      <input type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])} style={{width:'100%',marginBottom: 8}}/>
      {form.imageData&&<div style={{display:'flex',justifyContent:'center',padding: 10,background:'var(--theme-color-surface-raised)',borderRadius:12,marginBottom: 8}}><img src={form.imageData} alt={form.name} style={{maxWidth:160,maxHeight:170,objectFit:'contain'}}/></div>}
      {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginBottom: 8}}>{error}</div>}
      <button onClick={save} disabled={saving} className="press" style={{width:'100%',padding: 11,border:'none',borderRadius:10,background:'var(--theme-color-status-warning)',color:'var(--theme-color-status-warning-contrast)',fontWeight:700}}>{saving?'Сохранение…':'Сохранить изменения'}</button>
    </div>
  </div>;
}

function profileAccountLabel(scope,cities,tgUser,profile){
  if(scope==='personal') return profile?.nickname || tgUser?.mc_nickname || 'Ник не указан';
  const id=String(scope).startsWith('treasury:')?String(scope).slice(9):'';
  return `Казна: ${(cities||[]).find(c=>String(c.id)===id)?.name||'город'}`;
}
export function CustomizationScreen({initData,tgUser,role,territories,profile,onToast,ui={}}){
  const { apiErrorMessage, safeCaughtError, useAnimatedClose, IconButton, Field, readImageData, GemHex, MinecraftText } = ui;
  const [data,setData]=useState(null),[error,setError]=useState(''),[filters,setFilters]=useState({tag:'all',color:'all'}),[accountScope,setAccountScope]=useState('personal'),[accountLoading,setAccountLoading]=useState(false);
  const [form,setForm]=useState(makeVisualForm()),[saving,setSaving]=useState(false),[editingItem,setEditingItem]=useState(null),[rechecking,setRechecking]=useState(false),[recheckNotice,setRecheckNotice]=useState(''),[visibilityBusy,setVisibilityBusy]=useState('');
  const [discountNow,setDiscountNow]=useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setDiscountNow(Date.now()),15000);return()=>window.clearInterval(timer)},[]);
  const isMain=role==='main_inspector';
  const managerCities=(territories||[]).filter(t=>String(t.owner_telegram_id||'')===String(tgUser?.id||'')||(Array.isArray(t.manager_telegram_ids)&&t.manager_telegram_ids.map(String).includes(String(tgUser?.id||''))));
  const managerCityKey=managerCities.map(t=>String(t.id)).sort().join('|');
  const accountOptions=['personal',...managerCities.map(t=>`treasury:${t.id}`)];
  const currentAccountScopeRef=useRef(accountScope),fullLoadVersionRef=useRef(0),balanceLoadVersionRef=useRef(0);
  useEffect(()=>{currentAccountScopeRef.current=accountScope},[accountScope]);
  useEffect(()=>{if(!accountOptions.includes(accountScope))setAccountScope('personal')},[managerCityKey,accountScope]);
  const canSwitchAccount=accountOptions.length>1&&!isMain;

  async function loadFull(){
    const requestedScope=accountScope,requestVersion=++fullLoadVersionRef.current;
    try{setError('');setAccountLoading(true);
      const r=await fetch(`${API_BASE}/api/customization?account=${encodeURIComponent(requestedScope)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      if(requestVersion===fullLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setData(d);
    }catch(e){if(requestVersion===fullLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setError(safeCaughtError(e, 'Не удалось загрузить визуалы'))}
    finally{if(requestVersion===fullLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setAccountLoading(false)}
  }
  async function loadAccountBalance(){
    const requestedScope=accountScope,requestVersion=++balanceLoadVersionRef.current;
    try{setError('');setAccountLoading(true);
      const r=await fetch(`${API_BASE}/api/customization?lite=1&account=${encodeURIComponent(requestedScope)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      if(requestVersion===balanceLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setData(prev=>prev?{...prev,...d}:d);
    }catch(e){if(requestVersion===balanceLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setError(safeCaughtError(e, 'Не удалось загрузить счёт'))}
    finally{if(requestVersion===balanceLoadVersionRef.current&&currentAccountScopeRef.current===requestedScope)setAccountLoading(false)}
  }
  async function recheckAchievements(){
    if(!isMain||rechecking)return;
    try{
      setRechecking(true);setError('');setRecheckNotice('');
      const r=await fetch(`${API_BASE}/api/achievements/recheck`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData})});
      const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось перепроверить достижения.'));
      setRecheckNotice(`Проверено городов: ${Number(d.checked||0)}. Без основателя/мэра пропущено: ${Number(d.skipped||0)}. Новых выдач: ${Number(d.awarded||0)}. Ошибок: ${Number(d.errors||0)}.`);
      await loadFull();
    }catch(e){setError(safeCaughtError(e,'Не удалось перепроверить достижения.'))}finally{setRechecking(false)}
  }
  useEffect(()=>{if(accountOptions.includes(accountScope))loadFull()},[initData,managerCityKey,accountScope]);
  useEffect(()=>{const refresh=()=>{if(accountOptions.includes(accountScope))loadAccountBalance()};window.addEventListener('voxygen:currency-changed',refresh);return()=>window.removeEventListener('voxygen:currency-changed',refresh)},[accountScope,managerCityKey]);

  async function create(){
    try{
      setSaving(true);setError('');
      const categories=form.categories.split(',').map(x=>x.trim()).filter(Boolean);
      if(!form.name.trim()||!categories.length)throw new Error('Укажите название и хотя бы один тег');
      const r=await fetch(`${API_BASE}/api/customization/items`,{
        method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},
        body:JSON.stringify({initData,name:form.name.trim(),categories,price:Number(form.price),imageData:form.imageData,color:form.color,
          achievementEnabled:form.forAchievement,achievementResidents:form.achievementResidents,achievementGems:form.achievementGems,
          achievementInspectorScore:form.achievementInspectorScore,achievementPlayerScore:form.achievementPlayerScore,
          achievementScreenshots:form.achievementScreenshots,achievementComments:form.achievementComments,achievementVisuals:form.achievementVisuals,governmentMarker:form.governmentMarker})
      });
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setForm(makeVisualForm());await loadFull();
    }catch(e){setError(safeCaughtError(e, 'Не удалось создать визуал'))}finally{setSaving(false)}
  }
  async function pick(file){if(!file)return;try{const imageData=await readImageData(file);setForm(f=>({...f,imageData}));setError('')}catch(e){setError(safeCaughtError(e, 'Ошибка изображения'))}}
  async function buy(id){
    try{const r=await fetch(`${API_BASE}/api/customization/purchase`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemId:id,accountScope})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setError('');loadFull()}catch(e){const message=safeCaughtError(e, 'Не удалось купить визуал');if(/недостаточно самоцветов/i.test(message)){setError('');onToast?.('Недостаточно самоцветов','error');}else setError(message)}
  }
  async function remove(id){
    if(!window.confirm('Удалить этот визуал?'))return;
    try{const r=await fetch(`${API_BASE}/api/customization/items/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));loadFull()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить визуал'))}
  }
  async function toggleVisibility(item){
    if(!isMain||visibilityBusy)return;
    const hidden=Number(item.hidden_from_users||0)!==1;
    try{setVisibilityBusy(String(item.id));setError('');const r=await fetch(`${API_BASE}/api/customization/items/visibility`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemId:item.id,hiddenFromUsers:hidden})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось изменить видимость визуала.'));setData(v=>v?{...v,items:(v.items||[]).map(x=>String(x.id)===String(item.id)?{...x,hidden_from_users:Number(d.hidden_from_users??(hidden?1:0))}:x)}:v);}catch(e){setError(safeCaughtError(e,'Не удалось изменить видимость визуала.'));}finally{setVisibilityBusy('');}
  }
  async function reorderItems(id,direction){
    const items=[...(data?.items||[])];const idx=items.findIndex(x=>x.id===id);if(idx<0)return;
    const to=idx+direction;if(to<0||to>=items.length)return;
    [items[idx],items[to]]=[items[to],items[idx]];
    setData(v=>({...v,items}));
    try{
      const r=await fetch(`${API_BASE}/api/customization/items/reorder`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemIds:items.map(x=>x.id)})});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
    }catch(e){setError(safeCaughtError(e, 'Не удалось изменить порядок визуалов'));loadFull()}
  }
  async function reorderTags(id,direction){
    const tags=[...(data?.categories||[])];const idx=tags.findIndex(x=>x.id===id);if(idx<0)return;
    const to=idx+direction;if(to<0||to>=tags.length)return;
    [tags[idx],tags[to]]=[tags[to],tags[idx]];
    setData(v=>({...v,categories:tags}));
    try{
      const r=await fetch(`${API_BASE}/api/customization/tags/reorder`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,tagIds:tags.map(x=>x.id)})});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
    }catch(e){setError(safeCaughtError(e, 'Не удалось изменить порядок тегов'));loadFull()}
  }

  const allItems=(data?.items||[]).filter(item=>isMain||!item.government_marker);
  const tagNames=data?.categories||[];
  const filtered=allItems.filter(item=>{
    const cats=String(item.categories_text||item.category_name||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    return (filters.tag==='all'||cats.includes(filters.tag.toLowerCase()))&&(filters.color==='all'||String(item.color||'white')===filters.color);
  });

  const accountCardStyle={width:'100%',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: '12px 15px',marginBottom: 10,display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left',color:'var(--theme-color-text-primary)'};
  const accountCardContent=<>
    <span style={{display:'flex',flexDirection:'column',gap: 3}}><MinecraftText text={profileAccountLabel(accountScope,managerCities,tgUser,profile)} className="atlas-display" style={{fontSize:17,fontWeight:800,lineHeight:1.15}}/>{canSwitchAccount&&<span style={{fontSize:10.5,color:'var(--theme-color-text-muted)'}}>Нажмите, чтобы переключить счёт</span>}</span>
    <span className="atlas-display atlas-account-balance" style={{fontSize:22,fontWeight:800,color:'var(--content-color-gem)',display:'flex',alignItems:'center',gap: 6,lineHeight:1}}><span>{accountLoading?'…':(data?.balance??0)}</span><GemHex/></span>
  </>;
  return <div className="atlas-page atlas-page--customization" style={{padding: '18px 15px 85px'}}>
    <div className="atlas-display atlas-page-title" style={{fontSize:22,fontWeight:700,marginBottom: 12}}>Визуал</div>

    {canSwitchAccount ? (
      <button type="button" onClick={()=>setAccountScope(v=>{const i=accountOptions.indexOf(v);const next=accountOptions[(i+1)%accountOptions.length];setData(prev=>prev?{...prev,accountScope:next,accountLabel:profileAccountLabel(next,managerCities,tgUser,profile)}:prev);return next})} className="press atlas-account-switcher atlas-account-switcher--interactive" style={accountCardStyle} aria-label="Переключить счёт">
        {accountCardContent}
      </button>
    ) : (
      <div className="atlas-account-switcher atlas-account-switcher--static" style={accountCardStyle} aria-label="Личный счёт">
        {accountCardContent}
      </div>
    )}

    {isMain&&<div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 12,marginBottom: 10}}>
      <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom: 10}}>Добавить визуал</div>
      <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Название" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: 10,color:'var(--theme-color-text-primary)',marginBottom: 8}}/>
      <input value={form.categories} onChange={e=>setForm(f=>({...f,categories:e.target.value}))} placeholder="Теги через запятую" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: 10,color:'var(--theme-color-text-primary)',marginBottom: 8}}/>
      <input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value.replace(/\D/g,'')}))} placeholder="Цена" inputMode="numeric" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: 10,color:'var(--theme-color-text-primary)',marginBottom: 8}}/>
      <div style={{display:'flex',alignItems:'center',gap: 18,flexWrap:'wrap',margin: '3px 0 10px'}}>
        <label style={{display:'inline-flex',alignItems:'center',gap: 8,fontSize:13,fontWeight:700,cursor:'pointer'}}>
          <input type="checkbox" checked={form.forAchievement} onChange={e=>setForm(f=>({...f,forAchievement:e.target.checked}))}/>
          За достижение
        </label>
        <label style={{display:'inline-flex',alignItems:'center',gap: 8,fontSize:13,fontWeight:700,cursor:'pointer',color:form.governmentMarker?'var(--theme-color-status-success)':'var(--theme-color-text-primary)'}}>
          <input type="checkbox" checked={form.governmentMarker} onChange={e=>setForm(f=>({...f,governmentMarker:e.target.checked}))}/>
          Гос. терра
        </label>
      </div>
      {form.governmentMarker&&<div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',margin: '-2px 0 10px'}}>Этот визуал будет скрыт от обычных пользователей и автоматически применится к государственным территориям по своим тегам.</div>}
      <AchievementFields form={form} setForm={setForm}/>
      <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginBottom: 6}}>Цвет визуала</div>
      <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap: 6,marginBottom: 8}}>{VISUAL_COLORS.map(([v])=><ColorDot key={v} value={v} selected={form.color===v} onClick={()=>setForm(f=>({...f,color:v}))}/>)}</div>
      <input type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])} style={{width:'100%',marginBottom: 8}}/>
      {form.imageData&&<div style={{display:'flex',justifyContent:'center',padding: 10,background:'var(--theme-color-surface-raised)',borderRadius:12,marginBottom: 8}}><img src={form.imageData} alt="preview" style={{maxWidth:160,maxHeight:170,objectFit:'contain'}}/></div>}
      <button onClick={create} disabled={saving} className="press" style={{width:'100%',padding: 10,border:'none',borderRadius:10,background:'var(--theme-color-status-warning)',color:'var(--theme-color-status-warning-contrast)',fontWeight:700,marginTop: 8}}>{saving?'Создание…':'Добавить визуал'}</button>
    </div>}

    {isMain&&<div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: 12,marginBottom: 10}}>
      <div style={{fontSize:12,color:'var(--theme-color-text-muted)',lineHeight:1.45,marginBottom: 8}}>Проверить достижения у всех одобренных городов повторно. Это исправит пропущенные выдачи, например если достижение было добавлено до назначения основателя/мэра.</div>
      <button onClick={recheckAchievements} disabled={rechecking} className="press" style={{width:'100%',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:800}}>{rechecking?'Проверка достижений…':'Перепроверить достижения всех городов'}</button>
      {recheckNotice&&<div role="status" style={{fontSize:12,color:'var(--theme-color-status-success)',marginTop: 8}}>{recheckNotice}</div>}
    </div>}

    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 12,marginBottom: 10}}>
      <div style={{display:'flex',gap: 6,overflowX:'auto',paddingBottom: 6,alignItems:'center'}}>
        <button onClick={()=>setFilters(f=>({...f,tag:'all'}))} className="press" style={{border:filters.tag==='all'?'1px solid var(--theme-color-action-primary-border)':'1px solid var(--theme-color-border-strong)',borderRadius:999,padding: '6px 10px',background:filters.tag==='all'?'var(--theme-color-action-primary)':'var(--theme-color-surface-raised)',color:filters.tag==='all'?'var(--theme-color-action-primary-contrast)':'var(--theme-color-text-muted)',fontSize:11.5,fontWeight:700,boxSizing:'border-box'}}>Все</button>
        {tagNames.map((c,i)=><div key={c.id} style={{display:'flex',alignItems:'center',gap: 2,flex:'0 0 auto'}}>
          <button onClick={()=>setFilters(f=>({...f,tag:c.name}))} className="press" style={{border:filters.tag.toLowerCase()===c.name.toLowerCase()?'1px solid var(--theme-color-action-primary-border)':'1px solid var(--theme-color-border-strong)',borderRadius:999,padding: '6px 10px',background:filters.tag.toLowerCase()===c.name.toLowerCase()?'var(--theme-color-action-primary)':'var(--theme-color-surface-raised)',color:filters.tag.toLowerCase()===c.name.toLowerCase()?'var(--theme-color-action-primary-contrast)':'var(--theme-color-text-muted)',fontSize:11.5,fontWeight:700,whiteSpace:'nowrap',boxSizing:'border-box'}}><MinecraftText text={c.name}/></button>
          {isMain&&<span style={{display:'flex',gap: 1}}>
            <button disabled={i===0} onClick={()=>reorderTags(c.id,-1)} className="press" style={{border:'none',background:'transparent',color:'var(--theme-color-text-muted)',fontSize:10,padding: 2}}><ChevronUp size={14}/></button>
            <button disabled={i===tagNames.length-1} onClick={()=>reorderTags(c.id,1)} className="press" style={{border:'none',background:'transparent',color:'var(--theme-color-text-muted)',fontSize:10,padding: 2}}>›</button>
          </span>}
        </div>)}
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 6,flexWrap:'wrap'}}>
        <ColorDot value="none" small selected={filters.color==='all'} title="Все цвета" onClick={()=>setFilters(f=>({...f,color:'all'}))}/>
        {VISUAL_COLORS.filter(([v])=>v!=='none').map(([v])=><ColorDot key={v} value={v} small selected={filters.color===v} onClick={()=>setFilters(f=>({...f,color:v}))}/>)}
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap: 10}}>
      {filtered.map(item=>{
        const owned=(data?.owned||[]).some(x=>x.item_id===item.id);
        const idx=allItems.findIndex(x=>x.id===item.id);
        return <div key={item.id} className="atlas-visual-card-reveal atlas-visual-card" data-visual-color={String(item.color||'white').toLowerCase()} style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: 10,position:'relative',animationDelay:`${Math.min(idx*28,168)}ms`}}>
          {isMain&&<div style={{position:'absolute',right:7,top:7,zIndex:3,display:'flex',gap: 3}}>
            <button disabled={idx===0} onClick={()=>reorderItems(item.id,-1)} className="press" title="Выше" style={{width:25,height:25,border:'none',borderRadius:'50%',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-muted)',fontWeight:700}}><ChevronUp size={14}/></button>
            <button disabled={idx===allItems.length-1} onClick={()=>reorderItems(item.id,1)} className="press" title="Ниже" style={{width:25,height:25,border:'none',borderRadius:'50%',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-muted)',fontWeight:700}}><ChevronDown size={14}/></button>
            <button type="button" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setEditingItem(item)}} className="press" title="Редактировать" style={{width:36,height:36,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:10,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Pencil size={17}/></button>
            <button type="button" disabled={Boolean(visibilityBusy)} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleVisibility(item)}} className="press" title={Number(item.hidden_from_users||0)===1?'Показать другим пользователям':'Скрыть от других пользователей'} style={{width:36,height:36,border:'1px solid var(--theme-color-border)',borderRadius:10,background:Number(item.hidden_from_users||0)===1?'var(--theme-color-surface-elevated)':'var(--theme-color-surface-raised)',color:Number(item.hidden_from_users||0)===1?'var(--theme-color-text-muted)':'var(--theme-color-text-primary)',display:'flex',alignItems:'center',justifyContent:'center',cursor:visibilityBusy?'wait':'pointer',opacity:(visibilityBusy&&String(item.id)!==visibilityBusy)?0.55:1}}>{Number(item.hidden_from_users||0)===1?<EyeOff size={17}/>:<Eye size={17}/>}</button>
            <button type="button" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();remove(item.id)}} className="press" title="Удалить" style={{width:36,height:36,border:'1px solid var(--theme-color-status-danger-border)',borderRadius:10,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Trash2 size={17}/></button>
          </div>}
          {item.image_data&&<div style={{height:140,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--theme-color-surface-raised)',borderRadius:10}}><img src={item.image_data} alt={item.name} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',imageRendering:'pixelated'}}/></div>}
          <MinecraftText as="div" text={item.name} style={{fontSize:13,fontWeight:700,marginTop: 6}}/>
          <div className="atlas-display atlas-visual-price" style={{fontSize:18,fontWeight:800,color:'var(--content-color-gem)',marginTop:6,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,lineHeight:1,width:'100%',minWidth:0}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,minWidth:0}}>
              {Number(item.discount_percent||0)>0&&Number(item.discount_expires_at||0)>discountNow&&<span style={{fontSize:14,fontWeight:650,color:'var(--theme-color-text-muted)',textDecoration:'line-through',textDecorationColor:'#9CA3AF',textDecorationThickness:2}}>{item.price}</span>}
              <span>{Number(item.discount_percent||0)>0&&Number(item.discount_expires_at||0)>discountNow?item.discounted_price:item.price}</span><GemHex/>
            </span>
            {Number(item.discount_percent||0)>0&&Number(item.discount_expires_at||0)>discountNow&&<span style={{fontSize:10.5,fontWeight:650,color:'var(--theme-color-text-muted)',whiteSpace:'nowrap',flexShrink:0,marginLeft:'auto'}}>{formatDiscountRemaining(item.discount_expires_at,discountNow)}</span>}
          </div>
          <button disabled={owned} onClick={()=>buy(item.id)} className="press" style={{width:'100%',marginTop: 8,padding: 8,border:'none',borderRadius:10,background:owned?'var(--theme-color-surface-raised)':'var(--theme-color-action-primary)',color:owned?'var(--theme-color-text-muted)':'var(--theme-color-action-primary-contrast)',fontWeight:700}}>{owned?'Получено':'Купить'}</button>
        </div>;
      })}
    </div>
    {!filtered.length&&!error&&<div style={{fontSize:12,color:'var(--theme-color-text-muted)',padding: '20px 4px'}}>Визуалов по выбранным фильтрам нет.</div>}
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 10}}>{error}</div>}
    {editingItem&&<VisualEditModal item={editingItem} initData={initData} onClose={()=>setEditingItem(null)} onSaved={loadFull} ui={ui}/>}
  </div>;
}
