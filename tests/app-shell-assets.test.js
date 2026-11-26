import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const appShellStyles = readFileSync(new URL('../src/theme/app-shell.css', import.meta.url), 'utf8');
const gemIcon = readFileSync(new URL('../src/assets/gem-icon.png', import.meta.url));

test('global theme styles are loaded once from the Vite entry point before the app', () => {
  const tokensImport = main.indexOf("import './theme/theme-tokens.css';");
  const appShellImport = main.indexOf("import './theme/app-shell.css';");
  const appImport = main.indexOf("import App from './App.jsx';");

  assert.notEqual(tokensImport, -1, 'theme tokens must be imported by src/main.jsx');
  assert.notEqual(appShellImport, -1, 'global app-shell styles must be imported by src/main.jsx');
  assert.notEqual(appImport, -1, 'the React app must be imported by src/main.jsx');
  assert.ok(tokensImport < appShellImport, 'theme tokens must load before app-shell styles');
  assert.ok(appShellImport < appImport, 'global styles must load before the React app');
});

test('the gem icon is a bundled PNG asset rather than an embedded data URL', () => {
  assert.match(app, /import gemIconUrl from ['"]\.\/assets\/gem-icon\.png['"]/);
  assert.doesNotMatch(app, /GEM_ICON_DATA_URL|data:image\/png;base64,/);

  const gemHexStart = app.indexOf('function GemHex()');
  const bottomNavStart = app.indexOf('function BottomNav(', gemHexStart);
  assert.ok(gemHexStart >= 0, 'GemHex component must exist');
  assert.ok(bottomNavStart > gemHexStart, 'GemHex component boundary must be found');
  assert.match(app.slice(gemHexStart, bottomNavStart), /src=\{gemIconUrl\}/);

  assert.equal(gemIcon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'gem icon must be a valid PNG');
  assert.ok(gemIcon.readUInt32BE(16) > 0, 'PNG width must be positive');
  assert.ok(gemIcon.readUInt32BE(20) > 0, 'PNG height must be positive');
});

test('global shell styling lives in the standalone CSS file, not a runtime style tag in App', () => {
  assert.doesNotMatch(app, /<style(?:\s|>)/, 'App must not reintroduce a static style block');
  assert.match(appShellStyles, /\.atlas-root\s*\{/);
  assert.match(appShellStyles, /@media/);
  assert.match(appShellStyles, /prefers-reduced-motion:\s*reduce/);
});
