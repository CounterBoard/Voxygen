import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/admin-tools/ManagedInspectorsPanel.jsx', import.meta.url), 'utf8');
const inspectorStart = app.indexOf('function MainInspectorPanel(');
const inspectorEnd = app.indexOf('function MainInspectorManagersModal(', inspectorStart);
const inspector = app.slice(inspectorStart, inspectorEnd);

test('inspector administration is isolated and keeps its original position in the admin screen', () => {
  assert.match(app, /import \{ ManagedInspectorsPanel \} from '\.\/features\/admin-tools\/ManagedInspectorsPanel\.jsx'/);
  assert.match(inspector, /<ManagedInspectorsPanel initData=\{initData\} onError=\{setError\} onNotice=\{setNotice\} ui=\{\{Field,apiErrorMessage,safeCaughtError\}\} \/>/);
  assert.doesNotMatch(inspector, /inspectorInput|setInspectors|loadInspectors|function add\(|function remove\(/);
  assert.match(inspector, /<ManagedInspectorsPanel[\s\S]*?<div[\s\S]*?>[\s\S]*?Города/);
  assert.match(panel, /export function ManagedInspectorsPanel\(/);
});

test('inspector list keeps its original authenticated POST and no-store behavior', () => {
  assert.match(panel, /\/api\/inspectors\/list/);
  assert.match(panel, /method: 'POST'/);
  assert.match(panel, /JSON\.stringify\(\{ initData \}\)/);
  assert.match(panel, /cache: 'no-store'/);
  assert.match(panel, /setInspectors\(d\.inspectors \|\| \[\]\)/);
});

test('adding an inspector preserves username-or-telegram-ID routing and payload shape', () => {
  assert.match(panel, /const numeric = \/\^\\d\+\$\//);
  assert.match(panel, /\/api\/inspectors/);
  assert.match(panel, /telegramId: numeric \? value : null/);
  assert.match(panel, /username: numeric \? null : value/);
  assert.match(panel, /Укажите username или Telegram ID\./);
  assert.match(panel, /onNotice\?\.\('Инспектор добавлен'\)/);
});

test('removing an inspector still requires confirmation and uses the DELETE endpoint', () => {
  assert.match(panel, /window\.confirm\('Удалить этого инспектора\?'\)/);
  assert.match(panel, /\/api\/inspectors\/\$\{id\}/);
  assert.match(panel, /method: 'DELETE'/);
  assert.match(panel, /JSON\.stringify\(\{ initData \}\)/);
  assert.match(panel, /onNotice\?\.\('Инспектор удалён'\)/);
});

test('inspector failures continue to use the shared main-inspector error presentation', () => {
  assert.match(panel, /onError\?\.\(safeCaughtError\(e, 'Не удалось загрузить инспекторов'\)\)/);
  assert.match(panel, /onError\?\.\(safeCaughtError\(e, 'Не удалось добавить инспектора'\)\)/);
  assert.match(panel, /onError\?\.\(safeCaughtError\(e, 'Не удалось удалить инспектора'\)\)/);
  assert.match(panel, /disabled=\{saving\}/);
});
