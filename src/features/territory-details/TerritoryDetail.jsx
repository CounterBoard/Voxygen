import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { TerritoryAwardIcon } from '../territory-awards/TelegramSticker.jsx';
import { TerritoryScreenshotsPanel } from './TerritoryScreenshotsPanel.jsx';
import { TerritoryFeedbackPanel } from './TerritoryFeedbackPanel.jsx';
import { ChevronLeft, Heart, Users, ShieldCheck } from 'lucide-react';

export function TerritoryDetail({ base, onBack, profile, onGoToProfile, tgUser, role, mapImage, loadError = null, onRetry = null, onToast, ui = {} }) {
  const {
    apiErrorMessage, safeCaughtError, getBannerGradient, formatTerritoryCoords, formatTerritoryAwardDate,
    MinecraftText, TelegramMinecraftText, ScoreBadge, SimpleModal, AvatarHead, Lightbox,
    DonationModal, FixedToast, SectionTitle, ShotThumb, Slider, Field, iconBtn,
  } = ui;
  const [t, setT] = useState(base);
  const [lightbox, setLightbox] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [toast, setToast] = useState(null);
  const residentCount = Number(t.resident_count ?? ((t.residents || []).length + (t.owner_telegram_id ? 1 : 0)));
  const [showResidents, setShowResidents] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [selectedTerritoryAward,setSelectedTerritoryAward]=useState(null);
  const detailPayloadRef = useRef({ territoryId: String(base?.id || ''), payload: null });
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const initData = window.Telegram?.WebApp?.initData || '';
  const hasNickname = profile.status === 'verified';
  const isOwner = String(t.owner_telegram_id || '') === String(tgUser?.id || '') || (Array.isArray(t.manager_telegram_ids) && t.manager_telegram_ids.map(String).includes(String(tgUser?.id || '')));
  const isResident = Array.isArray(t.resident_telegram_ids) && t.resident_telegram_ids.map(String).includes(String(tgUser?.id || ''));
  const isInspectorRole = role === 'inspector' || role === 'main_inspector';
  const isMainInspector = role === 'main_inspector';
  const canRate = hasNickname && (isInspectorRole || !isOwner);
  const isGovernment = Boolean(t.is_government);

  useEffect(() => {
    const territoryId = String(base?.id || '');
    if (detailPayloadRef.current.territoryId !== territoryId) {
      detailPayloadRef.current = { territoryId, payload: null };
    }
    setT({ ...base, ...(detailPayloadRef.current.payload || {}) });
  }, [base]);

  useEffect(() => {
    const territoryId = String(base?.id || '');
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError('');
    fetch(`${API_BASE}/api/territories?detail=${encodeURIComponent(territoryId)}`, {
      headers: { 'X-Telegram-Init-Data': initData },
      cache: 'no-store',
    }).then(async response => {
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.territories)) {
        throw new Error(apiErrorMessage(response, data, 'Не удалось загрузить подробности территории.'));
      }
      const row = data.territories.find(item => String(item.id) === territoryId);
      if (!row) throw new Error('Территория не найдена. Обновите список и попробуйте снова.');
      const payload = {
        awards: Array.isArray(row.awards) ? row.awards : [],
        reviews: Array.isArray(row.reviews) ? row.reviews : [],
        screenshots: Array.isArray(row.screenshots) ? row.screenshots.map(shot => ({ ...shot, url: shot?.url ? (String(shot.url).startsWith('http') ? shot.url : `${API_BASE}${shot.url}`) : shot?.url })) : [],
        residents: Array.isArray(row.residents) ? row.residents : [],
        resident_rows: Array.isArray(row.resident_rows) ? row.resident_rows : [],
        resident_telegram_ids: Array.isArray(row.resident_telegram_ids) ? row.resident_telegram_ids : [],
        managers: Array.isArray(row.managers) ? row.managers : [],
        manager_telegram_ids: Array.isArray(row.manager_telegram_ids) ? row.manager_telegram_ids : [],
        manager_count: Number(row.manager_count || 0),
        is_manager: Boolean(row.is_manager),
        resident_count: Number(row.resident_count || 0),
      };
      detailPayloadRef.current = { territoryId, payload };
      if (!cancelled) setT(current => String(current.id) === territoryId ? { ...current, ...payload } : current);
    }).catch(error => {
      if (!cancelled) setDetailsError(safeCaughtError(error, 'Не удалось загрузить подробности территории.'));
    }).finally(() => {
      if (!cancelled) setDetailsLoading(false);
    });
    return () => { cancelled = true; };
  }, [base?.id, initData, detailsAttempt]);

  function flash(message) { setToast(message); setTimeout(() => setToast(null), 2200); }

