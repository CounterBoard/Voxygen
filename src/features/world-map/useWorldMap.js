import { useCallback, useRef, useState } from 'react';
import { API_BASE, MAP_ASSETS_BASE } from '../../config/api.js';
import { coordinateGeometryMatchesManifest } from '../../../shared/world-map-coordinates.js';

export function useWorldMap({ safeCaughtError }) {
  const [worldMapImage, setWorldMapImage] = useState(null);
  const [worldMapSource, setWorldMapSource] = useState(null);
  const [worldMapLoading, setWorldMapLoading] = useState(true);
  const [worldMapError, setWorldMapError] = useState('');
  const mapImageLoadedRef = useRef(false);
  const mapLoadGenerationRef = useRef(0);

  const loadWorldMap = useCallback(async () => {
    if (mapImageLoadedRef.current) return;
    const generation = ++mapLoadGenerationRef.current;
    const isCurrent = () => generation === mapLoadGenerationRef.current;
    setWorldMapLoading(true);
    setWorldMapError('');

    try {
      const manifestResponse = await fetch(`${MAP_ASSETS_BASE}/world-map/manifest.json?check=${Date.now()}`, { cache: 'no-store' });
      if (!isCurrent()) return;

      if (manifestResponse.status !== 404) {
        if (!manifestResponse.ok) throw new Error(`Не удалось проверить манифест карты (HTTP ${manifestResponse.status}).`);
        const manifest = await manifestResponse.json();
        if (!isCurrent()) return;

        const source = manifest?.source;
        if (!manifest?.mapVersion || !source || !['deepzoom', 'url-grid'].includes(source.type)) {
          throw new Error('Опубликованная карта имеет неподдерживаемый формат.');
        }
        if (source.type === 'deepzoom' && (!Number.isFinite(Number(source.width)) || !Number.isFinite(Number(source.height)) || Number(source.width) < 1 || Number(source.height) < 1)) {
          throw new Error('Манифест содержит некорректные размеры растровой карты.');
        }
        if (!coordinateGeometryMatchesManifest(source.coordinateSystem)) {
          throw new Error('Манифест карты содержит несовместимые границы игрового мира.');
        }

        const previewPath = source.previewUrl || manifest.previewUrl;
        if (!previewPath) throw new Error('В манифесте карты отсутствует previewUrl.');
        const previewUrl = /^https?:\/\//i.test(previewPath) ? previewPath : new URL(previewPath, MAP_ASSETS_BASE).href;
        const preloadImage = new Image();
        preloadImage.decoding = 'async';
        preloadImage.fetchPriority = 'high';
        preloadImage.src = previewUrl;

        if (typeof preloadImage.decode === 'function') {
          await preloadImage.decode();
        } else {
          await new Promise((resolve, reject) => {
            if (preloadImage.complete) {
              if (preloadImage.naturalWidth > 0) resolve();
              else reject(new Error('Не удалось загрузить превью карты.'));
              return;
            }
            preloadImage.onload = resolve;
            preloadImage.onerror = () => reject(new Error('Не удалось загрузить превью карты.'));
          });
        }

        if (!isCurrent()) return;
        if (!preloadImage.naturalWidth || !preloadImage.naturalHeight) {
          throw new Error('Превью карты не удалось декодировать.');
        }
        setWorldMapImage(previewUrl);
        setWorldMapSource({ ...source, assetBase: MAP_ASSETS_BASE, mapVersion: manifest.mapVersion });
        mapImageLoadedRef.current = true;
        return;
      }

      // Legacy image delivery is a temporary bridge only while no manifest
      // exists. A present-but-invalid manifest must never be bypassed.
      const probe = await fetch(`${API_BASE}/api/map`, { method: 'HEAD', cache: 'no-store' });
      if (!isCurrent()) return;
      if (!probe.ok) {
        const errorData = await fetch(`${API_BASE}/api/map`, { cache: 'no-store' })
          .then(response => response.json().catch(() => null))
          .catch(() => null);
        if (!isCurrent()) return;
        throw new Error(errorData?.error || `Не удалось получить карту (HTTP ${probe.status}).`);
      }

      const contentType = String(probe.headers.get('Content-Type') || '').toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType.split(';')[0].trim())) {
        throw new Error('GitHub вернул неподдерживаемый формат карты. Загрузите PNG, JPG или WebP.');
      }
      const mapVersion = String(probe.headers.get('X-Map-Version') || '').trim();
      const mapUrl = `${API_BASE}/api/map${mapVersion ? `?v=${encodeURIComponent(mapVersion)}` : ''}`;
      const preloadImage = new Image();
      preloadImage.decoding = 'async';
      preloadImage.fetchPriority = 'high';
      preloadImage.src = mapUrl;

      if (typeof preloadImage.decode === 'function') {
        await preloadImage.decode();
      } else {
        await new Promise((resolve, reject) => {
          if (preloadImage.complete) {
            if (preloadImage.naturalWidth > 0) resolve();
            else reject(new Error('Не удалось загрузить изображение карты.'));
            return;
          }
          preloadImage.onload = resolve;
          preloadImage.onerror = () => reject(new Error('Не удалось загрузить изображение карты.'));
        });
      }

      if (!isCurrent()) return;
      setWorldMapSource(null);
      setWorldMapImage(mapUrl);
      mapImageLoadedRef.current = true;
    } catch (error) {
      if (!isCurrent()) return;
      setWorldMapImage(null);
      setWorldMapSource(null);
      setWorldMapError(safeCaughtError(error, 'Не удалось загрузить карту мира.'));
      console.error('Load world map error:', String(error?.message || error));
    } finally {
      if (isCurrent()) setWorldMapLoading(false);
    }
  }, [safeCaughtError]);

  const retryWorldMap = useCallback(() => {
    mapImageLoadedRef.current = false;
    loadWorldMap();
  }, [loadWorldMap]);

  const onMapSaved = useCallback(map => {
    mapLoadGenerationRef.current += 1;
    mapImageLoadedRef.current = true;
    setWorldMapImage(typeof map === 'string' ? map : map?.image || null);
    setWorldMapSource(typeof map === 'string' ? null : (map?.source || null));
    setWorldMapError('');
    setWorldMapLoading(false);
  }, []);

  return {
    worldMapImage,
    worldMapSource,
    worldMapLoading,
    worldMapError,
    loadWorldMap,
    retryWorldMap,
    onMapSaved,
  };
}
