import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/admin-tools/ManagedUsersPanel.jsx', import.meta.url), 'utf8');
const inspectorStart = app.indexOf('function MainInspectorPanel(');
const inspectorEnd = app.indexOf('function MainInspectorManagersModal(', inspectorStart);
const inspector = app.slice(inspectorStart, inspectorEnd);

test('managed users UI is extracted from the main inspector and mounted in its original position', () => {
  assert.match(app, /import \{ ManagedUsersPanel \} from '\.\/features\/admin-tools\/ManagedUsersPanel\.jsx'/);
  assert.match(inspector, /<ManagedUsersPanel initData=\{initData\} onError=\{setError\} onNotice=\{setNotice\} ui=\{\{Field,MinecraftText,apiErrorMessage,safeCaughtError\}\} \/>/);
  assert.doesNotMatch(inspector, /managedUsers|newMcNickname|newTelegramId|editingUserId|function addUser|function saveUser|function deleteUser/);
  assert.match(inspector, /<WorldMapUploadPanel[\s\S]*?<ManagedUsersPanel[\s\S]*?ЧиВо/);
  assert.match(panel, /export function ManagedUsersPanel\(/);
});

test('managed users preserve list, create and update API contracts', () => {
  assert.match(panel, /\$\{API_BASE\}\/api\/admin\/users/);
  assert.match(panel, /'X-Telegram-Init-Data': initData/);
  assert.match(panel, /cache: 'no-store'/);
  assert.match(panel, /method: 'POST'/);
  assert.match(panel, /JSON\.stringify\(\{ initData, mcNickname: mc, telegramId: tid \}\)/);
  assert.match(panel, /\/api\/admin\/users\/update\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(panel, /JSON\.stringify\(\{ initData, mcNickname: mc, telegramId: Number\(tid\) \}\)/);
});

test('managed user deletion keeps its confirmation, endpoint and shared feedback', () => {
  assert.match(panel, /window\.confirm\('Удалить пользователя из списка\?'\)/);
  assert.match(panel, /\/api\/admin\/users\/delete\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(panel, /JSON\.stringify\(\{ initData \}\)/);
  assert.match(panel, /onError\?\.\(safeCaughtError/);
  assert.match(panel, /onNotice\?\.\('Пользователь удалён'\)/);
  assert.match(panel, /if \(editingUserId === id\) setEditingUserId\(null\)/);
});

test('managed users retain validation, editable fields and operation loading state', () => {
  assert.match(panel, /Number\.isSafeInteger\(tid\)/);
  assert.match(panel, /setEditingUserId\(user\.id\)/);
  assert.match(panel, /setEditingUserId\(null\)/);
  assert.match(panel, /disabled=\{userSaving\}/);
  assert.match(panel, /Пользователь добавлен\. Username появится после входа в Voxygen\./);
  assert.match(panel, /Данные сохранены\. Username обновится после входа пользователя\./);
});