const approved = (t.screenshots || []).filter(s => s.status === 'approved');
  return (
    <div className="atlas-page atlas-page--territory" style={{ paddingBottom: 90, position: 'relative' }}>
      <div style={{ position: 'relative', height: 150, overflow:'hidden', background:getBannerGradient(t.banner_color||'none',t.banner_gradient||'aurora',t.accent) }}>
        <button onClick={onBack} className="press" style={{ position: 'absolute', top: 14, left: 14, width: 44, height: 44, borderRadius: '50%', background: 'rgba(8,13,34,.72)', border: '1px solid rgba(255,255,255,.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}><ChevronLeft size={20} /></button>
        {(t.awards||[]).filter(award=>award.slot_index!==null&&award.slot_index!==undefined).slice().sort((a,b)=>Number(b.slot_index)-Number(a.slot_index)).map((award,index)=><button key={award.id} type="button" onClick={()=>setSelectedTerritoryAward(award)} title={award.name} aria-label={`${award.emoji} ${award.name}`} className="press atlas-award-badge" style={{position:'absolute',top:6,right:6+index*58,width:52,height:52,animation:'atlas-award-badge-enter .42s cubic-bezier(.2,.8,.2,1) both',animationDelay:`${index*75}ms`,padding:0,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(255,255,255,.4)',borderRadius:10,background:'rgba(8,13,34,.72)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',fontSize:0,zIndex:4}}><span style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:0}}><TerritoryAwardIcon award={award} size={36}/></span></button>)}
        <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, zIndex: 3, textShadow:'var(--theme-shadow-cover-title)' }}>
          <MinecraftText as="div" text={t.name} className="atlas-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.16 }} />
          <div style={{fontSize:13,color:'var(--theme-color-text-secondary)'}}>{formatTerritoryCoords(t.coords || (t.vox_x != null && t.vox_z != null ? `${t.vox_x} / ${t.vox_z}` : ''))}</div>
        </div>
      </div>
      <div style={{ padding: '12px 15px 0' }}>
        {detailsError && <div role="status" style={{fontSize:11.5,color:'var(--theme-color-text-muted)',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '8px 10px',marginBottom: 10,display:'flex',alignItems:'center',gap: 8}}><span style={{flex:1}}>{detailsError}</span><button onClick={()=>setDetailsAttempt(value=>value+1)} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:8,background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',padding: '6px 8px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
        {loadError && <div role="status" style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:12,padding: '10px 11px',marginBottom: 12,color:'var(--theme-color-text-primary)',fontSize:11.5,lineHeight:1.45,display:'flex',alignItems:'center',gap: 8}}><span style={{flex:1,overflowWrap:'anywhere'}}>{String(loadError).startsWith('Часть данных')?loadError:`Не удалось обновить данные города. Показана последняя загруженная версия. ${loadError}`}</span><button onClick={onRetry} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:9,background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',padding: '6px 8px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
        <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 18}}>
          <div style={{display:'flex',gap: 10,flex:1,minWidth:0}}><ScoreBadge type="curator" value={t.curator} size="lg" /><ScoreBadge type="community" value={t.community} size="lg" /></div>
          {!isGovernment&&<button onClick={()=>setShowDonation(true)} className="press" style={{height:48,minWidth:72,padding: '0 12px',border:'1px solid var(--theme-color-status-danger)',borderRadius:14,background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',display:'flex',alignItems:'center',justifyContent:'center',gap: 4,fontWeight:800}}><Heart size={17} strokeWidth={2.2}/><span>Донат</span></button>}
        </div>
        {String(t.additional_info || '').trim() && <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: '12px 12px',marginTop: -6,marginBottom: 18}}><TelegramMinecraftText text={t.additional_info} interactive style={{fontSize:13.5,lineHeight:1.55,color:'var(--theme-color-text-primary)'}} /></div>}
        <TerritoryScreenshotsPanel
          approved={approved}
          territoryId={t.id}
          initData={initData}
          hasNickname={hasNickname}
          isOwner={isOwner}
          isGovernment={isGovernment}
          isMainInspector={isMainInspector}
          onTerritoryChange={setT}
          onOpenShot={(index, shot) => { setLightboxIndex(index); setLightbox({ shot }); }}
          onCloseLightbox={() => setLightbox(null)}
          onFlash={flash}
          ui={{apiErrorMessage,safeCaughtError,SectionTitle,ShotThumb}}
        />
        {!isGovernment&&<button onClick={() => setShowResidents(true)} className="press" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 14, padding: '11px 13px', margin: '0 0 15px', color: 'var(--theme-color-text-primary)' }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600 }}><Users size={15} /> Жители</span><span style={{ fontSize: 12, color: 'var(--theme-color-text-muted)' }}>{residentCount} →</span></button>}
        <TerritoryFeedbackPanel
          base={base}
          territory={t}
          setTerritory={setT}
          initData={initData}
          tgUser={tgUser}
          hasNickname={hasNickname}
          isOwner={isOwner}
          isInspectorRole={isInspectorRole}
          isMainInspector={isMainInspector}
          canRate={canRate}
          onGoToProfile={onGoToProfile}
          onFlash={flash}
          ui={{apiErrorMessage,safeCaughtError,SectionTitle,Slider,Field,MinecraftText,TelegramMinecraftText,iconBtn}}
        />
      </div>
      {selectedTerritoryAward&&<SimpleModal title="Награда" onClose={()=>setSelectedTerritoryAward(null)}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'0 4px 4px',textAlign:'center'}}>
          <div aria-hidden="true"><TerritoryAwardIcon award={selectedTerritoryAward} size={56}/></div>
          <div style={{fontSize:15,fontWeight:800,lineHeight:1.35,color:'var(--theme-color-text-primary)',overflowWrap:'anywhere'}}>{selectedTerritoryAward.name}</div>
          <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)'}}>Получена {formatTerritoryAwardDate(selectedTerritoryAward.awarded_at)}</div>
        </div>
      </SimpleModal>}
      {showResidents && <SimpleModal title="Жители" onClose={() => setShowResidents(false)}><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{(t.managers||[]).map((m,i)=><div key={`manager-${m.telegram_id||i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--theme-color-status-success-soft)', borderRadius: 11 }}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={40}/><div style={{ flex: 1, minWidth:0 }}><MinecraftText text={m.mc_nickname || m.telegram_username || 'Ник не указан'} style={{fontSize:13,fontWeight:700}}/><div style={{ fontSize: 10.5, color: 'var(--theme-color-status-success)' }}>Основатель/мэр</div></div><ShieldCheck size={18} color="var(--theme-color-status-success)" /></div>)}{(t.resident_rows||[]).length===0 ? ((t.residents || []).length === 0 ? <div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)' }}>Кроме основателей/мэров жителей пока нет.</div> : (t.residents || []).map((r,i)=><div key={`legacy-resident-${i}`} style={{ display:'flex',alignItems:'center',gap: 8,padding: '10px 12px',background:'var(--theme-color-surface-raised)',borderRadius:11 }}><AvatarHead nickname={r} size={40}/><MinecraftText text={r} style={{fontSize:13}}/></div>)) : (t.resident_rows||[]).map((r,i)=><div key={`resident-${r.telegram_id||i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--theme-color-surface-raised)', borderRadius: 11 }}><AvatarHead nickname={r.mc_nickname} skinUrl={r.skin_url} size={40}/><div style={{flex:1,minWidth:0}}><MinecraftText text={r.mc_nickname || r.telegram_username || 'Ник не указан'} style={{fontSize:13,fontWeight:700}}/>{r.telegram_username&&<div style={{fontSize:10.5,color:'var(--theme-color-text-muted)'}}>@{String(r.telegram_username).replace(/^@/,'')}</div>}</div></div>)}</div></SimpleModal>}
      {lightbox && <Lightbox shots={approved} index={lightboxIndex} mode="view" onClose={() => setLightbox(null)} onChange={(i)=>{setLightboxIndex(i);setLightbox({shot:approved[i]});}} />}
      {showDonation && <DonationModal territory={t} initData={initData} onClose={()=>setShowDonation(false)} onSuccess={()=>{setShowDonation(false);flash('Донат отправлен');}} onToast={onToast}/>}
      {toast && <FixedToast key={toast} message={toast}/>}
    </div>
  );
}
