import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';

export function useTelegramProfile({ initialTelegramId, onTelegramIdentityChanged, ui = {} }) {
  const { apiErrorMessage, safeCaughtError, parseApiResponse } = ui;
  const [role, setRole] = useState('user');
  const [profile, setProfile] = useState(() => ({ nickname: '', status: 'none' }));
  const [profileLoadState, setProfileLoadState] = useState('loading');
  const [profileLoadError, setProfileLoadError] = useState(null);
  const profileLoadedOnceRef = useRef(false);
  const profileRequestRef = useRef(false);
  const profileRequestInitDataRef = useRef('');
  const profileAbortRef = useRef(null);
  const profileRequestVersionRef = useRef(0);
  const activeTelegramIdRef = useRef(String(initialTelegramId || ''));
  const identityChangeCallbackRef = useRef(onTelegramIdentityChanged);
  identityChangeCallbackRef.current = onTelegramIdentityChanged;

  const refreshProfile = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
      const message = 'Откройте Voxygen через Telegram, чтобы проверить профиль.';
      setProfileLoadError(message);
      if (!profileLoadedOnceRef.current) setProfileLoadState('error');
      return;
    }
    if (profileRequestRef.current && profileRequestInitDataRef.current === initData) return;
    if (profileRequestRef.current && profileRequestInitDataRef.current !== initData) profileAbortRef.current?.abort();

    const requestVersion = ++profileRequestVersionRef.current;
    const controller = new AbortController();
    profileAbortRef.current = controller;
    profileRequestRef.current = true;
    profileRequestInitDataRef.current = initData;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);

    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => null);
      if (requestVersion !== profileRequestVersionRef.current) return;
      if (!res.ok || !data?.ok) {
        const message = apiErrorMessage(res, data, 'Не удалось проверить профиль. Повторите попытку.');
        setProfileLoadError(message);
        if (!profileLoadedOnceRef.current) setProfileLoadState('error');
        console.warn('Voxygen profile refresh failed', { status: res.status, code: data?.code || 'PROFILE_REQUEST_FAILED', requestId: res.headers?.get('X-Request-ID') || null });
        return;
      }

      setRole(data.role || 'user');
      const responseUserId = String(data.user?.id || '');
      if (responseUserId && activeTelegramIdRef.current && responseUserId !== activeTelegramIdRef.current) {
        activeTelegramIdRef.current = responseUserId;
        identityChangeCallbackRef.current?.();
      } else if (responseUserId) {
        activeTelegramIdRef.current = responseUserId;
      }

      if (data.profile) {
        const nextProfile = {
          nickname: data.profile.mc_nickname || '',
          status: data.profile.status || 'none',
          skinUrl: data.profile.skin_url || null,
          xuid: data.profile.xuid || null,
          skinTextureId: data.profile.skin_texture_id || null,
          city: data.city || null,
        };
        setProfile(nextProfile);
        if (nextProfile.status === 'verified' && nextProfile.nickname) setProfileLoadState('verified');
        else if (!nextProfile.nickname) setProfileLoadState('needs_nickname');
        else setProfileLoadState('loaded');
      } else if (data.role === 'inspector' || data.role === 'main_inspector') {
        setProfile({ nickname: '', status: 'verified', skinUrl: null, city: data.city || null });
        setProfileLoadState('verified');
      } else {
        // Only a successful /api/me response with an empty profile authorizes
        // the nickname-claim flow. Errors never fall through to this state.
        setProfile({ nickname: '', status: 'none', skinUrl: null, city: data.city || null });
        setProfileLoadState('needs_nickname');
      }
      profileLoadedOnceRef.current = true;
      setProfileLoadError(null);
    } catch (error) {
      if (requestVersion !== profileRequestVersionRef.current) return;
      if (error?.name === 'AbortError' && !timedOut) return;
      const message = error?.name === 'AbortError' && timedOut
        ? 'Сервер отвечает дольше обычного. Повторите попытку.'
        : safeCaughtError(error, 'Не удалось проверить профиль. Повторите попытку.');
      setProfileLoadError(message);
      if (!profileLoadedOnceRef.current) setProfileLoadState('error');
      console.warn('Voxygen profile refresh failed', { code: timedOut ? 'PROFILE_TIMEOUT' : 'PROFILE_NETWORK_ERROR' });
    } finally {
      clearTimeout(timeout);
      if (requestVersion === profileRequestVersionRef.current) {
        profileRequestRef.current = false;
        profileAbortRef.current = null;
        profileRequestInitDataRef.current = '';
      }
    }
  }, [apiErrorMessage, safeCaughtError]);

  const claimNickname = useCallback(async raw => {
    const nick = (raw || '').trim();
    if (!nick) return { ok: false, message: 'Введите ник.' };
    try {
      const initData = window.Telegram?.WebApp?.initData || '';
      if (!initData) return { ok: false, message: 'Откройте приложение через Telegram.' };
      const res = await fetch(`${API_BASE}/api/profile/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, initData }),
      });
      const data = await parseApiResponse(res, 'Не удалось отправить заявку на никнейм.');
      setProfile(prev => ({ ...prev, nickname: nick, status: data.status || 'pending' }));
      setProfileLoadState(data.status === 'verified' ? 'verified' : 'loaded');
      setProfileLoadError(null);
      profileLoadedOnceRef.current = true;
      return { ok: true };
    } catch (error) {
      return { ok: false, message: safeCaughtError(error, 'Не удалось отправить заявку.') };
    }
  }, [parseApiResponse, safeCaughtError]);

  useEffect(() => {
    refreshProfile();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshProfile(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refreshProfile, 60000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshProfile]);

  return {
    role,
    profile,
    profileLoadState,
    profileLoadError,
    refreshProfile,
    claimNickname,
  };
}
