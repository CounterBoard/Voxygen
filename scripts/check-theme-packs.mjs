import { readFileSync } from 'node:fs';
import { DEFAULT_THEME_ID, THEME_CATALOG, VOXYGEN_THEME_IDS } from '../shared/theme-catalog.js';

const css = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
const selectorFor = (id) => new RegExp('\\.atlas-root\\[data-theme="' + id + '"\\]\\s*\\{');
const declarations = (block) => new Set(
  [...block.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]),
);
const errors = [];
let baselineTokenCount = 0;

const catalogIds = Object.keys(THEME_CATALOG);
const activeCatalogIds = catalogIds.filter((id) => THEME_CATALOG[id].status === 'active');
if (JSON.stringify(activeCatalogIds) !== JSON.stringify(VOXYGEN_THEME_IDS)) {
  errors.push('VOXYGEN_THEME_IDS does not match the active catalog entries.');
}
if (THEME_CATALOG[DEFAULT_THEME_ID]?.status !== 'active') {
  errors.push(`Default theme "${DEFAULT_THEME_ID}" must be active.`);
}
for (const [key, theme] of Object.entries(THEME_CATALOG)) {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(key)) errors.push(`Theme ID "${key}" is not a valid stable slug.`);
  if (theme.id !== key) errors.push(`Catalog key "${key}" does not match theme.id "${theme.id}".`);
  if (!['active', 'draft'].includes(theme.status)) errors.push(`Theme "${key}" has unsupported status "${theme.status}".`);
}

const cssThemeIds = [...css.matchAll(/\.atlas-root\[data-theme="([^"]+)"\]\s*\{/g)].map((match) => match[1]);
for (const id of new Set(cssThemeIds)) {
  if (!Object.prototype.hasOwnProperty.call(THEME_CATALOG, id)) errors.push(`CSS token pack "${id}" is not registered in the catalog.`);
}
for (const id of catalogIds) {
  if (cssThemeIds.filter((candidate) => candidate === id).length !== 1) {
    errors.push(`Theme "${id}" must have exactly one CSS theme selector.`);
  }
}

const defaultId = DEFAULT_THEME_ID;
const defaultSelector = selectorFor(defaultId);
const defaultStart = css.search(defaultSelector);
if (defaultStart < 0) {
  errors.push(`Missing baseline token pack for "${defaultId}".`);
} else {
  const defaultNext = css.indexOf('.atlas-root[data-theme="', defaultStart + 1);
  const baseline = css.slice(defaultStart, defaultNext < 0 ? css.length : defaultNext);
  const baselineTokens = declarations(baseline);
  baselineTokenCount = baselineTokens.size;

  for (const id of Object.keys(THEME_CATALOG)) {
    const selector = selectorFor(id);
    const matches = [...css.matchAll(new RegExp(selector.source, 'g'))];
    if (matches.length !== 1) {
      errors.push(`Theme "${id}" must have exactly one scoped token pack (found ${matches.length}).`);
      continue;
    }

    const start = matches[0].index;
    const next = css.indexOf('.atlas-root[data-theme="', start + 1);
    const pack = css.slice(start, next < 0 ? css.length : next);
    const declaredTokens = [...pack.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]);
    const packTokens = new Set(declaredTokens);
    if (packTokens.size !== declaredTokens.length) errors.push(`Theme "${id}" contains duplicate token declarations.`);
    if (packTokens.has('--content-color-gem')) errors.push(`Theme "${id}" must not override protected content color --content-color-gem.`);
    const missing = [...baselineTokens].filter((token) => !packTokens.has(token));
    if (missing.length) errors.push(`Theme "${id}" is missing ${missing.length} token(s): ${missing.join(', ')}`);
  }
}

if (errors.length) {
  console.error('Theme token-pack validation failed:\n' + errors.map((error) => '- ' + error).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Theme token packs valid: ${Object.keys(THEME_CATALOG).length} registered (${VOXYGEN_THEME_IDS.length} active), ${baselineTokenCount} baseline token declarations.`);
}
