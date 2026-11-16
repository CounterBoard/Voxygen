import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addDraftCatalogEntry,
  addThemeTokenPack,
  publishDraftCatalogEntry,
  validateThemeId,
} from '../scripts/theme.mjs';

const css = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../shared/theme-catalog.js', import.meta.url), 'utf8');

function tokenNames(source, id) {
  const selector = '.atlas-root[data-theme="' + id + '"]';
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, 'missing token pack ' + id);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return new Set([...source.slice(start, i + 1).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
      }
    }
  }
  throw new Error('unclosed pack');
}

test('theme IDs are constrained to stable safe slugs', () => {
  assert.equal(validateThemeId('Midnight-Blue'), 'midnight-blue');
  for (const value of ['vox', '1theme', 'bad_theme', 'a', 'theme with spaces', '']) {
    assert.throws(() => validateThemeId(value));
  }
});

test('theme generator clones the complete baseline pack under a new scope', () => {
  const generated = addThemeTokenPack(css, 'midnight');
  assert.deepEqual([...tokenNames(generated, 'midnight')].sort(), [...tokenNames(css, 'vox')].sort());
  assert.throws(() => addThemeTokenPack(generated, 'midnight'), /already exists/);
});

test('theme generator registers drafts and publishing activates them explicitly', async () => {
  const draftCatalog = addDraftCatalogEntry(catalog, 'midnight', 'Midnight', 'Cool dark palette');
  assert.match(draftCatalog, /midnight: Object\.freeze\(\{/);
  assert.match(draftCatalog, /status: 'draft'/);
  const draftModule = await import('data:text/javascript;base64,' + Buffer.from(draftCatalog).toString('base64'));
  assert.equal(draftModule.isSupportedTheme('midnight'), false);
  assert.deepEqual(draftModule.VOXYGEN_THEME_IDS, ['vox']);

  const publishedCatalog = publishDraftCatalogEntry(draftCatalog, 'midnight');
  const publishedModule = await import('data:text/javascript;base64,' + Buffer.from(publishedCatalog).toString('base64'));
  assert.equal(publishedModule.isSupportedTheme('midnight'), true);
  assert.deepEqual(publishedModule.VOXYGEN_THEME_IDS, ['vox', 'midnight']);
  assert.throws(() => publishDraftCatalogEntry(publishedCatalog, 'midnight'), /not a draft/);
});

test('catalog generation rejects duplicate IDs and empty display names', () => {
  const withDraft = addDraftCatalogEntry(catalog, 'midnight', 'Midnight');
  assert.throws(() => addDraftCatalogEntry(withDraft, 'midnight', 'Duplicate'), /already exists/);
  assert.throws(() => addDraftCatalogEntry(catalog, 'midnight', '  '), /required/);
});
