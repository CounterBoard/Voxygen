import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CATALOG_PATH = new URL('../shared/theme-catalog.js', import.meta.url);
const TOKENS_PATH = new URL('../src/theme/theme-tokens.css', import.meta.url);

export function validateThemeId(value) {
  const id = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
    throw new Error('Theme ID must be 2–32 lowercase letters, digits or hyphens, and start with a letter.');
  }
  if (id === 'vox') throw new Error('"vox" is reserved for the baseline theme.');
  return id;
}

function findCssBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error('Could not find CSS selector: ' + selector);
  const open = css.indexOf('{', start);
  if (open < 0) throw new Error('Malformed CSS block for selector: ' + selector);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, text: css.slice(start, i + 1) };
    }
  }
  throw new Error('Unclosed CSS block for selector: ' + selector);
}

const tokenNames = (block) => new Set(
  [...block.text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]),
);

export function addThemeTokenPack(css, id) {
  id = validateThemeId(id);
  const selector = '.atlas-root[data-theme="' + id + '"]';
  if (css.includes(selector)) throw new Error('A token pack for "' + id + '" already exists.');
  const baseline = findCssBlock(css, '.atlas-root[data-theme="vox"]');
  const clone = baseline.text.replace('.atlas-root[data-theme="vox"]', selector);
  return css.slice(0, baseline.end) + '\n\n' + clone + css.slice(baseline.end);
}

export function addDraftCatalogEntry(catalog, id, name, description = '') {
  id = validateThemeId(id);
  if (new RegExp('^\\s*' + id + ':\\s*Object\\.freeze', 'm').test(catalog)) {
    throw new Error('Theme "' + id + '" already exists in the catalog.');
  }
  const anchor = '\n});\n\n// Only published themes are selectable or accepted by the API.';
  if (!catalog.includes(anchor)) throw new Error('Could not locate the theme catalog insertion point.');
  const safeName = String(name).trim();
  if (!safeName) throw new Error('A display name is required.');
  const quote = (value) => JSON.stringify(String(value));
  const safeDescription = String(description || ('Черновик темы интерфейса Voxygen «' + safeName + '».'));
  const entry = [
    '  ' + id + ': Object.freeze({',
    '    id: ' + quote(id) + ',',
    '    name: ' + quote(safeName) + ',',
    '    version: 1,',
    "    status: 'draft',",
    '    description: ' + quote(safeDescription) + ',',
    '  }),',
  ].join('\n');
  return catalog.replace(anchor, '\n' + entry + anchor);
}

export function publishDraftCatalogEntry(catalog, id) {
  id = validateThemeId(id);
  const escaped = id.replace(/-/g, '\\-');
  const entryPattern = new RegExp('(\\b' + escaped + ':\\s*Object\\.freeze\\(\\{)([\\s\\S]*?)(\\n\\s*\\}\\),)');
  const match = catalog.match(entryPattern);
  if (!match) throw new Error('Theme "' + id + '" is not registered in the catalog.');
  if (!/status:\s*'draft'/.test(match[2])) {
    throw new Error('Theme "' + id + '" is not a draft; only draft themes can be published.');
  }
  const body = match[2].replace(/status:\s*'draft'/, "status: 'active'");
  return catalog.replace(entryPattern, match[1] + body + match[3]);
}

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--name') options.name = args[++i];
    else if (args[i] === '--description') options.description = args[++i];
    else throw new Error('Unknown option: ' + args[i]);
  }
  return options;
}

function createTheme(idValue, args) {
  const id = validateThemeId(idValue);
  const { name, description } = parseOptions(args);
  if (!name?.trim()) throw new Error('Usage: npm run theme:create -- <id> --name "Display name" [--description "..."]');

  const css = readFileSync(TOKENS_PATH, 'utf8');
  const catalog = readFileSync(CATALOG_PATH, 'utf8');
  const nextCss = addThemeTokenPack(css, id);
  const nextCatalog = addDraftCatalogEntry(catalog, id, name, description);
  const baseline = findCssBlock(nextCss, '.atlas-root[data-theme="vox"]');
  const generated = findCssBlock(nextCss, '.atlas-root[data-theme="' + id + '"]');
  const missing = [...tokenNames(baseline)].filter((token) => !tokenNames(generated).has(token));
  if (missing.length) throw new Error('Generated token pack is incomplete: ' + missing.join(', '));

  writeFileSync(TOKENS_PATH, nextCss);
  writeFileSync(CATALOG_PATH, nextCatalog);
  console.log('Created draft theme "' + id + '".');
  console.log('Edit its values in src/theme/theme-tokens.css, then run npm test and npm run build.');
  console.log('When visual QA is complete, publish it with: npm run theme:publish -- ' + id);
}

function publishTheme(idValue) {
  const id = validateThemeId(idValue);
  const css = readFileSync(TOKENS_PATH, 'utf8');
  const catalog = readFileSync(CATALOG_PATH, 'utf8');
  const pack = findCssBlock(css, '.atlas-root[data-theme="' + id + '"]');
  const baseline = findCssBlock(css, '.atlas-root[data-theme="vox"]');
  const missing = [...tokenNames(baseline)].filter((token) => !tokenNames(pack).has(token));
  if (missing.length) throw new Error('Cannot publish "' + id + '": token pack is missing ' + missing.length + ' baseline role(s).');
  execFileSync(process.execPath, ['scripts/check-theme-packs.mjs'], { stdio: 'inherit' });
  const nextCatalog = publishDraftCatalogEntry(catalog, id);
  writeFileSync(CATALOG_PATH, nextCatalog);
  console.log('Published theme "' + id + '". It is now selectable in Voxygen.');
}

export function runThemeCommand(argv) {
  const [command, id, ...args] = argv;
  if (command === 'create') return createTheme(id, args);
  if (command === 'publish') return publishTheme(id);
  throw new Error('Usage: node scripts/theme.mjs <create|publish> <theme-id> [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runThemeCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
