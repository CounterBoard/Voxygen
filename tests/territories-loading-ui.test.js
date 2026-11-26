import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/features/territories/useTerritories.js', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../docs/features/TERRITORY_DATA.md', import.meta.url), 'utf8');

test('the app delegates territory summary ownership and refresh behavior to the feature hook', () => {
  assert.ok(app.includes("import { useTerritories } from './features/territories/useTerritories.js';"));
  assert.ok(app.includes('} = useTerritories({'));
  assert.ok(app.includes('resetTerritoriesForIdentityRef.current = resetForTelegramIdentity'));
  assert.doesNotMatch(app, /async function loadTerritories\(/);
  assert.doesNotMatch(app, /territoriesRequestRef|territoriesRefreshQueuedRef|territoriesLoadedRef/);
});

test('the summary request keeps Telegram authentication, no-store caching and both supported response envelopes', () => {
  assert.ok(hook.includes('/api/territories?view=summary'));
  assert.ok(hook.includes("'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''"));
  assert.ok(hook.includes("cache: 'no-store'"));
  assert.ok(hook.includes('Array.isArray(data) ? data : data?.territories'));
  assert.ok(hook.includes("apiErrorMessage(res, data, 'Не удалось обновить список территорий.')"));
});

test('territory normalization retains the fields consumed by map, profile, awards and detail screens', () => {
  for (const field of [
    'id:', 'name:', 'owner:', 'coords:', 'accent:', 'curator:', 'community:', 'votes:',
    'residents:', 'reviews:', 'screenshots:', 'vox_x:', 'vox_z:', 'owner_telegram_id:',
    'owner_telegram_username:', 'owner_mc_nickname:', 'founder_mc_nickname:', 'marker_url:',
    'banner_color:', 'banner_gradient:', 'awards:', 'resident_count:', 'resident_telegram_ids:',
    'resident_rows:', 'managers:', 'manager_telegram_ids:', 'manager_count:', 'is_manager:',
    'recruitment_contact_username:', 'recruitment_description:', 'recruitment_enabled:',
    'additional_info:', 'is_government:', 'my_rating:',
  ]) assert.ok(hook.includes(field), 'missing normalized territory field: ' + field);
  assert.ok(hook.includes('finiteCoordinate(row.x)'));
  assert.ok(hook.includes('finiteCoordinate(row.y)'));
  assert.ok(hook.includes("String(s.url).startsWith('http')"));
  assert.ok(hook.includes('${API_BASE}${s.url}'));
});

test('partial backend responses preserve previous values only for explicitly degraded areas', () => {
  assert.ok(hook.includes('const degradedAreas = new Set(Array.isArray(data?.degradedAreas) ? data.degradedAreas : [])'));
  assert.ok(hook.includes('const previous = territoriesRef.current.find(item => String(item.id) === String(row.id))'));
  assert.ok(hook.includes('areas.some(area => degradedAreas.has(area)) && previous ? previous[field] : value'));
  assert.ok(hook.includes("preservePrevious(['inspector_ratings'], 'curator'"));
  assert.ok(hook.includes("preservePrevious(['ratings'], 'community'"));
  assert.ok(hook.includes("preservePrevious(['members', 'managers'], 'resident_count'"));
});

test('in-flight refreshes are coalesced and queued refreshes run after the current request', () => {
  assert.ok(hook.includes('if (territoriesRequestRef.current)'));
  assert.ok(hook.includes('territoriesRefreshQueuedRef.current = true'));
  assert.ok(hook.includes('territoriesRefreshQueuedRef.current = false'));
  assert.ok(hook.includes('Promise.resolve().then(() => loadTerritories())'));
  assert.ok(hook.includes('territoriesRequestRef.current = false'));
});

test('visibility and periodic refresh behavior remains scoped to the active city-list screen', () => {
  assert.ok(hook.includes("if (document.visibilityState === 'hidden') return"));
  assert.ok(hook.includes("screen === 'cities' && !selectedId"));
  assert.ok(hook.includes("document.addEventListener('visibilitychange', onVisible)"));
  assert.ok(hook.includes('setInterval(() => {'));
  assert.ok(hook.includes('}, 60000)'));
  assert.ok(hook.includes('clearInterval(timer)'));
});

test('Telegram identity reset clears the list and its error before requesting the new identity data', () => {
  assert.ok(hook.includes('const resetForTelegramIdentity = useCallback(() => {'));
  assert.ok(hook.includes('setTerritories(EMPTY_TERRITORIES)'));
  assert.ok(hook.includes('setTerritoriesHasLoaded(false)'));
  assert.ok(hook.includes('setTerritoriesError(null)'));
  assert.ok(hook.includes('loadTerritories();'));
});

test('marker readiness is still delayed until the normalized list has been committed', () => {
  assert.ok(hook.includes('requestAnimationFrame(() => setMarkersReady(true))'));
});

test('feature documentation describes the summary payload, degraded-data preservation and refresh lifecycle', () => {
  assert.match(doc, /GET `\/api\/territories\?view=summary`/);
  assert.match(doc, /degradedAreas/);
  assert.match(doc, /coalesced/);
  assert.match(doc, /60 seconds/);
});
