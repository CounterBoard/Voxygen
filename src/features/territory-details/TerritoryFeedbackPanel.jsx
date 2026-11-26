import React, { useEffect, useState } from 'react';
import { Check, MessageCircle, Pencil, Send, Trash2 } from 'lucide-react';

const CRITERIA = [
  { key: 'integrity', label: 'Целостность' },
  { key: 'comfort', label: 'Комфортность' },
  { key: 'atmosphere', label: 'Атмосферность' },
  { key: 'detail', label: 'Детализированность' },
];

function formatRatingCooldown(nextAt, now = Date.now()) {
  const diff = Math.max(0, Number(nextAt || 0) - now);
  if (diff <= 0) return '';
  const hours = diff / (60 * 60 * 1000);
  if (hours < 0.5) return 'несколько минут';
  const rounded = Math.max(1, Math.round(hours));
  return `${rounded} ${rounded === 1 ? 'час' : rounded >= 2 && rounded <= 4 ? 'часа' : 'часов'}`;
}

function ReplyBox({ onSend, iconBtn }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ marginBottom: 0 }}>
    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Ответить как основатель/мэр…"
        style={{
          flex: 1, background: 'var(--theme-color-surface-raised)', border: '1px solid var(--theme-color-border)', borderRadius: 10,
          padding: '6px 10px', color: 'var(--theme-color-text-primary)', fontSize: 12.5, outline: 'none',
        }}
      />
      <button
        onClick={() => { if (val.trim()) { onSend(val.trim()); setVal(''); } }}
        className="press"
        style={{ ...iconBtn('var(--theme-color-action-primary-soft)', 'var(--theme-color-action-primary)'), width: 32, height: 32 }}
      >
        <Send size={13} />
      </button>
    </div>
    </div>
  );
}

