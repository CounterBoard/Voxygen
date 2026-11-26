import React, { useEffect, useRef, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { API_BASE, MAP_ASSETS_BASE } from '../../config/api.js';
import { coordinateGeometryMatchesManifest } from '../../../shared/world-map-coordinates.js';

const MAX_MAP_BYTES = 90_000_000;
const SUPPORTED_MAP_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAP_PUBLICATION_STORAGE_KEY = 'voxygen:map-publication-pending';

async function readRasterDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать размеры изображения карты.'));
    };
    image.src = url;
  });
}

export function WorldMapUploadPanel({ initData, onMapSaved, onError, onNotice, safeCaughtError }) {
  const [mapSaving, setMapSaving] = useState(false);
  const [mapProcessing, setMapProcessing] = useState(false);
  const [mapProgress, setMapProgress] = useState(0);
  const fileRef = useRef(null);
  const publicationGenerationRef = useRef(0);

  async function waitForPublishedMap(expectedVersion) {
    const generation = ++publicationGenerationRef.current;
    const deadline = Date.now() + 25 * 60 * 1000;
    while (Date.now() < deadline && generation === publicationGenerationRef.current) {
      try {
        const response = await fetch(`${MAP_ASSETS_BASE}/world-map/manifest.json?check=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const manifest = await response.json();
          const source = manifest?.source;
          if (manifest?.mapVersion === expectedVersion && source && ['deepzoom', 'url-grid'].includes(source.type)) {
            if (source.type === 'deepzoom' && (!Number.isFinite(Number(source.width)) || !Number.isFinite(Number(source.height)) || Number(source.width) < 1 || Number(source.height) < 1)) {
              throw new Error('Манифест содержит некорректные размеры растровой карты.');
            }
            if (!coordinateGeometryMatchesManifest(source.coordinateSystem)) {
              throw new Error('Манифест карты содержит несовместимые границы игрового мира.');
            }
            const previewPath = source.previewUrl || manifest.previewUrl;
            if (!previewPath) throw new Error('В манифесте карты отсутствует previewUrl.');
            const previewUrl = /^https?:\/\//i.test(previewPath) ? previewPath : new URL(previewPath, MAP_ASSETS_BASE).href;
            const preview = new Image();
            preview.decoding = 'async';
            preview.fetchPriority = 'high';
            preview.src = previewUrl;
            if (typeof preview.decode === 'function') await preview.decode();
            else await new Promise((resolve, reject) => {
              preview.onload = resolve;
              preview.onerror = () => reject(new Error('Не удалось загрузить превью карты.'));
            });
            if (!preview.naturalWidth || !preview.naturalHeight) throw new Error('Превью опубликованной карты не удалось декодировать.');
            if (generation !== publicationGenerationRef.current) return false;
            const publishedSource = { ...source, assetBase: MAP_ASSETS_BASE, mapVersion: manifest.mapVersion };
            try { localStorage.removeItem(MAP_PUBLICATION_STORAGE_KEY); } catch {}
            setMapProgress(100);
            onNotice?.('Карта мира обновлена');
            onError?.('');
            onMapSaved?.({ image: previewUrl, source: publishedSource });
            return true;
          }
        }
      } catch (error) {
        if (/некорректные размеры растровой карты|границы игрового мира|previewUrl|превью опубликованной карты/.test(String(error?.message || ''))) throw error;
      }
      await new Promise(resolve => window.setTimeout(resolve, 5000));
    }
    if (generation === publicationGenerationRef.current) {
      onError?.('Исходный файл загружен. Публикация тайлов ещё не завершена; проверка сохранена и продолжится при следующем открытии приложения.');
    }
    return false;
  }

  useEffect(() => {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(MAP_PUBLICATION_STORAGE_KEY) || 'null'); } catch {}
    const version = String(pending?.mapVersion || '').trim();
    if (!version) return undefined;
    setMapSaving(true);
    setMapProcessing(true);
    onError?.('');
    onNotice?.('Возобновляем проверку публикации карты…');
    waitForPublishedMap(version)
      .catch(error => onError?.(safeCaughtError(error, 'Не удалось завершить публикацию карты.')))
      .finally(() => {
        setMapSaving(false);
        setMapProcessing(false);
        window.setTimeout(() => setMapProgress(0), 900);
      });
    return () => { publicationGenerationRef.current += 1; };
  }, [initData]);

  async function saveMap(file) {
    if (!file) return;
    try {
      onError?.('');
      onNotice?.('');
      setMapSaving(true);
      setMapProcessing(false);
      setMapProgress(0);
      if (!SUPPORTED_MAP_TYPES.has(String(file.type || '').toLowerCase())) {
        throw new Error('Поддерживаются только PNG, JPG и WebP.');
      }
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_MAP_BYTES) {
        throw new Error('Размер файла должен быть не больше 90 МБ.');
      }
      const dimensions = await readRasterDimensions(file);
      if (dimensions.width !== dimensions.height) {
        throw new Error('Изображение карты должно быть квадратным. Разрешение может быть любым.');
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/map`, true);
        xhr.timeout = 600000;
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('X-Telegram-Init-Data', initData);
        xhr.setRequestHeader('X-Map-Size', String(file.size));
        xhr.upload.onprogress = event => {
          if (event.lengthComputable && event.total > 0) {
            setMapProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
          }
        };
        xhr.onload = () => {
          let data = null;
          try { data = JSON.parse(xhr.responseText || 'null'); } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && data?.ok) resolve(data);
          else reject(new Error(data?.error || `Не удалось загрузить карту (HTTP ${xhr.status || 'ошибка'}).`));
        };
        xhr.onerror = () => reject(new Error('Соединение прервалось. Если файл не был полностью передан, загрузите его повторно.'));
        xhr.ontimeout = () => reject(new Error('Загрузка заняла больше 10 минут. Проверьте соединение и повторите попытку.'));
        xhr.onabort = () => reject(new Error('Загрузка карты отменена.'));
        xhr.send(file);
      });
      const expectedVersion = String(uploadResult?.mapVersion || '').trim();
      if (!expectedVersion) throw new Error('Worker сохранил файл, но не вернул версию для обработки карты.');
      try {
        localStorage.setItem(MAP_PUBLICATION_STORAGE_KEY, JSON.stringify({ mapVersion: expectedVersion, startedAt: Date.now() }));
      } catch {}
      setMapProcessing(true);
      onNotice?.('Файл загружен. Продолжаем генерацию и публикацию тайлов…');
      const published = await waitForPublishedMap(expectedVersion);
      if (!published) {
        throw new Error('Публикация ещё продолжается. Её проверка сохранена и автоматически возобновится при следующем открытии приложения.');
      }
    } catch (error) {
      onError?.(safeCaughtError(error, 'Не удалось сохранить карту'));
    } finally {
      setMapSaving(false);
      setMapProcessing(false);
      window.setTimeout(() => setMapProgress(0), 900);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ background: 'var(--theme-color-surface)', border: '1px solid var(--theme-color-border)', borderRadius: 'var(--theme-radius-card)', padding: 'var(--theme-space-4)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <MapIcon size={16} color="var(--theme-color-action-primary)" />
        <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Карта мира</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--theme-color-text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
        Загрузите квадратную карту PNG, JPG или WebP любого разрешения. Размер и разрешение изображения не меняют фиксированную систему координат игрового мира. Размер файла — до 90 МБ; исходник хранится в GitHub Releases, а тайлы публикуются отдельно.
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={event => saveMap(event.target.files?.[0])} />
      <button onClick={() => fileRef.current?.click()} disabled={mapSaving} className="press" style={{ width: '100%', border: 'none', borderRadius: 10, padding: '11px', background: 'var(--theme-color-action-primary)', color: 'var(--theme-color-action-primary-contrast)', fontWeight: 700 }}>
        {mapSaving ? (mapProcessing ? 'Обработка карты…' : 'Загрузка карты…') : 'Загрузить карту мира'}
      </button>
      {mapSaving && (
        <div role="status" aria-live="polite" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--theme-color-text-muted)', marginBottom: 4 }}>
            <span>{mapProcessing ? 'Генерация тайлов и публикация…' : (mapProgress >= 100 ? 'Файл передан, запускаем обработку…' : 'Загрузка файла')}</span>
            <span>{mapProcessing ? 'В работе' : `${mapProgress}%`}</span>
          </div>
          <div style={{ height: 6, background: 'var(--theme-color-surface-elevated)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${mapProgress}%`, background: 'var(--theme-color-action-primary)', borderRadius: 99, transition: 'width 120ms linear' }} />
          </div>
        </div>
      )}
    </div>
  );
}
