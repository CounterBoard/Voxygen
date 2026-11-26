import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { API_BASE } from '../../config/api.js';
import { TelegramSticker } from './TelegramSticker.jsx';

export function MainInspectorAwardManager({initData,territories=[],onTerritoriesChanged,ui}) {
  const {apiErrorMessage,safeCaughtError}=ui;
  const [packs,setPacks]=useState([]);
  const [expandedPackIds,setExpandedPackIds]=useState(()=>new Set());
  const [loading,setLoading]=useState(true);
  const [savingPack,setSavingPack]=useState(false);
  const [savingAward,setSavingAward]=useState(false);
  const [packUrl,setPackUrl]=useState('');
  const [selectedStickerId,setSelectedStickerId]=useState('');
  const [territoryId,setTerritoryId]=useState('');
  const [awardName,setAwardName]=useState('');
  const [awardDate,setAwardDate]=useState(()=>{
    const now=new Date(),pad=value=>String(value).padStart(2,'0');
    return now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  });
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const approvedTerritories=(territories||[]).filter(city=>!city.status||city.status==='approved');
  const selectedSticker=packs.flatMap(pack=>pack.stickers||[]).find(sticker=>String(sticker.id)===String(selectedStickerId))||null;
  function togglePack(packId){setExpandedPackIds(current=>{const next=new Set(current),key=String(packId);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  const inputStyle={width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding:'10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,outline:'none'};
  async function load(){
    try{
      setLoading(true);setError('');
      const response=await fetch(API_BASE+'/api/admin/awards',{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось загрузить каталог наград.'));
      setPacks(Array.isArray(data.packs)?data.packs:[]);
    }catch(e){setError(safeCaughtError(e,'Не удалось загрузить каталог наград.'))}
    finally{setLoading(false)}
  }
  useEffect(()=>{if(initData)load()},[initData]);
  async function addPack(){
    const url=packUrl.trim();
    if(!url)return;
    try{
      setSavingPack(true);setError('');setNotice('');
      const response=await fetch(API_BASE+'/api/admin/award-packs',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({url})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось добавить эмодзи-пак.'));
      setPackUrl('');setNotice('Эмодзи-пак добавлен: '+data.title);
      await load();
    }catch(e){setError(safeCaughtError(e,'Не удалось добавить эмодзи-пак.'))}
    finally{setSavingPack(false)}
  }
  async function removePack(pack){
    if(!window.confirm('Удалить эмодзи-пак «'+(pack.title||pack.set_name)+'» из каталога? Уже выданные награды сохранят свои значки.'))return;
    try{
      setError('');setNotice('');
      const response=await fetch(API_BASE+'/api/admin/award-packs/'+encodeURIComponent(pack.id),{method:'DELETE',headers:{'X-Telegram-Init-Data':initData}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось удалить эмодзи-пак.'));
      if((pack.stickers||[]).some(sticker=>String(sticker.id)===String(selectedStickerId)))setSelectedStickerId('');
      setNotice('Эмодзи-пак удалён');await load();
    }catch(e){setError(safeCaughtError(e,'Не удалось удалить эмодзи-пак.'))}
  }
  async function grantAward(){
    const name=awardName.trim();
    const awardedAt=new Date(awardDate+'T12:00:00').getTime();
    if(!selectedSticker){setError('Сначала выберите эмодзи из галереи.');return}
    if(!territoryId){setError('Выберите город, которому выдаётся награда.');return}
    if(!name){setError('Введите название награды.');return}
    if(!awardDate||!Number.isFinite(awardedAt)){setError('Укажите корректную дату.');return}
    try{
      setSavingAward(true);setError('');setNotice('');
      const response=await fetch(API_BASE+'/api/admin/awards',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({territoryId,stickerId:selectedSticker.id,name,awardedAt})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось выдать награду.'));
      setAwardName('');setNotice('Награда выдана городу «'+data.territoryName+'»');
      window.dispatchEvent(new Event('voxygen:awards-changed'));
      Promise.resolve(onTerritoriesChanged?.()).catch(()=>{});
    }catch(e){setError(safeCaughtError(e,'Не удалось выдать награду.'))}
    finally{setSavingAward(false)}
  }
  return <div className="atlas-page-panel" style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding:10,marginBottom:8}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:800,marginBottom:4}}>Награды</div>
    <div style={{display:'flex',gap:7,alignItems:'stretch'}}>
      <input value={packUrl} onChange={event=>setPackUrl(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')addPack()}} placeholder="https://t.me/addemoji/НазваниеНабора" aria-label="Ссылка на Telegram эмодзи-пак" style={{...inputStyle,flex:1,minWidth:0}}/>
      <button type="button" onClick={addPack} disabled={savingPack||!packUrl.trim()} className="press" style={{flex:'0 0 auto',border:'none',borderRadius:10,padding:'0 13px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800,opacity:savingPack||!packUrl.trim()?0.55:1}}>{savingPack?'…':'Добавить'}</button>
    </div>
    {loading&&<div role="status" style={{fontSize:12,color:'var(--theme-color-text-muted)',padding:'12px 0'}}>Загрузка каталога эмодзи…</div>}
    {!loading&&packs.length===0&&<div style={{fontSize:12,color:'var(--theme-color-text-muted)',padding:'12px 0'}}>Эмодзи-паки ещё не добавлены.</div>}
    <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:10}}>
      {packs.map(pack=><section key={pack.id} style={{borderTop:'1px solid var(--theme-color-border)',paddingTop:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <button type="button" onClick={()=>removePack(pack)} className="press" aria-label={'Удалить эмодзи-пак '+pack.title} title="Удалить пак" style={{width:32,height:32,flex:'0 0 32px',display:'flex',alignItems:'center',justifyContent:'center',border:'none',borderRadius:9,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)'}}><Trash2 size={15}/></button>
          <div style={{flex:1,minWidth:0}}>
            <div className="atlas-display" style={{fontSize:14,fontWeight:800,overflowWrap:'anywhere'}}>{pack.title}</div>
            <div style={{fontSize:10.5,color:'var(--theme-color-text-muted)',overflowWrap:'anywhere'}}>{pack.set_name} · {(pack.stickers||[]).length} эмодзи</div>
          </div>
          <button type="button" onClick={()=>togglePack(pack.id)} aria-label={(expandedPackIds.has(String(pack.id))?'Свернуть':'Развернуть')+' эмодзи-пак '+pack.title} aria-expanded={expandedPackIds.has(String(pack.id))} className="press" style={{width:32,height:32,flex:'0 0 32px',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--theme-color-border)',borderRadius:9,background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-muted)'}}>{expandedPackIds.has(String(pack.id))?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>
        </div>
        {expandedPackIds.has(String(pack.id))&&<div style={{display:'grid',gridTemplateColumns:'repeat(9,minmax(0,1fr))',gap:4}}>
          {(pack.stickers||[]).map(sticker=>{
            const selected=String(sticker.id)===String(selectedStickerId);
            return <button type="button" key={sticker.id} onClick={()=>setSelectedStickerId(selected?'':String(sticker.id))} aria-label={'Выбрать эмодзи '+(sticker.emoji||'')} aria-pressed={selected} className="press" style={{aspectRatio:'1 / 1',minWidth:0,padding:2,border:selected?'2px solid #6EE7B7':'1px solid var(--theme-color-border)',borderRadius:9,background:selected?'rgba(110,231,183,.12)':'var(--theme-color-surface-raised)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:selected?'0 0 0 1px rgba(110,231,183,.12)':'none'}}>
              <TelegramSticker stickerId={sticker.id} format={sticker.format} emoji={sticker.emoji} size={29} preview={Boolean(sticker.thumbnail_file_id)} hasThumbnail={Boolean(sticker.thumbnail_file_id)}/>
            </button>;
          })}
        </div>}
      </section>)}
    </div>
    <div style={{borderTop:'1px solid var(--theme-color-border)',marginTop:12,paddingTop:12}}>
      <div style={{fontSize:12,fontWeight:800,marginBottom:7}}>Выдать выбранный эмодзи как награду</div>
      <select value={territoryId} onChange={event=>setTerritoryId(event.target.value)} aria-label="Город для выдачи награды" style={{...inputStyle,marginBottom:8,opacity:approvedTerritories.length?1:0.55}} disabled={!approvedTerritories.length}>
        <option value="">Выберите город</option>
        {approvedTerritories.map(city=><option key={city.id} value={city.id}>{city.name}</option>)}
      </select>
      <input value={awardName} onChange={event=>setAwardName(event.target.value)} maxLength={80} placeholder="Название награды" aria-label="Название награды" style={{...inputStyle,marginBottom:8}}/>
      <input type="date" value={awardDate} onChange={event=>setAwardDate(event.target.value)} aria-label="Дата награды" style={{...inputStyle,marginBottom:9}}/>
      <button type="button" onClick={grantAward} disabled={savingAward||!selectedSticker||!territoryId||!awardName.trim()||!awardDate} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'11px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800,opacity:savingAward||!selectedSticker||!territoryId||!awardName.trim()||!awardDate?0.55:1}}>{savingAward?'Выдача…':'Выдать награду'}</button>
    </div>
    {error&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop:8}}>{error}</div>}
    {notice&&<div role="status" style={{fontSize:12,color:'var(--theme-color-status-success)',marginTop:8}}>{notice}</div>}
  </div>;
}
