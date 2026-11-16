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


test('Vox token pack exposes the shared visual contract and compatibility aliases', () => {
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
    '--theme-icon-button-size',
    '--theme-type-control-size',
    '--theme-slider-track-height',
    '--theme-shadow-high',
    '--theme-backdrop-blur',
    '--theme-motion-modal',
    '--bg:',
    '--surface:',
    '--purple:',
    '--mint:',
    '--theme-color-status-success-border:',
    '--theme-color-status-warning-border:',
    '--gem:',
  ]) {
    assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  }
  assert.doesNotMatch(tokens, /--mint-strong:/);
  assert.match(tokens, /prefers-reduced-motion/);
});


test('every registered theme has a scoped token pack with core visual roles', () => {
  const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
  const requiredRoles = [
    '--theme-color-canvas:', '--theme-color-surface:', '--theme-color-surface-raised:',
    '--theme-color-text-primary:', '--theme-color-text-secondary:', '--theme-color-border:',
    '--theme-color-action-primary:', '--theme-color-action-primary-contrast:',
    '--theme-color-status-success:', '--theme-color-status-warning:', '--theme-color-status-danger:',
    '--theme-font-display:', '--theme-font-body:', '--theme-type-body-size:',
    '--theme-space-4:', '--theme-radius-card:', '--theme-radius-control:',
    '--theme-control-height:', '--theme-shadow-medium:', '--theme-motion-standard:',
    '--theme-ease-standard:',
  ];
  for (const id of VOXYGEN_THEME_IDS) {
    const selector = new RegExp('\\.atlas-root\\[data-theme="' + id + '"\\]\\s*\\{');
    assert.match(tokens, selector, `Missing scoped token pack for theme: ${id}`);
    const start = tokens.search(selector);
    const nextPack = tokens.indexOf('.atlas-root[data-theme="', start + 1);
    const pack = tokens.slice(start, nextPack < 0 ? tokens.length : nextPack);
    for (const role of requiredRoles) assert.ok(pack.includes(role), `Theme ${id} missing core role ${role}`);
  }
});


test('every registered theme implements the complete baseline token contract', () => {
  const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
  const getPack = (id) => {
    const selector = new RegExp('\\.atlas-root\\[data-theme="' + id + '"\\]\\s*\\{');
    const matches = [...tokens.matchAll(new RegExp(selector.source, 'g'))];
    assert.equal(matches.length, 1, `Expected exactly one token pack for ${id}`);
    const start = matches[0].index;
    const next = tokens.indexOf('.atlas-root[data-theme="', start + 1);
    return tokens.slice(start, next < 0 ? tokens.length : next);
  };
  const names = (pack) => new Set([...pack.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));
  const baseline = names(getPack(DEFAULT_THEME_ID));

  for (const id of VOXYGEN_THEME_IDS) {
    const actual = names(getPack(id));
    const missing = [...baseline].filter((name) => !actual.has(name));
    assert.deepEqual(missing, [], `Theme ${id} is missing baseline tokens`);
  }
});


test('only active catalog entries are exposed as supported theme IDs', () => {
  assert.deepEqual(VOXYGEN_THEME_IDS, Object.keys(THEME_CATALOG).filter((id) => THEME_CATALOG[id].status === 'active'));
  for (const id of VOXYGEN_THEME_IDS) assert.equal(isSupportedTheme(id), true);
});

test('the token reference indexes every declaration in the baseline pack', () => {
  const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
  const reference = readFileSync(new URL('../docs/design-system/THEME_TOKEN_REFERENCE.md', import.meta.url), 'utf8');
  const selector = new RegExp('\\.atlas-root\\[data-theme="' + DEFAULT_THEME_ID + '"\\]\\s*\\{');
  const start = tokens.search(selector);
  const next = tokens.indexOf('.atlas-root[data-theme="', start + 1);
  const pack = tokens.slice(start, next < 0 ? tokens.length : next);
  const names = new Set([...pack.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));
  const missing = [...names].filter((name) => !reference.includes('`' + name + '`'));
  assert.deepEqual(missing, [], 'Token reference is missing baseline declarations');
});

test('the default theme remains active and protected content colors stay outside packs', () => {
  const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
  assert.equal(THEME_CATALOG[DEFAULT_THEME_ID].status, 'active');
  assert.match(tokens, /:root\s*\{[^}]*--content-color-gem:/s);
  assert.doesNotMatch(tokens, /\.atlas-root\[data-theme="[^"]+"\]\s*\{[^}]*--content-color-gem:/s);
});