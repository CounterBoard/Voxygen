import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appShell = app.slice(app.indexOf('export default function CityRatingApp()'));
const hook = readFileSync(new URL('../src/features/settings/useUserSettings.js', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../docs/features/USER_SETTINGS.md', import.meta.url), 'utf8');

test('the root app delegates user settings state and retrieval to the settings hook', () => {
  assert.ok(app.includes("import { useUserSettings } from './features/settings/useUserSettings.js';"));
  assert.ok(app.includes('} = useUserSettings({'));
  assert.doesNotMatch(appShell, /\/api\/user-settings/);
  assert.doesNotMatch(appShell, /settingsRequestVersion|settingsController|timezoneRetryToken|mapZoomPreferenceRef/);
  assert.doesNotMatch(app, /const \[timezoneOffset,setTimezoneOffset\]/);
  assert.doesNotMatch(app, /const \[activeTheme,setActiveTheme\]/);
});

test('the user settings request keeps Telegram authentication, no-store cache and timeout protection', () => {
  assert.ok(hook.includes('${API_BASE}/api/user-settings'));
  assert.ok(hook.includes("'X-Telegram-Init-Data': initData"));
  assert.ok(hook.includes("cache: 'no-store'"));
  assert.ok(hook.includes('signal: controller.signal'));
  assert.ok(hook.includes('new AbortController()'));
  assert.ok(hook.includes('window.setTimeout(() => controller.abort(), 15000)'));
});

test('request cancellation and version checks prevent stale settings responses from updating state', () => {
  assert.ok(hook.includes('let settingsRequestVersion = 0'));
  assert.ok(hook.includes('settingsRequestVersion += 1'));
  assert.ok(hook.includes('settingsController?.abort()'));
  assert.ok(hook.includes('requestVersion !== settingsRequestVersion'));
  assert.ok(hook.includes('cancelled || requestVersion !== settingsRequestVersion'));
  assert.ok(hook.includes('if (settingsController === controller) settingsController = null'));
});

test('settings refresh keeps visibility, 15-second polling and global zoom expiry handling', () => {
  assert.ok(hook.includes("if (cancelled || document.visibilityState === 'hidden') return"));
  assert.ok(hook.includes("document.addEventListener('visibilitychange', onVisible)"));
  assert.ok(hook.includes("if (document.visibilityState === 'visible') loadSettings()"));
  assert.ok(hook.includes('else cancelSettingsRequest()'));
  assert.ok(hook.includes('window.setInterval(loadSettings, 15000)'));
  assert.ok(hook.includes('value.globalOverrides?.mapZoomPercent?.expiresAt'));
  assert.ok(hook.includes('window.setTimeout(loadSettings, Math.min(2147480000'));
  assert.ok(hook.includes('window.clearInterval(intervalTimer)'));
  assert.ok(hook.includes('window.clearTimeout(expiryTimer)'));
});

test('settings apply the current theme, normalized timezone and map zoom with a guarded viewport reset', () => {
  assert.ok(hook.includes('normalizeThemeId(value.theme ?? value.defaultTheme ?? DEFAULT_THEME_ID)'));
  assert.ok(hook.includes('normalizeTimezoneOffset(value.timezone)'));
  assert.ok(hook.includes('normalizeMapZoomPercent(value.mapZoomPercent ?? value.personalMapZoomPercent ?? 88)'));
  assert.ok(hook.includes('mapZoomPreferenceRef.current === null || mapZoomPreferenceRef.current !== nextZoom'));
  assert.ok(hook.includes('setVoxView({ x: 0, y: 0, scale: mapZoomPercentToScale(nextZoom) })'));
  assert.ok(hook.includes('setMapZoomReady(true)'));
});

test('external settings saves share the apply path and timezone retry behavior', () => {
  assert.ok(app.includes('onSettingsSaved={settings=>{applyUserSettings(settings,{markTimezoneReady:true,clearTimezoneError:true});retryUserSettings();}}'));
  assert.ok(app.includes('onSettingsChanged={applyUserSettings}'));
  assert.ok(app.includes('onRetryTimezone={retryUserSettings}'));
  assert.ok(hook.includes('const retryUserSettings = useCallback(() => {'));
  assert.ok(hook.includes('setRetryToken(value => value + 1)'));
});

test('missing Telegram init data and request failures retain their previous readiness and recovery behavior', () => {
  assert.ok(hook.includes("if (!initData) {"));
  assert.ok(hook.includes('setTimezoneReady(true)'));
  assert.ok(hook.includes('setMapZoomReady(true)'));
  assert.ok(hook.includes('Сервер не ответил за 15 секунд. Повторите загрузку настроек.'));
  assert.ok(hook.includes('Создание и редактирование ивентов временно недоступно.'));
  assert.ok(hook.includes("setVoxView(current => current || { x: 0, y: 0, scale: 1 })"));
  assert.ok(hook.includes("setTimezoneLoadError('')"));
});

test('the hook effect remains after profile refresh and its documented boundary matches the implementation', () => {
  assert.ok(app.indexOf('refreshProfile();') < app.indexOf('useUserSettings({'));
  assert.match(doc, /15 seconds/);
  assert.match(doc, /polls every 15 seconds/);
  assert.match(doc, /AbortController/);
  assert.match(doc, /globalOverrides/);
  assert.match(doc, /GlobalSettingsPanel/);
});
