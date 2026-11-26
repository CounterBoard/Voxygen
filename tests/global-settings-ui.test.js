import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/settings/GlobalSettingsPanel.jsx', import.meta.url), 'utf8');

test('global settings panel is isolated and remains gated by the main-inspector role', () => {
  assert.match(app, /import \{ GlobalSettingsPanel \} from '\.\/features\/settings\/GlobalSettingsPanel\.jsx'/);
  assert.match(app, /globalSettingsOpen&&role==='main_inspector'&&<GlobalSettingsPanel[\s\S]*?ui=\{\{apiErrorMessage,safeCaughtError,useAnimatedClose,IconButton,SelectField,Slider,TextAreaField\}\}/);
  assert.doesNotMatch(app, /function GlobalSettingsPanel\(/);
  assert.match(panel, /export function GlobalSettingsPanel\(/);
  assert.match(panel, /const \{ apiErrorMessage, safeCaughtError, useAnimatedClose, IconButton, SelectField, Slider, TextAreaField \} = ui/);
});

test('global settings load and effective user settings refresh keep their authenticated GET contracts', () => {
  assert.match(panel, /API_BASE\+'\/api\/admin\/global-settings'/);
  assert.match(panel, /headers:\{'X-Telegram-Init-Data':initData\},cache:'no-store'/);
  assert.match(panel, /API_BASE\+'\/api\/user-settings'/);
  assert.match(panel, /onSettingsChanged\?\.\(data\.settings\)/);
  assert.match(panel, /setThemeAccess\(data\.themeAccess&&typeof data\.themeAccess==='object'\?data\.themeAccess:\{\}\)/);
});

test('temporary and permanent global overrides preserve expiry and payload semantics', () => {
  assert.match(panel, /globalExpiryPartsTimestamp\(expiresAtParts,timezoneOffset\)/);
  assert.match(panel, /if\(!permanent&&!expiresAt\)throw new Error\('Выберите корректную дату и время в будущем\.'\)/);
  assert.match(panel, /const payload=\{initData,settings:\{\[key\]:value\},\.\.\.\(permanent\?\{permanent:true\}:\{expiresAt\}\)\}/);
  assert.match(panel, /JSON\.stringify\(payload\)/);
  assert.ok(panel.includes('Применить до даты'))
  assert.ok(panel.includes('Навсегда'))
});

test('theme access keeps username normalization, visibility and refresh behavior', () => {
  assert.ok(panel.includes('split(/[\\\\n,;]+/)'))
  assert.match(panel, /replace\(\/\^@\+\//);
  assert.match(panel, /toLowerCase\(\)/);
  assert.match(panel, /themeAccess:\{themeId,visibility,usernames:names\}/);
  assert.match(panel, /setThemeAccess\(data\.themeAccess\|\|\{\}\)/);
  assert.match(panel, /await refreshEffectiveSettings\(\)/);
  assert.match(panel, /isPrivate\?'public':'private'/);
});

test('clearing overrides uses the existing endpoint payload and local error/retry feedback', () => {
  assert.match(panel, /JSON\.stringify\(\{initData,clear:true,key\}\)/);
  assert.match(panel, /setNotice\(key==='map_zoom'\?'Глобальный масштаб снят':'Глобальная тема снята'\)/);
  assert.match(panel, /Повторить загрузку/);
  assert.match(panel, /setBusy\(true\)/);
  assert.match(panel, /disabled=\{busy\}/);
});

test('global settings overlay preserves its date-time controls and visual controls', () => {
  assert.match(panel, /EventDateTimeFields parts=\{expiresAtParts\}/);
  assert.match(panel, /<Slider label="Масштаб карты"/);
  assert.match(panel, /aria-label="Глобальная тема интерфейса"/);
  assert.match(panel, /aria-label=\{isPrivate\?'Открыть видимость темы':'Закрыть видимость темы'\}/);
  assert.match(panel, /useAnimatedClose\(onClose,175\)/);
});
