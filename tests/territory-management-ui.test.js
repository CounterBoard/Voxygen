import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/territory-management/CityManagementProfile.jsx', import.meta.url), 'utf8');

test('territory management module retains the editable and resident read-only root mounts', () => {
  assert.match(app, /import \{ CityManagementProfile \} from '\.\/features\/territory-management\/CityManagementProfile\.jsx'/);
  assert.match(app, /managerCities\.map\(city=><CityManagementProfile[\s\S]*?onChanged=\{onTerritoriesChanged\} ui=\{\{apiErrorMessage,safeCaughtError,SurfaceCard,MinecraftText,TelegramMinecraftText,TextAreaField,Field,AvatarHead,InventoryGrid,TerritoryAwardIcon,FixedToast,iconBtn\}\}\/?>\)/);
  assert.match(app, /residentCities\.map\(city=><CityManagementProfile[\s\S]*?readOnly onChanged=\{onTerritoriesChanged\} ui=\{\{apiErrorMessage,safeCaughtError,SurfaceCard,MinecraftText,TelegramMinecraftText,TextAreaField,Field,AvatarHead,InventoryGrid,TerritoryAwardIcon,FixedToast,iconBtn\}\}\/?>\)/);
  assert.doesNotMatch(app, /function CityManagementProfile\(|function RecruitmentManagement\(/);
  assert.match(panel, /export function CityManagementProfile\(/);
  assert.match(panel, /function RecruitmentManagement\(/);
});

test('management and inventory initial loads retain authenticated GET contracts', () => {
  assert.match(panel, /\/api\/city\/management\?territoryId=\$\{encodeURIComponent\(territory\.id\)\}/);
  assert.match(panel, /\/api\/customization\?scope=profile&territoryId=\$\{encodeURIComponent\(territory\.id\)\}/);
  assert.match(panel, /'X-Telegram-Init-Data':initData/);
  assert.match(panel, /cache:'no-store'/);
  assert.match(panel, /Promise\.all\(\[fetch/);
});

test('banner preview retains optimistic update and rollback with the same payload pair', () => {
  const start = panel.indexOf('async function changeBannerColor(value)');
  const end = panel.indexOf('async function rename()', start);
  const handler = panel.slice(start, end);
  const optimistic = handler.indexOf('setInventory(current=>current?{...current,...next}:current)');
  const request = handler.indexOf('/api/customization/city');
  const rollback = handler.indexOf('setInventory(current=>current?{...current,...previous}:current)');
  assert.ok(optimistic >= 0 && request > optimistic);
  assert.ok(rollback > request);
  assert.match(handler, /bannerColor:next\.bannerColor,bannerGradient:next\.bannerGradient/);
});

test('marker equipment, award slots and conflict feedback keep their API contracts', () => {
  assert.match(panel, /markerItemId:nextId/);
  assert.match(panel, /\/api\/customization\/city\/award/);
  assert.match(panel, /awardId:award\.id/);
  assert.match(panel, /response\.status===409/);
  assert.match(panel, /Максимум 4 награды на странице территории/);
  assert.match(panel, /setInventory\(v=>v\?\{\.\.\.v,equippedMarkerItemId:nextId\}:v\)/);
});

test('generic management mutations and recruitment updates retain their endpoint payloads', () => {
  for (const route of [
    '/api/admin/territories/rename',
    '/api/city/additional-info',
    '/api/city/invite',
    '/api/city/remove-resident',
    '/api/city/promote-resident',
    '/api/city/demote-manager',
    '/api/city/invite/cancel',
    '/api/request-inspector-rating',
    '/api/recruitment/contact',
    '/api/recruitment',
  ]) assert.ok(panel.includes(route), `Missing management route ${route}`);
  assert.match(panel, /JSON\.stringify\(\{initData,\.\.\.body\}\)/);
  assert.match(panel, /recruitmentUsername:territory\.recruitment_username\|\|territory\.recruitment_contact_username\|\|''/);
});

test('resident leave stays confirmed, authenticated and available in read-only mode', () => {
  assert.match(panel, /if\(!readOnly\|\|leaveBusy\|\|!window\.confirm/);
  assert.match(panel, /\/api\/city\/leave/);
  assert.match(panel, /territoryId:String\(territory\.id\)/);
  assert.match(panel, /await onChanged\?\.\(\)/);
});

test('recruitment editor preserves read-only text and publish/hide controls', () => {
  const start = panel.indexOf('function RecruitmentManagement(');
  const end = panel.indexOf('export function CityManagementProfile(', start);
  const recruitment = panel.slice(start, end);
  assert.match(recruitment, /readOnly\?/);
  assert.match(recruitment, /Дополнительный текст объявления/);
  assert.match(recruitment, /save\(true\)/);
  assert.match(recruitment, /save\(false\)/);
  assert.match(recruitment, /Объявление опубликовано/);
  assert.match(recruitment, /Объявление скрыто/);
});
