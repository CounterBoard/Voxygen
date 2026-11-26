import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { Trash2, Users } from 'lucide-react';

export function ManagedInspectorsPanel({ initData, onError, onNotice, ui = {} }) {
  const { Field, apiErrorMessage, safeCaughtError } = ui;
  const [inspectors, setInspectors] = useState([]);
  const [inspectorInput, setInspectorInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadInspectors() {
    try {
      setLoading(true);
      const r = await fetch(`${API_BASE}/api/inspectors/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
        cache: 'no-store',
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      setInspectors(d.inspectors || []);
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось загрузить инспекторов'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initData) loadInspectors();
  }, [initData]);

  async function add() {
    const value = inspectorInput.trim();
    if (!value) {
      onError?.('Укажите username или Telegram ID.');
      return;
    }
    const numeric = /^\d+$/.test(value);
    try {
      setSaving(true);
      onError?.('');
      const r = await fetch(`${API_BASE}/api/inspectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          telegramId: numeric ? value : null,
          username: numeric ? null : value,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      setInspectorInput('');
      onNotice?.('Инспектор добавлен');
      loadInspectors();
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось добавить инспектора'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить этого инспектора?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/inspectors/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      onNotice?.('Инспектор удалён');
      loadInspectors();
    } catch (e) {
      onError?.(safeCaughtError(e, 'Не удалось удалить инспектора'));
    }
  }

  return (
    <div style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 'var(--theme-radius-card)', padding: 'var(--theme-space-4)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Users size={16} color="var(--theme-color-status-warning)" />
        <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Инспекторы</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--theme-color-text-muted)' }}>{inspectors.length}</span>
      </div>
      <Field value={inspectorInput} onChange={e => setInspectorInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="Username или Telegram ID" style={{ marginBottom: 8 }} />
      <button onClick={add} disabled={saving} className="press" style={{ width: '100%', border: 'none', borderRadius: 10, padding: '10px 12px', background: 'var(--theme-color-status-warning)', color: 'var(--theme-color-status-warning-contrast)', fontWeight: 700 }}>{saving ? 'Добавление…' : 'Добавить инспектора'}</button>
      {loading ? null : inspectors.map(inspector => (
        <div key={inspector.telegram_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--theme-color-border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{inspector.telegram_username ? `@${String(inspector.telegram_username).replace(/^@/, '')}` : 'Username не указан'}</div>
            <div style={{ fontSize: 11, color: 'var(--theme-color-text-muted)' }}>Telegram ID: {inspector.telegram_id}</div>
          </div>
          <button onClick={() => remove(inspector.telegram_id)} className="press" style={{ border: 'none', background: 'var(--theme-color-status-danger-soft)', color: 'var(--theme-color-status-danger)', borderRadius: 9, padding: 8 }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}
