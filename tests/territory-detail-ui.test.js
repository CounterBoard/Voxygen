import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/features/territory-details/TerritoryDetail.jsx', import.meta.url), 'utf8');

test('the root app delegates selected territory rendering to the feature module', () => {
  assert.ok(app.includes("import { TerritoryDetail } from './features/territory-details/TerritoryDetail.jsx';"));
  assert.ok(app.includes('<TerritoryDetail'));
  assert.ok(app.includes('base={selected}'));
  assert.ok(app.includes('ui={{'));
  assert.ok(app.includes('apiErrorMessage, safeCaughtError'));
  assert.ok(app.includes('DonationModal, FixedToast, SectionTitle, ShotThumb, Slider, Field, iconBtn'));
  assert.doesNotMatch(app, /function TerritoryDetail\\(/);
});

test('the detail module owns the authenticated detail request and stale-request cancellation', () => {
  assert.ok(detail.includes('fetch(`${API_BASE}/api/territories?detail=${encodeURIComponent(territoryId)}`'));
  assert.ok(detail.includes("'X-Telegram-Init-Data': initData"));
  assert.ok(detail.includes("cache: 'no-store'"));
  assert.ok(detail.includes('let cancelled = false;'));
  assert.ok(detail.includes('return () => { cancelled = true; };'));
  assert.ok(detail.includes('detailsAttempt'));
});

test('the territory detail payload keeps its dependent feature fields and screenshot URLs', () => {
  for (const field of ['awards', 'reviews', 'screenshots', 'residents', 'resident_rows', 'resident_telegram_ids', 'managers', 'manager_telegram_ids', 'manager_count', 'is_manager', 'resident_count']) {
    assert.ok(detail.includes(field + ':'), `missing detail payload field: ${field}`);
  }
  assert.ok(detail.includes("String(shot.url).startsWith('http')"));
});

test('territory role rules and child feature ownership remain explicit', () => {
  assert.ok(detail.includes('const isOwner ='));
  assert.ok(detail.includes("role === 'inspector' || role === 'main_inspector'"));
  assert.ok(detail.includes('const canRate = hasNickname && (isInspectorRole || !isOwner)'));
  assert.ok(detail.includes('const isGovernment = Boolean(t.is_government)'));
  assert.ok(detail.includes('<TerritoryScreenshotsPanel'));
  assert.ok(detail.includes('<TerritoryFeedbackPanel'));
  assert.ok(detail.includes('!isGovernment&&<button') || detail.includes('!isGovernment&& <button'));
});

test('shared application primitives cross the feature boundary through the explicit ui adapter', () => {
  assert.ok(detail.includes('ui = {}'));
  assert.ok(detail.includes('apiErrorMessage, safeCaughtError, getBannerGradient, formatTerritoryCoords, formatTerritoryAwardDate'));
  assert.ok(detail.includes('DonationModal, FixedToast, SectionTitle, ShotThumb, Slider, Field, iconBtn'));
  assert.ok(detail.includes('ui={{apiErrorMessage,safeCaughtError,SectionTitle,ShotThumb}}'));
  assert.ok(detail.includes('ui={{apiErrorMessage,safeCaughtError,SectionTitle,Slider,Field,MinecraftText,TelegramMinecraftText,iconBtn}}'));
});