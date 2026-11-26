import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';

const EMPTY_TERRITORIES = [];

export function useTerritories({ ui = {} }) {
  const { apiErrorMessage, safeCaughtError, finiteCoordinate } = ui;
  const [territoriesLoading, setTerritoriesLoading] = useState(true);
  const [territoriesHasLoaded, setTerritoriesHasLoaded] = useState(false);
  const territoriesLoadedRef = useRef(false);
  const [territoriesError, setTerritoriesError] = useState(null);
  const [territories, setTerritories] = useState(EMPTY_TERRITORIES);
  const territoriesRef = useRef(EMPTY_TERRITORIES);
  const territoriesRequestRef = useRef(false);
  const territoriesRefreshQueuedRef = useRef(false);
  const [markersReady, setMarkersReady] = useState(false);

  const loadTerritories = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    if (territoriesRequestRef.current) {
      territoriesRefreshQueuedRef.current = true;
      return;
    }
    territoriesRequestRef.current = true;
    // This request fulfils any refresh queued while the app was hidden.
    territoriesRefreshQueuedRef.current = false;
    if (!territoriesLoadedRef.current) setTerritoriesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/territories?view=summary`, {
        headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      const rows = Array.isArray(data) ? data : data?.territories;
      if (!res.ok || data?.ok === false || !Array.isArray(rows)) {
        const message = apiErrorMessage(res, data, 'Не удалось обновить список территорий.');
        setTerritoriesError(message);
        console.warn('Voxygen territories refresh failed', { status: res.status, code: data?.code || 'TERRITORIES_REQUEST_FAILED', requestId: res.headers?.get('X-Request-ID') || null });
        return;
      }
      const degradedAreas = new Set(Array.isArray(data?.degradedAreas) ? data.degradedAreas : []);
      const normalized = rows.map((row, index) => {
        const owner = row.owner ?? row.owner_input ?? 'Неизвестно';
        const coords = row.coords ?? '';
        const previous = territoriesRef.current.find(item => String(item.id) === String(row.id));
        const preservePrevious = (areas, field, value) => areas.some(area => degradedAreas.has(area)) && previous ? previous[field] : value;
        return {
          id: row.id,
          name: row.name || 'Без названия',
          owner,
          coords,
          x: finiteCoordinate(row.x) ?? (50 + ((index * 17) % 30) - 15),
          y: finiteCoordinate(row.y) ?? (50 + ((index * 23) % 30) - 15),
          accent: row.accent || 'var(--theme-color-action-primary)',
          curator: preservePrevious(['inspector_ratings'], 'curator', Number(row.curator ?? 0)),
          community: preservePrevious(['ratings'], 'community', Number(row.community ?? 0)),
          votes: preservePrevious(['ratings'], 'votes', Number(row.votes ?? 0)),
          residents: preservePrevious(['members'], 'residents', Array.isArray(row.residents) ? row.residents : []),
          reviews: preservePrevious(['comments'], 'reviews', Array.isArray(row.reviews) ? row.reviews : []),
          screenshots: preservePrevious(['screenshots'], 'screenshots', Array.isArray(row.screenshots) ? row.screenshots.map(s => ({ ...s, url: s?.url ? (String(s.url).startsWith('http') ? s.url : `${API_BASE}${s.url}`) : s?.url })) : []),
          vox_x: finiteCoordinate(row.vox_x),
          vox_z: finiteCoordinate(row.vox_z),
          owner_telegram_id: row.owner_telegram_id ?? null,
          owner_telegram_username: row.owner_telegram_username || null,
          owner_mc_nickname: row.owner_mc_nickname || null,
          founder_mc_nickname: row.founder_mc_nickname || row.owner_mc_nickname || null,
          marker_url: row.marker_url || null,
          banner_color: row.banner_color || 'none',
          banner_gradient: row.banner_gradient || 'aurora',
          awards: Array.isArray(row.awards) ? row.awards : [],
          resident_count: preservePrevious(['members', 'managers'], 'resident_count', Number(row.resident_count ?? ((row.residents || []).length + (row.managers || []).length))),
          resident_telegram_ids: preservePrevious(['members'], 'resident_telegram_ids', Array.isArray(row.resident_telegram_ids) ? row.resident_telegram_ids : []),
          resident_rows: preservePrevious(['members'], 'resident_rows', Array.isArray(row.resident_rows) ? row.resident_rows : []),
          managers: preservePrevious(['managers'], 'managers', Array.isArray(row.managers) ? row.managers : []),
          manager_telegram_ids: preservePrevious(['managers'], 'manager_telegram_ids', Array.isArray(row.manager_telegram_ids) ? row.manager_telegram_ids : []),
          manager_count: preservePrevious(['managers'], 'manager_count', Number(row.manager_count ?? (Array.isArray(row.managers) ? row.managers.length : 0))),
          is_manager: preservePrevious(['managers'], 'is_manager', Boolean(row.is_manager)),
          recruitment_contact_username: row.recruitment_contact_username || null,
          recruitment_description: row.recruitment_description || '',
          recruitment_enabled: Number(row.recruitment_enabled || 0),
          additional_info: row.additional_info || '',
          is_government: row.is_government === true || Number(row.is_government || 0) === 1,
          my_rating: preservePrevious(['ratings', 'inspector_ratings', 'my_player_rating', 'my_inspector_rating'], 'my_rating', row.my_rating || { rated:false, next_at:null, values:null }),
        };
      });
      territoriesRef.current = normalized;
      setTerritories(normalized);
      territoriesLoadedRef.current = true;
      setTerritoriesHasLoaded(true);
      setTerritoriesError(data?.degraded ? 'Часть данных территорий временно не загрузилась. Повторите обновление.' : null);
      requestAnimationFrame(() => setMarkersReady(true));
    } catch (error) {
      setTerritoriesError(safeCaughtError(error, 'Не удалось обновить список территорий.'));
      console.warn('Voxygen territories refresh failed', { code: 'TERRITORIES_NETWORK_ERROR' });
    } finally {
      territoriesRequestRef.current = false;
      setTerritoriesLoading(false);
      if (territoriesRefreshQueuedRef.current && document.visibilityState !== 'hidden') {
        territoriesRefreshQueuedRef.current = false;
        Promise.resolve().then(() => loadTerritories());
      }
    }
  }, [apiErrorMessage, safeCaughtError, finiteCoordinate]);

  const resetForTelegramIdentity = useCallback(() => {
    setTerritories(EMPTY_TERRITORIES);
    setTerritoriesHasLoaded(false);
    setTerritoriesError(null);
    loadTerritories();
  }, [loadTerritories]);

  return {
    territories,
    territoriesLoading,
    territoriesHasLoaded,
    territoriesError,
    markersReady,
    loadTerritories,
    resetForTelegramIdentity,
  };
}
