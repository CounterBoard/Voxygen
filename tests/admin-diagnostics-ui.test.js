import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/admin-tools/D1DiagnosticsPanel.jsx', import.meta.url), 'utf8');

test('D1 diagnostics panel is isolated from the main inspector screen', () => {
  assert.match(app, /import \{ MainInspectorD1DiagnosticsPanel \} from '\.\/features\/admin-tools\/D1DiagnosticsPanel\.jsx'/);
  assert.match(app, /<MainInspectorD1DiagnosticsPanel initData=\{initData\} ui=\{\{parseApiResponse,safeCaughtError\}\} \/>/);
  assert.doesNotMatch(app, /loadD1Diagnostics|copyD1Diagnostics|d1Diagnostics/);
  assert.match(panel, /export function MainInspectorD1DiagnosticsPanel\(/);
  assert.match(panel, /GET/);
  assert.match(panel, /Получить read-only отчёт/);
});

test('D1 diagnostics accepts only a read-only report and never mutates database data', () => {
  assert.match(panel, /report\.readOnly !== true/);
  assert.match(panel, /api\/admin\/diagnostics\/d1/);
  assert.match(panel, /cache: 'no-store'/);
  assert.doesNotMatch(panel, /method: 'POST'|method: 'DELETE'|method: 'PUT'/);
});

test('D1 report details remain inspectable and copy failure has a manual fallback', () => {
  assert.match(panel, /JSON\.stringify\(d1Diagnostics, null, 2\)/);
  assert.match(panel, /Подробности отчёта \(JSON\)/);
  assert.match(panel, /navigator\.clipboard\?\.writeText/);
  assert.match(panel, /Автокопирование недоступно/);
  assert.match(panel, /aria-label="JSON отчёта D1"/);
  assert.match(panel, /Отчёт не является резервной копией/);
});
