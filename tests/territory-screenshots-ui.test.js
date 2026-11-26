import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/features/territory-details/TerritoryDetail.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/territory-details/TerritoryScreenshotsPanel.jsx', import.meta.url), 'utf8');

test('territory detail delegates screenshot gallery and upload controls to the feature module', () => {
  assert.match(app, /import \{ TerritoryScreenshotsPanel \} from '\.\/features\/territory-details\/TerritoryScreenshotsPanel\.jsx'/);
  assert.match(app, /<TerritoryScreenshotsPanel[\s\S]*?approved=\{approved\}[\s\S]*?territoryId=\{t\.id\}[\s\S]*?onTerritoryChange=\{setT\}[\s\S]*?onOpenShot=/);
  assert.doesNotMatch(app, /function compressScreenshotFile\(|async function handleFile\(e\)|async function deleteShot\(id\)/);
  assert.match(panel, /export function TerritoryScreenshotsPanel\(/);
});

test('screenshot upload keeps compression settings, multipart fields and Telegram header', () => {
  assert.match(panel, /const max = 1280/);
  assert.match(panel, /'image\/jpeg', 0\.70/);
  assert.match(panel, /new File\(\[blob\], name, \{ type: 'image\/jpeg' \}\)/);
  assert.match(panel, /\/api\/screenshots/);
  assert.match(panel, /fd\.append\('territoryId', territoryId\)/);
  assert.match(panel, /fd\.append\('photo', prepared, prepared\.name\)/);
  assert.match(panel, /fd\.append\('initData', initData\)/);
  assert.match(panel, /'X-Telegram-Init-Data': initData/);
});

test('screenshot delete keeps its endpoint, JSON payload and parent state/lightbox callbacks', () => {
  assert.match(panel, /\/api\/screenshots\/\$\{id\}/);
  assert.match(panel, /method: 'DELETE'/);
  assert.match(panel, /JSON\.stringify\(\{ initData \}\)/);
  assert.match(panel, /onTerritoryChange\?\.\(v => \(\{ \.\.\.v, screenshots:/);
  assert.match(panel, /onCloseLightbox\?\.\(\)/);
  assert.match(panel, /onFlash\?\.\('Скрин удалён'\)/);
});

test('screenshot upload and delete permissions retain the existing role rules', () => {
  assert.match(panel, /const canDeleteShot = isMainInspector \|\| \(!isGovernment && isOwner\)/);
  assert.match(panel, /hasNickname && \(!isOwner \|\| isGovernment\)/);
  assert.match(panel, /isGovernment \? 'Скрин опубликован' : 'Скрин отправлен основателю\/мэру на одобрение'/);
});

test('screenshot thumbnails continue to open through the parent-owned lightbox', () => {
  assert.match(panel, /onOpenShot\?\.\(approved\.findIndex\(item => item\.id === shot\.id\), shot\)/);
  assert.match(app, /<Lightbox shots=\{approved\} index=\{lightboxIndex\} mode="view"/);
});
