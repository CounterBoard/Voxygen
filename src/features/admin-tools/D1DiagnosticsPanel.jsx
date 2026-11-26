import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../config/api.js';

export function MainInspectorD1DiagnosticsPanel({ initData, ui }) {
  const { parseApiResponse, safeCaughtError } = ui;
  const [d1Diagnostics, setD1Diagnostics] = useState(null);
  const [d1DiagnosticsLoading, setD1DiagnosticsLoading] = useState(false);
  const [d1DiagnosticsError, setD1DiagnosticsError] = useState('');
  const [d1ReportCopyText, setD1ReportCopyText] = useState('');
  const [d1ReportCopyNotice, setD1ReportCopyNotice] = useState('');

  async function loadD1Diagnostics() {
    try {
      setD1DiagnosticsLoading(true);
      setD1DiagnosticsError('');
      const response = await fetch(`${API_BASE}/api/admin/diagnostics/d1`, {
        method: 'GET',
        headers: { 'X-Telegram-Init-Data': initData },
        cache: 'no-store',
      });
      const report = await parseApiResponse(response, 'Не удалось проверить базу данных.');
      if (report.readOnly !== true) throw new Error('Диагностика вернула неожиданный формат.');
      setD1Diagnostics(report);
      setD1ReportCopyText('');
      setD1ReportCopyNotice('');
    } catch (error) {
      setD1DiagnosticsError(safeCaughtError(error, 'Не удалось получить read-only отчёт D1.'));
    } finally {
      setD1DiagnosticsLoading(false);
    }
  }

  async function copyD1Diagnostics() {
    if (!d1Diagnostics) return;
    const text = JSON.stringify(d1Diagnostics, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setD1ReportCopyText('');
      setD1ReportCopyNotice('JSON-отчёт скопирован. Его можно отправить для анализа.');
    } catch {
      setD1ReportCopyNotice('Автокопирование недоступно. Выделите текст ниже и скопируйте его вручную.');
      setD1ReportCopyText(text);
    }
  }

  return (
    <div style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 'var(--theme-radius-card)', padding: 'var(--theme-space-4)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShieldCheck size={16} color="var(--theme-color-status-success)" />
        <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Диагностика D1</div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--theme-color-status-success)', fontWeight: 700 }}>ТОЛЬКО ЧТЕНИЕ</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)', lineHeight: 1.45, marginBottom: 10 }}>
        Проверка количества записей, осиротевших связей, статусов и объёма больших полей. Отчёт не удаляет и не изменяет данные.
      </div>
      <button onClick={loadD1Diagnostics} disabled={d1DiagnosticsLoading} className="press" style={{ width: '100%', border: 'none', borderRadius: 10, padding: '10px 12px', background: 'var(--theme-color-status-success)', color: 'var(--theme-color-status-success-contrast)', fontWeight: 700 }}>
        Получить read-only отчёт
      </button>
      {d1DiagnosticsError && <div role="alert" style={{ fontSize: 12, color: 'var(--theme-color-status-danger)', marginTop: 8 }}>{d1DiagnosticsError}</div>}
      {d1Diagnostics && (
        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ color: 'var(--theme-color-text-muted)', marginBottom: 8 }}>Снимок: {new Date(d1Diagnostics.generatedAt).toLocaleString()} · таблиц: {(d1Diagnostics.tables || []).length}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'var(--theme-color-surface-raised)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--theme-color-text-muted)', fontSize: 10 }}>Orphan по территориям</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: (d1Diagnostics.orphanTerritories || []).length ? 'var(--theme-color-status-danger)' : 'var(--theme-color-status-success)' }}>{(d1Diagnostics.orphanTerritories || []).reduce((sum, item) => sum + Number(item.rows || 0), 0)}</div>
            </div>
            <div style={{ background: 'var(--theme-color-surface-raised)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--theme-color-text-muted)', fontSize: 10 }}>Orphan связей</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: (d1Diagnostics.orphanRelations || []).length ? 'var(--theme-color-status-danger)' : 'var(--theme-color-status-success)' }}>{(d1Diagnostics.orphanRelations || []).reduce((sum, item) => sum + Number(item.rows || 0), 0)}</div>
            </div>
            <div style={{ background: 'var(--theme-color-surface-raised)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--theme-color-text-muted)', fontSize: 10 }}>FK нарушения</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: Number(d1Diagnostics.foreignKeyViolations?.count || 0) ? 'var(--theme-color-status-danger)' : 'var(--theme-color-status-success)' }}>{Number(d1Diagnostics.foreignKeyViolations?.count || 0)}</div>
            </div>
            <div style={{ background: 'var(--theme-color-surface-raised)', borderRadius: 10, padding: 10 }}>
              <div style={{ color: 'var(--theme-color-text-muted)', fontSize: 10 }}>Предупреждения отчёта</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{(d1Diagnostics.warnings || []).length}</div>
            </div>
          </div>
          <details style={{ borderTop: '1px solid var(--theme-color-border)', paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Подробности отчёта (JSON)</summary>
            <pre style={{ maxHeight: 340, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 10.5, lineHeight: 1.4, background: 'var(--theme-color-surface-raised)', borderRadius: 9, padding: 8 }}>{JSON.stringify(d1Diagnostics, null, 2)}</pre>
          </details>
          <button onClick={copyD1Diagnostics} className="press" style={{ width: '100%', border: '1px solid var(--theme-color-border)', borderRadius: 10, padding: '8px 12px', marginTop: 10, background: 'var(--theme-color-surface-raised)', color: 'var(--theme-color-text-primary)', fontWeight: 700 }}>Скопировать JSON отчёта</button>
          {d1ReportCopyNotice && <div role="status" style={{ fontSize: 11, color: 'var(--theme-color-text-muted)', marginTop: 6 }}>{d1ReportCopyNotice}</div>}
          {d1ReportCopyText && <textarea readOnly value={d1ReportCopyText} onFocus={event => event.currentTarget.select()} rows={7} aria-label="JSON отчёта D1" style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, background: 'var(--theme-color-surface-raised)', border: '1px solid var(--theme-color-border)', borderRadius: 9, padding: 8, color: 'var(--theme-color-text-primary)', fontSize: 10, lineHeight: 1.4 }} />}
          <div style={{ color: 'var(--theme-color-text-muted)', marginTop: 8 }}>Отчёт не является резервной копией. Перед очисткой нужно проверить результаты и сделать отдельный снимок базы.</div>
        </div>
      )}
    </div>
  );
}
