import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const shellStyles = readFileSync(new URL('../src/theme/app-shell.css', import.meta.url), 'utf8');
const gemPng = readFileSync(new URL('../src/assets/gem-icon.png', import.meta.url));

test('global shell CSS is loaded from the app entry after theme tokens', () => {
  const tokensIndex = entry.indexOf("import './theme/theme-tokens.css'");
  const shellIndex = entry.indexOf("import './theme/app-shell.css'");
  assert.ok(tokensIndex >= 0 && shellIndex > tokensIndex);
  assert.ok(shellStyles.includes('/* Theme values are owned by src/theme/theme-tokens.css. */'));
  assert.match(shellStyles, /\.atlas-root\s*\{/);
  assert.match(shellStyles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function FontsAndTheme('), app.indexOf('\nfunction ', app.indexOf('function FontsAndTheme(') + 10)), /<style>/);
});

test('font loading remains in FontsAndTheme with its existing Google Fonts URLs', () => {
  const start = app.indexOf('function FontsAndTheme(');
  const end = app.indexOf('\nfunction ', start + 10);
  const component = app.slice(start, end);
  assert.match(component, /fonts\.googleapis\.com/);
  assert.match(component, /family=Manrope/);
  assert.match(component, /family=Inter/);
  assert.match(component, /rel="preconnect"/);
  assert.match(component, /rel="stylesheet"/);
});

test('gem icon is bundled as a PNG asset rather than embedded base64 source', () => {
  assert.match(app, /import gemIconUrl from '\.\/assets\/gem-icon\.png'/);
  assert.match(app, /function GemHex\(\)\{return <img src=\{gemIconUrl\}/);
  assert.doesNotMatch(app, /GEM_ICON_DATA_URL|data:image\/png;base64,/);
  assert.ok(gemPng.length > 50 * 1024, 'the extracted PNG should contain the full image payload');
  assert.deepEqual([...gemPng.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(gemPng.toString('ascii', 12, 16), 'IHDR');
  assert.ok(gemPng.readUInt32BE(16) > 0);
  assert.ok(gemPng.readUInt32BE(20) > 0);
  assert.equal(gemPng.readUInt32BE(16), gemPng.readUInt32BE(20), 'the existing gem source is square');
  assert.match(app, /width:18,height:18,objectFit:'contain'/);
});
