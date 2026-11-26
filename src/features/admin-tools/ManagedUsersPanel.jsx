import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { Pencil, Trash2, Users } from 'lucide-react';

export function ManagedUsersPanel({ initData, onError, onNotice, ui = {} }) {
  const { Field, MinecraftText, apiErrorMessage, safeCaughtError } = ui;
  const [managedUsers, setManagedUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSaving, setUserSaving] = useState(false);
  const [newMcNickname, setNewMcNickname] = useState('');
  const [newTelegramId, setNewTelegramId] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUser, setEditingUser] = useState({ mcNickname: '', telegramId: '' });

  async function loadUsers() {
    try {
      setUsersLoading(true);
      const r = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { 'X-Telegram-Init-Data': initData },
        cache: 'no-store',
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      setManagedUsers(d.users || []);
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось загрузить пользователей'));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (initData) loadUsers();
  }, [initData]);

  async function addUser() {
    const mc = newMcNickname.trim();
    const tid = Number(newTelegramId.trim());
    if (!mc || !Number.isSafeInteger(tid) || tid <= 0) {
      onError?.('Укажите Minecraft никнейм и корректный Telegram ID');
      return;
    }
    try {
      setUserSaving(true);
      onError?.('');
      const r = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, mcNickname: mc, telegramId: tid }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      setNewMcNickname('');
      setNewTelegramId('');
      onNotice?.(d.user?.telegram_username
        ? `Пользователь добавлен: @${String(d.user.telegram_username).replace(/^@/, '')}`
        : 'Пользователь добавлен. Username появится после входа в Voxygen.');
      await loadUsers();
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось добавить пользователя'));
    } finally {
      setUserSaving(false);
    }
  }

  function startEdit(user) {
    setEditingUserId(user.id);
    setEditingUser({
      mcNickname: user.mc_nickname || '',
      telegramId: user.telegram_id == null ? '' : String(user.telegram_id),
    });
  }

  async function saveUser(id) {
    const mc = editingUser.mcNickname.trim();
    const tid = String(editingUser.telegramId || '').trim();
    if (!mc || !tid) {
      onError?.('Укажите Minecraft никнейм и Telegram ID');
      return;
    }
    try {
      setUserSaving(true);
      onError?.('');
      const r = await fetch(`${API_BASE}/api/admin/users/update/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, mcNickname: mc, telegramId: Number(tid) }),
      });
      let d = null;
      try {
        d = await r.json().catch(() => null);
      } catch {
        throw new Error(`HTTP ${r.status}`);
      }
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      setEditingUserId(null);
      onNotice?.(d.user?.telegram_username
        ? `Данные сохранены: @${String(d.user.telegram_username).replace(/^@/, '')}`
        : 'Данные сохранены. Username обновится после входа пользователя.');
      await loadUsers();
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось сохранить пользователя'));
    } finally {
      setUserSaving(false);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Удалить пользователя из списка?')) return;
    try {
      setUserSaving(true);
      onError?.('');
      const r = await fetch(`${API_BASE}/api/admin/users/delete/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      if (editingUserId === id) setEditingUserId(null);
      onNotice?.('Пользователь удалён');
      await loadUsers();
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось удалить пользователя'));
    } finally {
      setUserSaving(false);
    }
  }

  return (
    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 'var(--theme-space-4)',marginBottom: 12}}>
      <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 12}}><Users size={16} color="var(--theme-color-action-primary)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Пользователи</div><span style={{marginLeft: 'auto',fontSize:11,color:'var(--theme-color-text-muted)'}}>{managedUsers.length}</span></div>
      <Field value={newMcNickname} onChange={e=>setNewMcNickname(e.target.value)} placeholder="Никнейм в Minecraft" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',marginBottom: 8}}/>
      <Field value={newTelegramId} onChange={e=>setNewTelegramId(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Telegram ID" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',marginBottom: 8}}/>
      <button onClick={addUser} disabled={userSaving} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>{userSaving?'Сохранение…':'Добавить пользователя'}</button>
      {usersLoading?null:managedUsers.length===0?<div style={{fontSize:12,color:'var(--theme-color-text-muted)',marginTop: 12}}>Подтверждённых пользователей пока нет.</div>:<div style={{marginTop: 12}}>{managedUsers.map(u=>{
        const editing=editingUserId===u.id;
        return <div key={u.id} style={{padding: '12px 0',borderTop:'1px solid var(--theme-color-border)'}}>
          {editing?<>
            <Field value={editingUser.mcNickname} onChange={e=>setEditingUser(v=>({...v,mcNickname:e.target.value}))} placeholder="Никнейм в Minecraft" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:9,padding: '8px 10px',color:'var(--theme-color-text-primary)',marginBottom: 6}}/>
            <Field value={editingUser.telegramId} onChange={e=>setEditingUser(v=>({...v,telegramId:e.target.value.replace(/\D/g,'')}))} inputMode="numeric" placeholder="Telegram ID" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:9,padding: '8px 10px',color:'var(--theme-color-text-primary)',marginBottom: 6}}/>
            <div style={{display:'flex',gap: 6}}><button onClick={()=>saveUser(u.id)} disabled={userSaving} className="press" style={{flex:1,border:'none',borderRadius:9,padding: '8px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>Сохранить</button><button onClick={()=>setEditingUserId(null)} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:9,padding: '8px 12px',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)'}}>Отмена</button></div>
          </>:<>
            <div style={{display:'flex',alignItems:'flex-start',gap: 8}}><div style={{flex:1,minWidth:0}}><MinecraftText text={u.mc_nickname||'Никнейм не указан'} style={{fontSize:15,fontWeight:700}}/><div style={{fontSize:13,color:'var(--theme-color-text-muted)',marginTop: 2}}>{u.telegram_username?`@${String(u.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div><div style={{fontSize:11,color:'var(--theme-color-text-muted)',marginTop: 4}}>Telegram ID: {u.telegram_id}</div></div><button onClick={()=>startEdit(u)} className="press" style={{border:'none',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-muted)',borderRadius:9,padding: '8px'}} title="Редактировать"><Pencil size={14}/></button><button onClick={()=>deleteUser(u.id)} disabled={userSaving} className="press" style={{border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:9,padding: '8px'}} title="Удалить"><Trash2 size={14}/></button></div>
          </>}
        </div>;
      })}</div>}
    </div>
  );
}
