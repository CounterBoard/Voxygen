import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const upload = readFileSync(new URL('../src/features/world-map/MapUploadPanel.jsx', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/features/WORLD_MAP.md', import.meta.url), 'utf8');

test('map upload and publication workflow is isolated from the application shell', () => {
  assert.match(app, /import \{ WorldMapUploadPanel \} from '\.\/features\/world-map\/MapUploadPanel\.jsx'/);
  assert.match(app, /<WorldMapUploadPanel initData=\{initData\} onMapSaved=\{onMapSaved\}/);
  assert.doesNotMatch(app, /async function saveMap\(file\)/);
  assert.doesNotMatch(app, /MAP_PUBLICATION_STORAGE_KEY/);
  assert.match(upload, /export function WorldMapUploadPanel\(/);
});

test('map uploads preserve file validation, request headers and progress feedback', () => {
  for (const token of [
    '90_000_000', "new Set(['image/png', 'image/jpeg', 'image/webp'])",
    'dimensions.width !== dimensions.height', "xhr.open('POST', `${API_BASE}/api/map`, true)",
    "xhr.setRequestHeader('X-Telegram-Init-Data', initData)",
    "xhr.setRequestHeader('X-Map-Size', String(file.size))",
    'xhr.timeout = 600000', 'xhr.upload.onprogress', 'xhr.send(file)',
  ]) assert.ok(upload.includes(token), `missing upload contract: ${token}`);
});

test('publication waits for the uploaded version and persists recovery across reloads', () => {
  for (const token of [
    'voxygen:map-publication-pending', 'manifest?.mapVersion === expectedVersion',
    "['deepzoom', 'url-grid']", 'coordinateGeometryMatchesManifest(source.coordinateSystem)',
    'preview.decode()', 'localStorage.removeItem(MAP_PUBLICATION_STORAGE_KEY)',
    'localStorage.setItem(MAP_PUBLICATION_STORAGE_KEY',
    'publicationGenerationRef.current += 1',
  ]) assert.ok(upload.includes(token), `missing publication contract: ${token}`);
  assert.match(docs, /Publication flow/);
});
