import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../src/features/world-map/useWorldMap.js', import.meta.url), 'utf8');

test('world map asset loading state is isolated behind the world map feature hook', () => {
  assert.match(app, /import \{ useWorldMap \} from '\.\/features\/world-map\/useWorldMap\.js'/);
  assert.match(app, /const \{ worldMapImage, worldMapSource, worldMapLoading, worldMapError, loadWorldMap, retryWorldMap, onMapSaved \} = useWorldMap\(\{ safeCaughtError \}\)/);
  assert.match(app, /onMapSaved=\{onMapSaved\}/);
  assert.match(app, /mapImage=\{worldMapImage\}/);
  assert.match(app, /mapSource=\{worldMapSource\}/);
  assert.match(app, /mapLoading=\{worldMapLoading\}/);
  assert.match(app, /mapError=\{worldMapError\}/);
  assert.doesNotMatch(app, /mapImageLoadedRef|mapLoadGenerationRef|async function loadWorldMap|function retryWorldMap/);
  assert.match(loader, /export function useWorldMap\(/);
});

test('published manifest loading validates source, geometry and a decoded preview before switching maps', () => {
  assert.match(loader, /world-map\/manifest\.json\?check=/);
  assert.match(loader, /manifest\?\.mapVersion/);
  assert.match(loader, /\['deepzoom', 'url-grid'\]/);
  assert.match(loader, /coordinateGeometryMatchesManifest\(source\.coordinateSystem\)/);
  assert.match(loader, /source\.previewUrl \|\| manifest\.previewUrl/);
  assert.match(loader, /await preloadImage\.decode\(\)/);
  assert.match(loader, /!preloadImage\.naturalWidth \|\| !preloadImage\.naturalHeight/);
  assert.match(loader, /assetBase: MAP_ASSETS_BASE, mapVersion: manifest\.mapVersion/);
});

test('legacy map delivery is used only when the manifest is absent and validates image type', () => {
  assert.match(loader, /manifestResponse\.status !== 404/);
  assert.match(loader, /method: 'HEAD', cache: 'no-store'/);
  assert.match(loader, /\['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  assert.match(loader, /X-Map-Version/);
  assert.match(loader, /\$\{API_BASE\}\/api\/map/);
  assert.match(loader, /setWorldMapSource\(null\)/);
});

test('map loading guards stale requests, exposes retry and adopts newly published maps', () => {
  assert.match(loader, /if \(mapImageLoadedRef\.current\) return/);
  assert.match(loader, /const generation = \+\+mapLoadGenerationRef\.current/);
  assert.match(loader, /if \(!isCurrent\(\)\) return/);
  assert.match(loader, /mapLoadGenerationRef\.current \+= 1/);
  assert.match(loader, /mapImageLoadedRef\.current = false/);
  assert.match(loader, /setWorldMapError\(safeCaughtError\(error, 'Не удалось загрузить карту мира\.'\)\)/);
  assert.match(app, /useEffect\(\(\) => \{ if \(screen === 'cities' && mainTab === 'map'\) loadWorldMap\(\); \}, \[screen, mainTab, loadWorldMap\]\)/);
});
