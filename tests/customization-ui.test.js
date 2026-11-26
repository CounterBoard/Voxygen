import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/customization/CustomizationScreen.jsx', import.meta.url), 'utf8');
const palette = readFileSync(new URL('../src/features/customization/VisualColorPicker.jsx', import.meta.url), 'utf8');

test('customization screen is extracted and mounted with its original root-owned inputs', () => {
  assert.match(app, /import \{ CustomizationScreen \} from '\.\/features\/customization\/CustomizationScreen\.jsx'/);
  assert.match(app, /<CustomizationScreen initData=\{window\.Telegram\?\.WebApp\?\.initData \|\| ''\} tgUser=\{tgUser\} role=\{role\} territories=\{territories\} profile=\{profile\} onToast=\{showGlobalToast\} ui=\{\{apiErrorMessage,safeCaughtError,useAnimatedClose,IconButton,Field,readImageData,GemHex,MinecraftText\}\} \/>/);
  assert.doesNotMatch(app, /function CustomizationScreen\(|function VisualEditModal\(|function AchievementFields\(/);
  assert.match(panel, /export function CustomizationScreen\(/);
  assert.match(panel, /function VisualEditModal\(/);
});

test('full and lite customization loads retain authenticated requests and stale-scope guards', () => {
  assert.match(panel, /\/api\/customization\?account=\$\{encodeURIComponent\(requestedScope\)\}/);
  assert.match(panel, /\/api\/customization\?lite=1&account=\$\{encodeURIComponent\(requestedScope\)\}/);
  assert.match(panel, /'X-Telegram-Init-Data':initData/);
  assert.match(panel, /cache:'no-store'/);
  assert.match(panel, /fullLoadVersionRef/);
  assert.match(panel, /balanceLoadVersionRef/);
  assert.match(panel, /currentAccountScopeRef\.current===requestedScope/);
  assert.match(panel, /setAccountScope\('personal'\)/);
});

test('account-balance event and main-inspector achievement recheck preserve their contracts', () => {
  assert.match(panel, /voxygen:currency-changed/);
  assert.match(panel, /\/api\/achievements\/recheck/);
  assert.match(panel, /method:'POST'/);
  assert.match(panel, /body:JSON\.stringify\(\{initData\}\)/);
  assert.match(panel, /if\(!isMain\|\|rechecking\)return/);
});

test('visual creation, editing and catalog visibility keep existing endpoints and payload data', () => {
  assert.match(panel, /\/api\/customization\/items/);
  assert.match(panel, /\/api\/customization\/items\/\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(panel, /method:'PATCH'/);
  assert.match(panel, /\/api\/customization\/items\/visibility/);
  assert.match(panel, /governmentMarker:form\.governmentMarker/);
  assert.match(panel, /achievementInspectorScore:form\.achievementInspectorScore/);
  assert.match(panel, /form\.imageData/);
});

test('purchase and ordering keep idempotent feedback and account-scope data', () => {
  assert.match(panel, /\/api\/customization\/purchase/);
  assert.match(panel, /\/api\/customization\/items\/reorder/);
  assert.match(panel, /\/api\/customization\/tags\/reorder/);
  assert.match(panel, /onToast\?\.\('Недостаточно самоцветов','error'\)/);
  assert.match(panel, /voxygen:currency-changed/);
});

test('shared visual palette and color dot preserve their original values and geometry', () => {
  assert.match(palette, /export const VISUAL_COLORS=\[\['none','none'\],\['red','#EF4444'\]/);
  assert.match(palette, /export function ColorDot\(/);
  assert.match(palette, /width:26,height:26,borderRadius:'50%'/);
  assert.match(panel, /VISUAL_COLORS\.map/);
  assert.match(app, /import \{ ColorDot, VISUAL_COLORS \} from '\.\/features\/customization\/VisualColorPicker\.jsx'/);
  assert.match(app, /VISUAL_COLORS\.filter/);
});