export function TerritoryFeedbackPanel({
  base,
  territory,
  setTerritory,
  initData,
  tgUser,
  hasNickname,
  isOwner,
  isInspectorRole,
  isMainInspector,
  canRate,
  onGoToProfile,
  onFlash,
  ui = {},
}) {
  const { apiErrorMessage, safeCaughtError, SectionTitle, Slider, Field, MinecraftText, TelegramMinecraftText, iconBtn } = ui;
  const t = territory;
  function flash(message) { onFlash?.(message); }
  const [newComment, setNewComment] = useState('');
  const [rated, setRated] = useState(Boolean(base?.my_rating?.rated));
  const [ratingNextAt, setRatingNextAt] = useState(Number(base?.my_rating?.next_at || 0));
  const [ratingNow, setRatingNow] = useState(Date.now());
  const [myRating, setMyRating] = useState(base?.my_rating?.values || { integrity: 3, comfort: 3, atmosphere: 3, detail: 3 });
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyText, setEditingReplyText] = useState('');

  useEffect(() => {
    setRated(Boolean(base?.my_rating?.rated));
    setRatingNextAt(Number(base?.my_rating?.next_at || 0));
    setMyRating(base?.my_rating?.values || { integrity: 3, comfort: 3, atmosphere: 3, detail: 3 });
  }, [base]);

  useEffect(() => {
    const timer = setInterval(() => setRatingNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

    async function saveRating() {
    try {
      const r = await fetch(`${API_BASE}/api/ratings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, territoryId: t.id, ...myRating }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) {
        if (d?.retryAt) {
          setRated(true); setRatingNextAt(Number(d.retryAt));
          if (d.values) setMyRating(d.values);
        }
        throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      }
      setRated(true);
      setRatingNextAt(Number(d.next_at || Date.now() + 20 * 60 * 60 * 1000));
      setTerritory(v => ({ ...v, my_rating: { rated: true, next_at: Number(d.next_at || Date.now() + 20 * 60 * 60 * 1000), values: d.values || myRating }, curator: Number(d.curator ?? v.curator), community: Number(d.community ?? v.community), votes: Number(d.votes ?? v.votes) }));
      flash('Оценка сохранена');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось сохранить оценку')); }
  }

  async function addComment() {
    const text = newComment.trim();
    if (!text || !hasNickname) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, territoryId: t.id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setNewComment('');
      const c = await fetch(`${API_BASE}/api/comments?territoryId=${encodeURIComponent(t.id)}`);
      const cd = await c.json().catch(() => null);
      if (cd.ok) setTerritory(v => ({ ...v, reviews: cd.comments || [] }));
      flash('Отзыв опубликован');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось отправить отзыв')); }
  }

  async function reply(commentId, text) {
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setTerritory(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === commentId ? { ...x, reply: text } : x) }));
      flash('Ответ сохранён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось сохранить ответ')); }
  }

  async function editComment(id) {
    const text = editingCommentText.trim();
    if (!text) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setTerritory(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, text } : x) }));
      setEditingCommentId(null); setEditingCommentText(''); flash('Комментарий изменён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось изменить комментарий')); }
  }
  async function removeComment(id) {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setTerritory(v => ({ ...v, reviews: (v.reviews || []).filter(x => x.id !== id) }));
      flash('Комментарий удалён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось удалить комментарий')); }
  }
  async function editReply(id) {
    const text = editingReplyText.trim();
    if (!text) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setTerritory(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, reply: text } : x) }));
      setEditingReplyId(null); setEditingReplyText(''); flash('Ответ изменён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось изменить ответ')); }
  }
  async function removeReply(id) {
    if (!window.confirm('Удалить ответ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setTerritory(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, reply: null } : x) }));
      flash('Ответ удалён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось удалить ответ')); }
  }

  return (
    <>
        {canRate && <div className="atlas-panel-reveal" style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 16, padding: 12, marginBottom: 18 }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ваша оценка</div>{rated && ratingNextAt > ratingNow ? <div style={{ display:'flex', alignItems:'center', gap: 6, fontSize:13, color:'var(--theme-color-status-success)' }}><Check size={14} /> Спасибо за оценку, обновить её можно через {formatRatingCooldown(ratingNextAt, ratingNow)}.</div> : <>{CRITERIA.map(c => <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><div style={{ flex: 1 }}><div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)', marginBottom: 4 }}>{c.label}</div><Slider label={c.label} variant={isInspectorRole?'inspector':'player'} min="1" max="5" value={myRating[c.key]} onChange={e => setMyRating(v => ({ ...v, [c.key]: Number(e.target.value) }))} style={{ '--slider-progress': `${((myRating[c.key] - 1) / 4) * 100}%`, '--slider-fill': isInspectorRole ? 'var(--theme-color-status-success)' : 'var(--theme-color-action-primary)' }} /></div><div className="atlas-display" style={{ width: 20, textAlign: 'center', fontSize: 17, fontWeight: 700, color: isInspectorRole ? 'var(--theme-color-status-success)' : 'var(--theme-color-action-primary)' }}>{myRating[c.key]}</div></div>)}<button onClick={saveRating} className="press" style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', background: isInspectorRole ? 'var(--theme-color-status-success)' : 'var(--theme-color-action-primary)', color: isInspectorRole ? 'var(--theme-color-status-success-contrast)' : 'var(--theme-color-action-primary-contrast)', fontWeight: 700 }}>Сохранить оценку</button></>}</div>}
        <SectionTitle icon={<MessageCircle size={15} />} title="Отзывы" count={(t.reviews || []).length} />
        {!isOwner && hasNickname && <div className="atlas-review-compose-row" style={{ display:'flex',alignItems:'stretch',width:'100%',boxSizing:'border-box',gap: 8,margin: '0 0 12px' }}><div style={{flex:1,minWidth:0,marginBottom: 0}}><Field className={isInspectorRole?'atlas-review-compose-field':''} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Оставить отзыв о территории" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:12,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13}} /></div><button onClick={addComment} className="press" style={{width:44,height:44,flex:'0 0 44px',padding: 0,border:isInspectorRole?'1px solid var(--theme-color-status-success-border)':'1px solid var(--theme-color-action-primary-border)',borderRadius:12,background:isInspectorRole?'var(--theme-color-status-success)':'var(--theme-color-action-primary)',color:isInspectorRole?'var(--theme-color-status-success-contrast)':'var(--theme-color-action-primary-contrast)',display:'flex',alignItems:'center',justifyContent:'center'}}><Send size={15} /></button></div>}
        {!hasNickname && !isOwner && <div style={{ fontSize: 12.5, color: 'var(--theme-color-text-muted)', marginBottom: 12 }}>Укажите ник в <button onClick={onGoToProfile} className="press" style={{ background: 'none', border: 'none', color: 'var(--theme-color-action-primary)', padding: 0, fontSize: 12.5, fontWeight: 600 }}>профиле</button>, чтобы оставлять отзывы.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{(t.reviews || []).map((r, reviewIndex) => {
          const isMyComment = String(r.telegram_id || '') === String(tgUser?.id || '');
          const isResidentReviewer = r.telegram_id != null && (t.resident_telegram_ids || []).some(id => String(id) === String(r.telegram_id));
          return <div key={r.id} className="atlas-review-card" style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 'var(--theme-radius-control)', padding: 'var(--theme-space-3)', animationDelay: `${Math.min(reviewIndex * 24, 144)}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MinecraftText text={r.author || r.telegram_username || 'Пользователь'} style={{fontSize:13,fontWeight:600}}/>
              
              {(r.role === 'inspector' || r.role === 'main_inspector') && <span style={{ fontSize: 10, color: 'var(--theme-color-status-success)', background: 'var(--theme-color-status-success-soft)', border: '1px solid var(--theme-color-status-success)', borderRadius: 999, padding: '2px 6px', fontWeight: 700 }}>Инспектор</span>}
              {isResidentReviewer && <span style={{ fontSize: 10, color: 'var(--theme-color-action-primary)', border: '1px solid var(--theme-color-action-primary)', borderRadius: 999, padding: '2px 6px', fontWeight: 700 }}>Житель</span>}
              {(isMyComment || isMainInspector) && <div style={{ marginLeft: 'auto', display:'flex', gap: 4 }}>
                {isMyComment && !r.reply && <button onClick={()=>{setEditingCommentId(r.id);setEditingCommentText(r.text||'')}} className="press" title="Изменить" style={{border:'none',background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',borderRadius:8,padding: 6}}><Pencil size={15}/></button>}
                {(isMyComment || isMainInspector) && <button onClick={()=>removeComment(r.id)} className="press" title="Удалить" style={{border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:8,padding: 6}}><Trash2 size={15}/></button>}
              </div>}
            </div>
            {editingCommentId===r.id
              ? <div style={{display:'flex',gap: 6,marginBottom: 8}}><Field value={editingCommentText} onChange={e=>setEditingCommentText(e.target.value)} style={{flex:1,fontSize:12.5,padding: '8px 10px'}}/><button onClick={()=>editComment(r.id)} className="press" style={{border:'none',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',borderRadius:9,padding: '0 10px'}}>✓</button></div>
              : <TelegramMinecraftText text={r.text} interactive style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 8 }} />}
            {r.reply && <div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)', background: 'var(--theme-color-surface-raised)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, borderLeft: '2px solid var(--theme-color-status-success)' }}>
              <div style={{display:'flex',alignItems:'center',gap: 6,marginBottom: 4}}><b style={{ color: 'var(--theme-color-status-success)' }}><MinecraftText text={t.owner}/>: </b>{isOwner&&<div style={{marginLeft: 'auto',display:'flex',gap: 4}}><button onClick={()=>{setEditingReplyId(r.id);setEditingReplyText(r.reply||'')}} className="press" title="Изменить" style={{border:'none',background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',borderRadius:8,padding: 6}}><Pencil size={15}/></button><button onClick={()=>removeReply(r.id)} className="press" title="Удалить" style={{border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:8,padding: 6}}><Trash2 size={15}/></button></div>}</div>
              {editingReplyId===r.id ? <div style={{display:'flex',gap: 6}}><Field value={editingReplyText} onChange={e=>setEditingReplyText(e.target.value)} style={{flex:1,fontSize:12,padding: '6px 8px',background:'var(--theme-color-surface-raised)',borderRadius:9}}/><button onClick={()=>editReply(r.id)} className="press" style={{border:'none',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',borderRadius:8,padding: '0 8px'}}>✓</button></div> : <TelegramMinecraftText text={r.reply} interactive style={{fontSize:12,lineHeight:1.45}} />}
            </div>}
            {isOwner && !r.reply && <ReplyBox onSend={text => reply(r.id, text)} iconBtn={iconBtn} />}
          </div>;
        })}</div>

    </>
  );
}
