import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const map = readFileSync(new URL('../src/features/world-map/VoxMap.jsx', import.meta.url), 'utf8');

test('world map viewport is isolated from the application shell', () => {
  assert.match(app, /import \{ VoxMap \} from '\.\/features\/world-map\/VoxMap\.jsx'/);
  assert.doesNotMatch(app, /function VoxMap\(/);
  assert.match(app, /mapUtils=\{\{\s*finiteCoordinate, voxWorldToPercent, hasMapOwner/);
  assert.match(map, /export function VoxMap\(/);
  assert.match(map, /mapUtils\.voxWorldToPercent/);
});

test('world map preserves gesture and visible-tile performance contracts', () => {
  for (const token of [
    'onPointerDown={down}', 'onPointerMove={move}', 'onPointerUp={up}',
    'onWheel={wheel}', 'requestAnimationFrame', 'ResizeObserver',
    "['deepzoom', 'url-grid']", 'scheduleTileRefresh',
    '--vox-marker-inverse-scale', 'onViewStateChange',
  ]) assert.ok(map.includes(token), `missing map interaction contract: ${token}`);
});

test('world map feature documentation explains module ownership and invariants', () => {
  const doc = readFileSync(new URL('../docs/features/WORLD_MAP.md', import.meta.url), 'utf8');
  assert.match(doc, /Gesture frames update the existing map layer DOM transform directly/);
  assert.match(doc, /mapUtils/);
});

test('world map runtime helpers and marker dimensions are resolved from their declared owners', () => {
  assert.match(map, /import \\{ MAP_ZOOM_MAX_SCALE, mapZoomPercentToScale \\} from '\\.\\.\\/\\.\\.\\/\\.\\.\\/shared\\/world-map-coordinates\\.js'/);
  assert.match(map, /const MAX_MAP_ZOOM = MAP_ZOOM_MAX_SCALE/);
  assert.match(map, /const defaultScale = mapZoomPercentToScale\\(mapZoomPercent\\)/);
  assert.match(map, /alt=\\{mapUtils\\.stripMinecraftCodes\\(city\\.name\\)\\}/);
  assert.match(map, /width: mapUtils\\.MAP_MARKER_WIDTH, height: mapUtils\\.MAP_MARKER_HEIGHT/);
  assert.doesNotMatch(map, /alt=\\{stripMinecraftCodes\\(city\\.name\\)\\}/);
  assert.doesNotMatch(map, /width: MAP_MARKER_WIDTH/);
  assert.doesNotMatch(map, /height: MAP_MARKER_HEIGHT/);
});
