import React, { useEffect, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { API_BASE } from '../../config/api.js';
import { TerritoryAwardIcon } from '../territory-awards/TelegramSticker.jsx';

export function MainInspectorIssuedAwardsPanel({ initData, onTerritoriesChanged, ui }) {
  const { apiErrorMessage, safeCaughtError, formatTerritoryAwardDate } = ui;
  const [issuedAwards, setIssuedAwards] = useState([]);
  const [issuedAwardsLoading, setIssuedAwardsLoading] = useState(true);
  const [issuedAwardsError, setIssuedAwardsError] = useState('');
  const [issuedAwardDeletingId, setIssuedAwardDeletingId] = useState('');

  async function loadIssuedAwards() {
    try {
      setIssuedAwardsLoading(true);
      setIssuedAwardsError('');
      const response = await fetch(API_BASE + '/api/admin/awards?view=issued', {
        headers: { 'X-Telegram-Init-Data': initData },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(apiErrorMessage(response, data, 'Не удалось загрузить выданные награды.'));
      }
      setIssuedAwards(Array.isArray(data.awards) ? data.awards : []);
    } catch (error) {
      setIssuedAwardsError(safeCaughtError(error, 'Не удалось загрузить выданные награды.'));
    } finally {
      setIssuedAwardsLoading(false);
    }
  }

  useEffect(() => {
    if (!initData) return undefined;
    loadIssuedAwards();
    const refresh = () => loadIssuedAwards();
    window.addEventListener('voxygen:awards-changed', refresh);
    return () => window.removeEventListener('voxygen:awards-changed', refresh);
  }, [initData]);

  async function deleteIssuedAward(award) {
    if (!window.confirm('Удалить награду «' + award.name + '» из города «' + award.territory_name + '»?')) return;
    try {
      setIssuedAwardDeletingId(String(award.id));
      setIssuedAwardsError('');
      const response = await fetch(API_BASE + '/api/admin/awards/' + encodeURIComponent(award.id), {
        method: 'DELETE',
        headers: { 'X-Telegram-Init-Data': initData },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(apiErrorMessage(response, data, 'Не удалось удалить награду.'));
      }
      setIssuedAwards(current => current.filter(item => String(item.id) !== String(award.id)));
      Promise.resolve(onTerritoriesChanged?.()).catch(() => {});
    } catch (error) {
      setIssuedAwardsError(safeCaughtError(error, 'Не удалось удалить награду.'));
    } finally {
      setIssuedAwardDeletingId('');
    }
  }

  return (
    <div style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 'var(--theme-radius-card)', padding: 'var(--theme-space-4)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Star size={16} color="var(--theme-color-status-success)" />
        <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Выданные награды</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--theme-color-text-muted)' }}>{issuedAwards.length}</span>
      </div>
      {issuedAwardsLoading
        ? <div role="status" style={{ fontSize: 12, color: 'var(--theme-color-text-muted)' }}>Загрузка наград…</div>
        : issuedAwards.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)' }}>Пока нет выданных наград.</div>
          : <div style={{ display: 'flex', flexDirection: 'column' }}>
              {issuedAwards.map(award => (
                <div key={award.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderTop: '1px solid var(--theme-color-border)' }}>
                  <TerritoryAwardIcon award={award} size={34} preview={Boolean(award.sticker_thumbnail_file_id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{award.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--theme-color-text-muted)', overflowWrap: 'anywhere' }}>{award.territory_name} · {formatTerritoryAwardDate(award.awarded_at)}</div>
                  </div>
                  <button type="button" onClick={() => deleteIssuedAward(award)} disabled={issuedAwardDeletingId === String(award.id)} aria-label={'Удалить награду ' + award.name} title="Удалить награду" className="press" style={{ width: 34, height: 34, flex: '0 0 34px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 9, background: 'var(--theme-color-status-danger-soft)', color: 'var(--theme-color-status-danger)', opacity: issuedAwardDeletingId === String(award.id) ? 0.5 : 1 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>}
      {issuedAwardsError && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--theme-color-status-danger)', marginTop: 8 }}>
          {issuedAwardsError}
          <button type="button" onClick={loadIssuedAwards} className="press" style={{ marginLeft: 8, border: '1px solid var(--theme-color-border)', borderRadius: 8, padding: '5px 8px', background: 'var(--theme-color-surface-raised)', color: 'var(--theme-color-text-primary)' }}>Повторить</button>
        </div>
      )}
    </div>
  );
}
