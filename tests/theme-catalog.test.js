import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME_ID,
  THEME_CATALOG,
  VOXYGEN_THEME_IDS,
  isSupportedTheme,
  normalizeThemeId,
} from '../shared/theme-catalog.js';

test('Vox is the registered default theme', () => {
  assert.equal(DEFAULT_THEME_ID, 'vox');
  assert.equal(THEME_CATALOG[DEFAULT_THEME_ID].status, 'active');
  assert.ok(VOXYGEN_THEME_IDS.includes(DEFAULT_THEME_ID));
});

test('theme IDs are normalized before lookup', () => {
  assert.equal(normalizeThemeId(' VOX '), 'vox');
  assert.equal(isSupportedTheme('Vox'), true);
});

test('unknown and malformed themes safely fall back to Vox', () => {
  assert.equal(normalizeThemeId('not-a-theme'), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(null), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('__proto__'), DEFAULT_THEME_ID);
});

test('fallback is accepted only when it is a registered theme', () => {
  assert.equal(normalizeThemeId('missing', 'also-missing'), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('missing', 'vox'), 'vox');
});
