import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { getBannerGradient, getRandomBannerGradientId } from '../../../shared/customization-visuals.js';
import { ColorDot, VISUAL_COLORS } from '../customization/VisualColorPicker.jsx';
import { TerritoryAwardIcon } from '../territory-awards/TelegramSticker.jsx';
import { Pencil, UserPlus, ChevronUp, X, Clock } from 'lucide-react';

function RecruitmentManagement({territory,initData,onSaved,readOnly=false,ui={}}) {
  const { apiErrorMessage, safeCaughtError, TextAreaField, FixedToast } = ui;
  const [description,setDescription]=useState(territory?.recruitment_description||'');
  const [enabled,setEnabled]=useState(Number(territory?.recruitment_enabled||0)===1);
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setDescription(territory?.recruitment_description||'');setEnabled(Number(territory?.recruitment_enabled||0)===1)},[territory?.id,territory?.recruitment_description,territory?.recruitment_enabled]);
  async function save(nextEnabled=enabled){
    try{setSaving(true);setError('');const r=await fetch(`${API_BASE}/api/recruitment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:territory.id,ownerNickname:territory.owner,description:description.trim(),enabled:nextEnabled,recruitmentUsername:territory.recruitment_username||territory.recruitment_contact_username||''})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setEnabled(nextEnabled);setNotice(nextEnabled?'Объявление опубликовано':'Объявление скрыто');onSaved?.()}catch(e){setError(safeCaughtError(e, 'Не удалось сохранить объявление'))}finally{setSaving(false)}}
  return <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 12,marginBottom: 12}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom: 8}}>Набор</div>
    <TextAreaField value={description} onChange={e=>setDescription(e.target.value)} readOnly={readOnly} tabIndex={readOnly?-1:undefined} placeholder={readOnly?'':'Дополнительный текст объявления'} className="atlas-recruitment-description-field" rows={5} containerStyle={{marginBottom: 0}} style={{width:'100%',boxSizing:'border-box',resize:'none',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,cursor:readOnly?'default':'text',pointerEvents:readOnly?'none':'auto',userSelect:readOnly?'none':'auto',caretColor:readOnly?'transparent':'auto'}}/>
    {!readOnly&&<>
      <div style={{display:'flex',gap: 8,marginTop: 8}}>
        <button onClick={()=>save(true)} disabled={saving||!description.trim()} className="press" style={{flex:1,border:'none',borderRadius:10,padding: '10px 8px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>{saving?'Сохранение…':'Опубликовать'}</button>
        <button onClick={()=>save(false)} disabled={saving||!description.trim()} className="press" style={{flex:1,border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 8px',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Скрыть</button>
      </div>
      {error&&<div style={{fontSize:11.5,color:'var(--theme-color-status-danger)',marginTop: 6}}>{error}</div>}
      {notice&&<FixedToast key={notice} message={notice}/>}
    </>}
  </div>;
}
export function CityManagementProfile({territory,managerTerritories=[],initData,tgUser,onChanged,readOnly=false,ui={}}={}){
  const { apiErrorMessage, safeCaughtError, SurfaceCard, MinecraftText, TelegramMinecraftText, TextAreaField, Field, AvatarHead, InventoryGrid, TerritoryAwardIcon, FixedToast, iconBtn } = ui;
  const [name,setName]=useState(territory?.name||''),[additionalInfo,setAdditionalInfo]=useState(String(territory?.additional_info||'').slice(0,542)),[members,setMembers]=useState([]),[managers,setManagers]=useState([]),[invites,setInvites]=useState([]),[residentNick,setResidentNick]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[noticeRevision,setNoticeRevision]=useState(0),[noticeType,setNoticeType]=useState('success'),[inventory,setInventory]=useState(null),[newRecruitmentUsername,setNewRecruitmentUsername]=useState(''),[leaveBusy,setLeaveBusy]=useState(false),[awardLimitToast,setAwardLimitToast]=useState(0),[awardBusyId,setAwardBusyId]=useState(null),[bannerSaving,setBannerSaving]=useState(false);
  useEffect(()=>{setName(territory?.name||'');setAdditionalInfo(String(territory?.additional_info||'').slice(0,542))},[territory?.name,territory?.additional_info]);
  async function load(){if(!territory)return;try{setError('');const h={'X-Telegram-Init-Data':initData};const [mr,ir]=await Promise.all([fetch(`${API_BASE}/api/city/management?territoryId=${encodeURIComponent(territory.id)}`,{headers:h,cache:'no-store'}),fetch(`${API_BASE}/api/customization?scope=profile&territoryId=${encodeURIComponent(territory.id)}`,{headers:h,cache:'no-store'})]);const md=await mr.json().catch(() => null),id=await ir.json().catch(() => null);if(!mr.ok||!md.ok)throw new Error(apiErrorMessage(mr, md, "Операция не выполнена."));if(!ir.ok||!id.ok)throw new Error(apiErrorMessage(ir, id, "Операция не выполнена."));setMembers(md.members||[]);setManagers(md.managers||[]);setInvites(md.invites||[]);setInventory(id);setNewRecruitmentUsername(md.recruitmentUsername||'')}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить данные города'))}}
  useEffect(()=>{load()},[territory?.id]);
  async function post(path,body,success){try{const r=await fetch(`${API_BASE}${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,...body})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice(success);setNoticeType('success');setNoticeRevision(value=>value+1);await load();onChanged?.()}catch(e){setError(safeCaughtError(e, 'Операция не выполнена'))}}
  async function changeBannerColor(value){
    if(readOnly||bannerSaving||!inventory)return;
    const previous={bannerColor:inventory.bannerColor||'none',bannerGradient:inventory.bannerGradient||'aurora'};
    const next={bannerColor:value,bannerGradient:getRandomBannerGradientId()};
    setError('');
    setBannerSaving(true);
    // Update locally before sending the request so the preview has no network delay.
    setInventory(current=>current?{...current,...next}:current);
    try{
      const response=await fetch(`${API_BASE}/api/customization/city`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:territory.id,bannerColor:next.bannerColor,bannerGradient:next.bannerGradient})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить баннер территории.'));
      setNotice('Баннер территории обновлён');setNoticeType('success');setNoticeRevision(value=>value+1);
      // The public territory refresh reads the exact same pair saved above.
      onChanged?.();
    }catch(error){
      setInventory(current=>current?{...current,...previous}:current);
      setError(safeCaughtError(error,'Не удалось сохранить баннер территории.'));
    }finally{setBannerSaving(false)}
  }
  async function rename(){const n=name.trim();if(!n||n===territory.name)return;await post('/api/admin/territories/rename',{territoryId:territory.id,name:n},'Название города изменено')}
  async function saveAdditionalInfo(){await post('/api/city/additional-info',{territoryId:territory.id,additionalInfo},'Дополнительная информация сохранена')}
  async function addResident(){const n=residentNick.trim();if(!n)return;await post('/api/city/invite',{territoryId:territory.id,nickname:n},'Приглашение отправлено');setResidentNick('')}
  async function removeResident(id){await post('/api/city/remove-resident',{territoryId:territory.id,telegramId:Number(id)},'Житель исключён')}
  async function promoteResident(id){await post('/api/city/promote-resident',{territoryId:territory.id,telegramId:Number(id)},'Запрос на повышение отправлен')}
  async function demoteManager(id){if(window.confirm('Понизить этого основателя/мэра до жителя?'))await post('/api/city/demote-manager',{territoryId:territory.id,telegramId:Number(id)},'Запрос на понижение отправлен')}
  async function setRecruitmentUsername(id){await post('/api/recruitment/contact',{territoryId:territory.id,telegramId:Number(id)},'Username для объявления обновлён')}
  async function cancelInvite(id){await post('/api/city/invite/cancel',{inviteId:id},'Приглашение отменено')}
  async function requestInspectorRating(){await post('/api/request-inspector-rating',{territoryId:territory.id},'Запрос отправлен инспекторам')}
  async function leaveTerritory(){
    if(!readOnly||leaveBusy||!window.confirm(`Покинуть территорию «${territory.name}»?`))return;
    try{
      setLeaveBusy(true);setError('');
      const response=await fetch(`${API_BASE}/api/city/leave`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:String(territory.id)})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось покинуть территорию.'));
      await onChanged?.();
    }catch(error){setError(safeCaughtError(error,'Не удалось покинуть территорию.'));}finally{setLeaveBusy(false)}
  }
  async function equip(itemId){
    const equippedId=inventory?.equippedMarkerItemId;
    if(String(equippedId||'')===String(itemId||''))return;
    const nextId=itemId;
    await post('/api/customization/city',{territoryId:territory.id,markerItemId:nextId},'Метка города обновлена');
    setInventory(v=>v?{...v,equippedMarkerItemId:nextId}:v);
  }
  async function toggleAwardPlacement(award){
    if(readOnly||!award?.id||awardBusyId)return;
    setAwardBusyId(award.id);
    try{
      const response=await fetch(`${API_BASE}/api/customization/city/award`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:territory.id,awardId:award.id})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){
        const message=apiErrorMessage(response,data,'Не удалось изменить размещение награды.');
        if(response.status===409)setAwardLimitToast(value=>value+1);
        else setError(message);
        return;
      }
      if(data.equipped){
        const nextSlot=Number(data.slotIndex)+1;
        setNotice(`Награда установлена в слот ${nextSlot}`);
        setNoticeType('success');
      }else{
        setNotice('Награда снята');
        setNoticeType('error');
      }
      setNoticeRevision(value=>value+1);
      await load();
      onChanged?.();
    }catch(error){setError(safeCaughtError(error,'Не удалось изменить размещение награды.'))}
    finally{setAwardBusyId(null)}
  }
  if(!territory)return null;
  return <SurfaceCard className="atlas-page-panel" padding={10} style={{marginBottom: 8}}>
    <MinecraftText text={territory.name} as="div" className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom: 12}}/>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',marginBottom: 6}}>Название</div><div style={{display:'flex',gap: 8,marginBottom: 4}}><input value={name} readOnly={readOnly} tabIndex={readOnly?-1:undefined} onChange={e=>setName(e.target.value)} style={{flex:1,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,cursor:readOnly?'default':'text',pointerEvents:readOnly?'none':'auto',userSelect:readOnly?'none':'auto',caretColor:readOnly?'transparent':'auto'}}/>{!readOnly&&<button onClick={rename} className="press" style={iconBtn('var(--theme-color-action-primary)','var(--theme-color-action-primary-contrast)',true)}><Pencil size={15}/></button>}</div>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',marginTop: 12,marginBottom: 4}}>Доп. информация</div>
    {readOnly
      ? <TelegramMinecraftText text={additionalInfo} interactive={false} className="atlas-readonly-field" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginBottom: 8,minHeight:72}}/>
      : <TextAreaField value={additionalInfo} onChange={e=>setAdditionalInfo(e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder="Дополнительная информация о территории (необязательно)" className="atlas-profile-additional-field" containerStyle={{marginBottom: 0}} style={{width:'100%',boxSizing:'border-box',resize:'none',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13}}/>}
    {!readOnly&&<button onClick={saveAdditionalInfo} disabled={additionalInfo===String(territory?.additional_info||'')} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',marginTop: 8,marginBottom: 8,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>Сохранить доп. информацию</button>}
    {managers.length>0&&<div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-control)',padding: 10,marginBottom: 'var(--theme-layout-section-gap)'}}><div style={{fontSize:13,fontWeight:700,marginBottom: 8}}>Основатели/мэры</div>{managers.map(m=><div key={m.telegram_id} style={{display:'flex',alignItems:'center',gap: 8,padding: '8px 0',borderTop:'1px solid var(--theme-color-border)'}}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={32}/><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={m.mc_nickname||'Без ника'} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--theme-color-text-muted)'}}>{m.telegram_username?`@${String(m.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div></div>{!readOnly&&managers.length>1&&<button onClick={()=>demoteManager(m.telegram_id)} className="press" style={{border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:8,padding: '6px 8px',fontSize:10.5}}>Понизить</button>}{!readOnly&&managers.length>1&&(()=>{const currentContact=String(newRecruitmentUsername||'').replace(/^@/,'').trim().toLowerCase();const managerUsername=String(m.telegram_username||'').replace(/^@/,'').trim().toLowerCase();const inAnnouncement=Boolean(currentContact&&managerUsername&&currentContact===managerUsername);return <button onClick={()=>!inAnnouncement&&setRecruitmentUsername(m.telegram_id)} disabled={inAnnouncement} className="press" style={{border:'1px solid var(--theme-color-border)',background:inAnnouncement?'var(--theme-color-surface-elevated)':'var(--theme-color-action-primary)',color:inAnnouncement?'var(--theme-color-text-muted)':'var(--theme-color-action-primary-contrast)',borderRadius:8,padding: '6px 8px',fontSize:10.5,opacity:inAnnouncement?1:.98}}>{inAnnouncement?'В объявлении':'В объявление'}</button>})()}</div>)}</div>}
    <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-control)',padding: 10,marginBottom: 'var(--theme-layout-section-gap)'}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom: 8}}>Жители</div>
      {!readOnly && (
        <div
          className="atlas-resident-add-row"
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0, marginBottom: 0 }}>
            <Field
              value={residentNick}
              onChange={(e) => setResidentNick(e.target.value)}
              placeholder="Ник Minecraft"
              style={{
                width: '100%',
                background: 'var(--theme-color-surface-raised)',
                border: '1px solid var(--theme-color-border)',
                borderRadius: 10,
                padding: '8px 12px',
                color: 'var(--theme-color-text-primary)',
                fontSize: 13,
              }}
            />
          </div>
          <button
            onClick={addResident}
            className="press"
            style={{
              width: 44,
              height: 44,
              flex: '0 0 44px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--theme-color-action-primary-border)',
              borderRadius: 12,
              background: 'var(--theme-color-action-primary)',
              color: 'var(--theme-color-action-primary-contrast)',
            }}
          >
            <UserPlus size={16} />
          </button>
        </div>
      )}
      <div style={{display:'flex',flexDirection:'column',gap: 6}}>{members.map(m=><div key={m.telegram_id} style={{display:'flex',alignItems:'center',gap: 8,padding: '8px 0',borderTop:'1px solid var(--theme-color-border)'}}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={32}/><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={m.mc_nickname||'Без ника'} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--theme-color-text-muted)'}}>{m.telegram_username?`@${String(m.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div></div>{!readOnly&&<><button onClick={()=>promoteResident(m.telegram_id)} className="press" title="Повысить до основателя/мэра" style={{width:34,height:34,flex:'0 0 34px',padding: 0,border:'none',background:'var(--theme-color-status-success-soft)',color:'var(--theme-color-status-success)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center'}}><ChevronUp size={15}/></button><button onClick={()=>removeResident(m.telegram_id)} className="press" title="Удалить" style={{width:34,height:34,flex:'0 0 34px',padding: 0,border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center'}}><X size={14}/></button></>}</div>)}{invites.map(inv=><div key={inv.id} style={{display:'flex',alignItems:'center',gap: 8,padding: '8px 0',borderTop:'1px solid var(--theme-color-border)'}}><div style={{width:32,height:32,borderRadius:'50%',background:'var(--theme-color-status-warning-soft)',display:'flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto'}}><Clock size={14} color="var(--theme-color-status-warning)"/></div><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={inv.target_nickname} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--theme-color-status-warning)'}}>Ожидает ответа</div></div>{!readOnly&&<button onClick={()=>cancelInvite(inv.id)} className="press" style={{border:'none',background:'transparent',color:'var(--theme-color-status-danger)',padding: 6}}><X size={14}/></button>}</div>)}{!members.length&&!invites.length&&<div style={{fontSize:12,color:'var(--theme-color-text-muted)',paddingTop: 4}}>Жителей и приглашений пока нет.</div>}</div>
    </div>
    <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-control)',padding: 10,marginBottom: 'var(--theme-layout-section-gap)'}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom: 8}}>Оформление территории</div>
      <div style={{borderTop:'1px solid var(--theme-color-border)',marginTop: 8,paddingTop: 8}}>
        <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginBottom: 7}}>Баннер</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 8,flexWrap:'wrap',marginBottom:0}}>
          {VISUAL_COLORS.filter(([value])=>value!=='none').map(([value])=><ColorDot key={`banner-${value}`} value={value} selected={String(inventory?.bannerColor||'none')===value} title={({red:'Красный',orange:'Оранжевый',yellow:'Жёлтый',green:'Зелёный',turquoise:'Бирюзовый',blue:'Синий',purple:'Фиолетовый',magenta:'Пурпурный',white:'Белый'})[value]||value} disabled={readOnly||bannerSaving||!inventory} onClick={()=>changeBannerColor(value)}/>)}
        </div>
        <div role="img" aria-label="Предпросмотр текущего баннера территории" style={{marginTop:8,height:72,width:'100%',borderRadius:12,border:'1px solid var(--theme-color-border)',overflow:'hidden',opacity:1,filter:'none',background:getBannerGradient(inventory?.bannerColor||'none',inventory?.bannerGradient||'aurora',territory?.accent)}}/>
        <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',margin: '14px 0 6px'}}>Метка</div>
        <InventoryGrid items={(inventory?.cityInventory||[]).filter(i=>String(i.category_name||'').toLowerCase()==='метка'||String(i.categories_text||'').toLowerCase().split(',').map(x=>x.trim()).includes('метка'))} equippedId={inventory?.equippedMarkerItemId} showEquip={!readOnly} onEquip={id=>equip(id)} columns={4} aspectRatio="1 / 1" imageFit="contain" emptyText="Доступных меток нет."/>
        <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',margin: '14px 0 6px'}}>Награды</div>
        {(inventory?.territoryAwards||[]).length===0
          ? <div style={{fontSize:12,color:'var(--theme-color-text-muted)',padding:'8px 0'}}>Наград пока нет</div>
          : <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
              {(inventory?.territoryAwards||[]).map((award,index)=>{
                const equipped=award.slot_index!==null&&award.slot_index!==undefined;
                return <button key={award.id} type="button" disabled={readOnly||Boolean(awardBusyId&&String(awardBusyId)===String(award.id))} title={award.name} aria-label={`${award.emoji} ${award.name}${equipped?', размещена на баннере':''}`} aria-pressed={equipped} onClick={()=>toggleAwardPlacement(award)} className="press atlas-award-inventory-card" style={{gridColumn:'1 / -1',minWidth:0,minHeight:68,animation:'atlas-award-card-enter .38s cubic-bezier(.2,.8,.2,1) both',animationDelay:`${Math.min(index,5)*55}ms`,border:equipped?'2px solid #6EE7B7':'1px solid var(--theme-color-border)',borderRadius:12,background:equipped?'rgba(110,231,183,.18)':'var(--theme-color-surface-raised)',boxShadow:equipped?'inset 0 0 0 1px rgba(110,231,183,.2),0 0 0 1px rgba(110,231,183,.12)':'none',color:'var(--theme-color-text-primary)',display:'grid',gridTemplateColumns:'48px minmax(0,1fr)',alignItems:'center',gap:8,padding:6,opacity:1}}>
                  <span style={{fontSize:32,lineHeight:1.1,display:'flex',alignItems:'center',justifyContent:'center',minWidth:0}}><TerritoryAwardIcon award={award} size={40}/></span>
                  <span style={{fontSize:11,lineHeight:1.2,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',width:'100%',minWidth:0}}>{award.name}</span>
                </button>;
              })}
            </div>}
      </div>
    </div>
    <RecruitmentManagement territory={{...territory,recruitment_username:newRecruitmentUsername}} initData={initData} onSaved={load} readOnly={readOnly} ui={ui}/>
    {readOnly&&<button onClick={leaveTerritory} disabled={leaveBusy} className="press" style={{width:'100%',height:48,minWidth:72,padding: '0 12px',border:'1px solid var(--theme-color-status-danger)',borderRadius:14,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,marginBottom: 0}}>{leaveBusy?'Выход…':'Покинуть территорию'}</button>}
    {!readOnly&&<button onClick={requestInspectorRating} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700,marginBottom: 0,minHeight:44}}>Запросить оценку инспектора</button>}
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 10}}>{error}</div>}
    {awardLimitToast>0&&<FixedToast key={awardLimitToast} message="Максимум 4 награды на странице территории" type="error"/>}
    {notice&&<FixedToast key={noticeRevision} message={notice} type={noticeType}/>}
  </SurfaceCard>;
}
