import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/features/territory-details/TerritoryFeedbackPanel.jsx', import.meta.url), 'utf8');

test('territory detail delegates rating and reviews to the dedicated feedback module', () => {
  assert.match(app, /import \{ TerritoryFeedbackPanel \} from '\.\/features\/territory-details\/TerritoryFeedbackPanel\.jsx'/);
  assert.match(app, /<TerritoryFeedbackPanel[\s\S]*?territory=\{t\}[\s\S]*?setTerritory=\{setT\}[\s\S]*?onFlash=\{flash\}/);
  assert.doesNotMatch(app, /function ReplyBox\(|function formatRatingCooldown\(|const CRITERIA =/);
  assert.match(panel, /export function TerritoryFeedbackPanel\(/);
});

test('ratings keep their criteria, retry-at handling, authenticated payload and cooldown', () => {
  assert.match(panel, /const CRITERIA = \[/);
  assert.match(panel, /\/api\/ratings/);
  assert.match(panel, /JSON\.stringify\(\{ initData, territoryId: t\.id, \.\.\.myRating \}\)/);
  assert.match(panel, /if \(d\?\.retryAt\)/);
  assert.match(panel, /setRatingNextAt\(Number\(d\.retryAt\)\)/);
  assert.match(panel, /Date\.now\(\) \+ 20 \* 60 \* 60 \* 1000/);
  assert.match(panel, /setInterval\(\(\) => setRatingNow\(Date\.now\(\)\), 1000\)/);
});

test('review creation retains its POST and refresh GET before updating territory state', () => {
  assert.match(panel, /\/api\/comments/);
  assert.match(panel, /method: 'POST'/);
  assert.match(panel, /territoryId: t\.id, text/);
  assert.match(panel, /\/api\/comments\?territoryId=\$\{encodeURIComponent\(t\.id\)\}/);
  assert.match(panel, /setTerritory\(v => \(\{ \.\.\.v, reviews: cd\.comments \|\| \[\] \}\)\)/);
});

test('review edits, removals and replies preserve their endpoints and confirmations', () => {
  assert.match(panel, /\/api\/comments\/update/);
  assert.match(panel, /\/api\/comments\/delete/);
  assert.match(panel, /\/api\/comments\/reply/);
  assert.match(panel, /method: 'PATCH'/);
  assert.match(panel, /method: 'DELETE'/);
  assert.match(panel, /window\.confirm\('Удалить комментарий\?'\)/);
  assert.match(panel, /window\.confirm\('Удалить ответ\?'\)/);
});

test('role-specific review actions and reply input styling remain in the extracted panel', () => {
  assert.match(panel, /isMyComment \|\| isMainInspector/);
  assert.match(panel, /isOwner && !r\.reply/);
  assert.match(panel, /atlas-review-compose-field/);
  assert.match(panel, /marginBottom: 0/);
  assert.match(panel, /onFlash\?\.\(message\)/);
});
