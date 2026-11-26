import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';
import { DEFAULT_THEME_ID, normalizeThemeId } from '../../../shared/theme-catalog.js';
import { mapZoomPercentToScale, normalizeMapZoomPercent } from '../../../shared/world-map-coordinates.js';
import { normalizeTimezoneOffset } from '../events/date-time.js';

export function useUserSettings({ setVoxView, ui = {} }) {
  const { apiErrorMessage } = ui;
  const [activeTheme, setActiveTheme] = useState(DEFAULT_THEME_ID);
  const [mapZoomPercent, setMapZoomPercent] = useState(88);
  const [mapZoomReady, setMapZoomReady] = useState(false);
  const mapZoomPreferenceRef = useRef(null);
  const [timezoneOffset, setTimezoneOffset] = useState('UTC+3');
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [timezoneLoadError, setTimezoneLoadError] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  const applyUserSettings = useCallback((settings, { markTimezoneReady = false, clearTimezoneError = false } = {}) => {
    const value = settings && typeof settings === 'object' ? settings : {};
    setActiveTheme(normalizeThemeId(value.theme ?? value.defaultTheme ?? DEFAULT_THEME_ID));
    const nextZoom = normalizeMapZoomPercent(value.mapZoomPercent ?? value.personalMapZoomPercent ?? 88);
    const zoomPreferenceChanged = mapZoomPreferenceRef.current === null || mapZoomPreferenceRef.current !== nextZoom;
    mapZoomPreferenceRef.current = nextZoom;
    setTimezoneOffset(normalizeTimezoneOffset(value.timezone));
    setMapZoomPercent(nextZoom);
    if (zoomPreferenceChanged) setVoxView({ x: 0, y: 0, scale: mapZoomPercentToScale(nextZoom) });
    setMapZoomReady(true);
    if (markTimezoneReady) setTimezoneReady(true);
    if (clearTimezoneError) setTimezoneLoadError('');
  }, [setVoxView]);

  const retryUserSettings = useCallback(() => {
    setRetryToken(value => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalTimer = null;
    let expiryTimer = null;
    let settingsRequestVersion = 0;
    let settingsController = null;
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
      setTimezoneReady(true);
      setMapZoomReady(true);
      return () => { cancelled = true; };
    }
    setTimezoneReady(false);
    setTimezoneLoadError('');

    const cancelSettingsRequest = () => {
      settingsRequestVersion += 1;
      settingsController?.abort();
      settingsController = null;
    };

    const loadSettings = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const requestVersion = ++settingsRequestVersion;
      settingsController?.abort();
      const controller = new AbortController();
      settingsController = controller;
      const requestTimeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${API_BASE}/api/user-settings`, {
          headers: { 'X-Telegram-Init-Data': initData },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Settings fetch failed (HTTP ${response.status})`);
        const data = await response.json().catch(() => null);
        if (cancelled || requestVersion !== settingsRequestVersion) return;
        if (!response.ok || !data?.ok || !data?.settings) throw new Error(apiErrorMessage(response, data, 'Settings fetch failed'));
        const value = data.settings;
        applyUserSettings(value, { markTimezoneReady: true, clearTimezoneError: true });
        if (expiryTimer !== null) window.clearTimeout(expiryTimer);
        const expiries = [value.globalOverrides?.mapZoomPercent?.expiresAt].map(Number).filter(at => Number.isFinite(at) && at > Date.now());
        if (expiries.length) {
          const nextExpiry = Math.min(...expiries);
          expiryTimer = window.setTimeout(loadSettings, Math.min(2147480000, Math.max(500, nextExpiry - Date.now() + 250)));
        }
      } catch (error) {
        if (cancelled || requestVersion !== settingsRequestVersion) return;
        console.warn('Voxygen settings load failed', error);
        const message = error?.name === 'AbortError'
          ? 'Сервер не ответил за 15 секунд. Повторите загрузку настроек.'
          : 'Не удалось загрузить ваши настройки. Создание и редактирование ивентов временно недоступно.';
        setTimezoneLoadError(message);
        setVoxView(current => current || { x: 0, y: 0, scale: 1 });
        setMapZoomReady(true);
      } finally {
        window.clearTimeout(requestTimeout);
        if (settingsController === controller) settingsController = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSettings();
      else cancelSettingsRequest();
    };
    loadSettings();
    intervalTimer = window.setInterval(loadSettings, 15000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      cancelSettingsRequest();
      if (intervalTimer !== null) window.clearInterval(intervalTimer);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [retryToken, applyUserSettings, apiErrorMessage, setVoxView]);

  return {
    activeTheme,
    mapZoomPercent,
    mapZoomReady,
    timezoneOffset,
    timezoneReady,
    timezoneLoadError,
    applyUserSettings,
    retryUserSettings,
  };
}
