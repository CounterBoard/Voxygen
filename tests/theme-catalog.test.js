import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


test('Vox token pack exposes the shared visual contract and legacy aliases', () => {
  const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
  for (const token of [
    '--theme-color-canvas',
    '--theme-color-surface',
    '--theme-font-display',
    '--theme-font-body',
    '--theme-type-display-size',
    '--theme-space-4',
    '--theme-radius-control',
    '--theme-control-height',
    '--theme-slider-track-height',
    '--theme-shadow-high',
    '--theme-backdrop-blur',
    '--theme-motion-modal',
    '--bg:',
    '--surface:',
    '--purple:',
    '--mint:',
    '--mint-strong:',
    '--gem:',
  ]) {
    assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  }
  assert.match(tokens, /prefers-reduced-motion/);
});
