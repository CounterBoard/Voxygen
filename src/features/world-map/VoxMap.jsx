import React, { useEffect, useRef, useState } from 'react';
import { MAP_ASSETS_BASE } from '../../config/api.js';

/**
 * Interactive world-map viewport.
 *
 * Pan/pinch/wheel gestures update the transformed map layer directly so
 * markers are not re-rendered on every pointer frame. Deep-zoom and URL-grid
 * sources request only tiles intersecting the current viewport.
 *
 * App-owned territory formatting/coordinate helpers are injected via
 * mapUtils to keep this view independent from the application shell.
 */
export function VoxMap({ image, source = null, territories, onSelect, resetSignal = 0, viewState = null, onViewStateChange, markersReady = false, mapZoomPercent = 100, mapZoomReady = true, mapUtils, assetBase = MAP_ASSETS_BASE }) {
  const MAX_MAP_ZOOM = MAP_ZOOM_MAX_SCALE;
  const defaultScale = mapZoomPercentToScale(mapZoomPercent);
  const viewportRef = useRef(null);
  const mapLayerRef = useRef(null);
  const pointersRef = useRef(new Map());
  const transformRef = useRef(viewState || { x: 0, y: 0, scale: defaultScale });
  const gestureRef = useRef(null);
  const lastResetRef = useRef(resetSignal);
  const paintFrameRef = useRef(null);
  const viewSyncTimerRef = useRef(null);
  const tileRefreshTimerRef = useRef(null);
  const tileSignatureRef = useRef('');
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [visibleTiles, setVisibleTiles] = useState([]);

  function buildVisibleTiles() {
    const src = sourceRef.current;
    const viewport = viewportRef.current;
    if (!src || !viewport || !['deepzoom', 'url-grid'].includes(src.type)) return [];
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    const t = transformRef.current;
    const scale = Math.max(1, Number(t.scale) || 1);
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const left = clamp01(0.5 + (-width / 2 - t.x) / (scale * width));
    const right = clamp01(0.5 + (width / 2 - t.x) / (scale * width));
    const top = clamp01(0.5 + (-height / 2 - t.y) / (scale * height));
    const bottom = clamp01(0.5 + (height / 2 - t.y) / (scale * height));
    const tiles = [];

    if (src.type === 'deepzoom') {
      const mapWidth = Math.max(1, Number(src.width) || 1);
      const mapHeight = Math.max(1, Number(src.height) || 1);
      const tileSize = Math.max(64, Number(src.tileSize) || 512);
      const minLevel = Math.max(0, Number(src.minLevel) || 0);
      const maxLevel = Math.max(minLevel, Number(src.maxLevel) || minLevel);
      const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
      const targetPixels = Math.max(width, height) * dpr * scale;
      const idealLevel = maxLevel + Math.log2(targetPixels / Math.max(mapWidth, mapHeight));
      const level = Math.max(minLevel, Math.min(maxLevel, Math.ceil(idealLevel)));
      const reduction = 2 ** (maxLevel - level);
      const levelWidth = Math.max(1, Math.ceil(mapWidth / reduction));
      const levelHeight = Math.max(1, Math.ceil(mapHeight / reduction));
      const columns = Math.ceil(levelWidth / tileSize);
      const rows = Math.ceil(levelHeight / tileSize);
      const xStart = Math.max(0, Math.floor(left * levelWidth / tileSize) - 1);
      const xEnd = Math.min(columns - 1, Math.floor(Math.max(0, right * levelWidth - 1) / tileSize) + 1);
      const yStart = Math.max(0, Math.floor(top * levelHeight / tileSize) - 1);
      const yEnd = Math.min(rows - 1, Math.floor(Math.max(0, bottom * levelHeight - 1) / tileSize) + 1);
      const template = String(src.tileUrlTemplate || '');
      const tileAssetBase = String(src.assetBase || assetBase);
      for (let y = yStart; y <= yEnd; y += 1) {
        for (let x = xStart; x <= xEnd; x += 1) {
          const tilePath = template
            .replaceAll('{level}', String(level))
            .replaceAll('{x}', String(x))
            .replaceAll('{y}', String(y));
          if (!tilePath) continue;
          let url = tilePath;
          try { url = /^https?:\/\//i.test(tilePath) ? tilePath : new URL(tilePath, tileAssetBase).href; } catch {}
          const tileWidth = Math.min(tileSize, levelWidth - x * tileSize);
          const tileHeight = Math.min(tileSize, levelHeight - y * tileSize);
          tiles.push({
            key: url,
            src: url,
            left: x * tileSize / levelWidth * 100,
            top: y * tileSize / levelHeight * 100,
            width: tileWidth / levelWidth * 100,
            height: tileHeight / levelHeight * 100,
          });
        }
      }
      return tiles;
    }

    const columns = Math.max(1, Number(src.columns) || 12);
    const rows = Math.max(1, Number(src.rows) || 12);
    const urls = Array.isArray(src.urls) ? src.urls : [];
    const xStart = Math.max(0, Math.floor(left * columns) - 1);
    const xEnd = Math.min(columns - 1, Math.floor(Math.max(0, right - 0.000001) * columns) + 1);
    const yStart = Math.max(0, Math.floor(top * rows) - 1);
    const yEnd = Math.min(rows - 1, Math.floor(Math.max(0, bottom - 0.000001) * rows) + 1);
    for (let y = yStart; y <= yEnd; y += 1) {
      for (let x = xStart; x <= xEnd; x += 1) {
        const url = urls[y * columns + x];
        if (typeof url !== 'string' || !url.trim()) continue;
        let resolvedUrl = url.trim();
        try { resolvedUrl = /^https?:\/\//i.test(resolvedUrl) ? resolvedUrl : new URL(resolvedUrl, String(src.assetBase || MAP_ASSETS_BASE)).href; } catch {}
        tiles.push({
          key: resolvedUrl,
          src: resolvedUrl,
          left: x / columns * 100,
          top: y / rows * 100,
          width: 100 / columns,
          height: 100 / rows,
        });
      }
    }
    return tiles;
  }

  function refreshTilesNow() {
    const next = buildVisibleTiles();
    const signature = next.map(tile => tile.key).join('|');
    if (signature !== tileSignatureRef.current) {
      tileSignatureRef.current = signature;
      setVisibleTiles(next);
    }
  }

  function scheduleTileRefresh() {
    if (tileRefreshTimerRef.current !== null) return;
    tileRefreshTimerRef.current = window.setTimeout(() => {
      tileRefreshTimerRef.current = null;
      refreshTilesNow();
    }, 110);
  }

  function bounds(scale = transformRef.current.scale) {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    return {
      x: Math.max(0, el.clientWidth * (scale - 1) / 2),
      y: Math.max(0, el.clientHeight * (scale - 1) / 2),
    };
  }

  function clamp(next) {
    const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, Number(next.scale) || 1));
    const b = bounds(scale);
    return {
      scale,
      x: Math.max(-b.x, Math.min(b.x, Number(next.x) || 0)),
      y: Math.max(-b.y, Math.min(b.y, Number(next.y) || 0)),
    };
  }

  // Gesture updates are applied directly to the existing DOM layer. This avoids
  // React re-rendering every marker and the surrounding map on every pointer frame.
  function paintTransform() {
    const layer = mapLayerRef.current;
    if (!layer) return;
    const t = transformRef.current;
    layer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    layer.style.setProperty('--vox-marker-inverse-scale', String(1 / t.scale));
  }

  function schedulePaint() {
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = window.requestAnimationFrame(() => {
      paintFrameRef.current = null;
      paintTransform();
    });
  }

  function apply(next) {
    transformRef.current = clamp(next);
    schedulePaint();
    scheduleTileRefresh();
  }

  function syncViewStateNow() {
    if (viewSyncTimerRef.current !== null) {
      window.clearTimeout(viewSyncTimerRef.current);
      viewSyncTimerRef.current = null;
    }
    onViewStateChange?.({ ...transformRef.current });
  }

  function syncViewStateSoon() {
    if (viewSyncTimerRef.current !== null) window.clearTimeout(viewSyncTimerRef.current);
    viewSyncTimerRef.current = window.setTimeout(() => {
      viewSyncTimerRef.current = null;
      onViewStateChange?.({ ...transformRef.current });
    }, 180);
  }

  useEffect(() => {
    if (!viewState) return;
    transformRef.current = clamp(viewState);
    paintTransform();
  }, [viewState]);

  useEffect(() => {
    if (!mapZoomReady) return;
    transformRef.current = clamp({ ...transformRef.current, scale: defaultScale });
    paintTransform();
    scheduleTileRefresh();
    onViewStateChange?.({ ...transformRef.current });
  }, [defaultScale, mapZoomReady]);

  useEffect(() => {
    paintTransform();
    return () => {
      if (viewSyncTimerRef.current !== null) window.clearTimeout(viewSyncTimerRef.current);
      if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
      if (tileRefreshTimerRef.current !== null) window.clearTimeout(tileRefreshTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => scheduleTileRefresh());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (lastResetRef.current !== resetSignal) {
      lastResetRef.current = resetSignal;
      transformRef.current = { x: 0, y: 0, scale: defaultScale };
      pointersRef.current.clear();
      gestureRef.current = null;
      paintTransform();
      syncViewStateNow();
      scheduleTileRefresh();
    }
  }, [resetSignal]);

  useEffect(() => {
    tileSignatureRef.current = '';
    setVisibleTiles([]);
    scheduleTileRefresh();
  }, [source]);

  useEffect(() => {
    const onResize = () => {
      transformRef.current = clamp(transformRef.current);
      paintTransform();
      scheduleTileRefresh();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function down(e) {
    e.preventDefault?.();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    const t = transformRef.current;

    if (pts.length >= 2) {
      const center = midpoint(pts[0], pts[1]);
      gestureRef.current = {
        mode: 'pinch',
        startDistance: Math.max(1, distance(pts[0], pts[1])),
        startScale: t.scale,
        startX: t.x,
        startY: t.y,
        startCenter: center,
      };
    } else {
      gestureRef.current = {
        mode: 'pan',
        startX: t.x,
        startY: t.y,
        pointer: pts[0],
      };
    }
  }

  function move(e) {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault?.();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    const g = gestureRef.current;
    if (!g) return;

    if (pts.length >= 2 && g.mode === 'pinch') {
      const currentDistance = Math.max(1, distance(pts[0], pts[1]));
      const currentCenter = midpoint(pts[0], pts[1]);
      const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, g.startScale * currentDistance / g.startDistance));
      const el = viewportRef.current;
      const cx = (el?.clientWidth || 0) / 2;
      const cy = (el?.clientHeight || 0) / 2;
      const worldX = (g.startCenter.x - cx - g.startX) / g.startScale;
      const worldY = (g.startCenter.y - cy - g.startY) / g.startScale;
      apply({
        scale,
        x: currentCenter.x - cx - worldX * scale,
        y: currentCenter.y - cy - worldY * scale,
      });
    } else if (pts.length === 1 && g.mode === 'pan') {
      const q = pts[0];
      apply({
        scale: transformRef.current.scale,
        x: g.startX + q.x - g.pointer.x,
        y: g.startY + q.y - g.pointer.y,
      });
    }
  }

  function up(e) {
    pointersRef.current.delete(e.pointerId);
    const pts = [...pointersRef.current.values()];
    if (!pts.length) {
      gestureRef.current = null;
      syncViewStateNow();
    } else if (pts.length === 1) {
      const t = transformRef.current;
      gestureRef.current = {
        mode: 'pan',
        startX: t.x,
        startY: t.y,
        pointer: pts[0],
      };
    }
  }

  function wheel(e) {
    e.preventDefault?.();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = transformRef.current;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, t.scale * factor));
    const worldX = (px - cx - t.x) / t.scale;
    const worldY = (py - cy - t.y) / t.scale;
    apply({
      scale,
      x: px - cx - worldX * scale,
      y: py - cy - worldY * scale,
    });
    syncViewStateSoon();
  }

  const initialTransform = transformRef.current;

  return <div
    ref={viewportRef}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={up}
    onWheel={wheel}
    style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'var(--theme-color-canvas)', touchAction: 'none', userSelect: 'none',
    }}
  >
    {image && <div ref={mapLayerRef} style={{
      position: 'absolute', inset: 0,
      transform: `translate(${initialTransform.x}px, ${initialTransform.y}px) scale(${initialTransform.scale})`,
      transformOrigin: 'center center',
      '--vox-marker-inverse-scale': String(1 / initialTransform.scale),
    }}>
      {source && ['deepzoom', 'url-grid'].includes(source.type) ? <>
        <img src={image} alt="Карта мира" draggable={false} decoding="async" fetchPriority="high" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'fill', pointerEvents: 'none',
        }}/>
        {visibleTiles.map(tile => <img
          key={tile.key}
          src={tile.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          fetchPriority="high"
          style={{
            position: 'absolute',
            left: `${tile.left}%`,
            top: `${tile.top}%`,
            width: `${tile.width}%`,
            height: `${tile.height}%`,
            objectFit: 'fill',
            display: 'block',
            pointerEvents: 'none',
          }}
        />)}
      </> : <img src={image} alt="Карта мира" draggable={false} decoding="async" fetchPriority="high" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'fill', pointerEvents: 'none',
      }}/>}
      <div style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}>
        {markersReady && territories.map(city => {
          const hasCoords = mapUtils.finiteCoordinate(city.vox_x) !== null && mapUtils.finiteCoordinate(city.vox_z) !== null;
          const pos = hasCoords ? mapUtils.voxWorldToPercent(city.vox_x, city.vox_z) : null;
          if (!mapUtils.hasMapOwner(city) || !pos) return null;
          const markerSrc = city.marker_url || mapUtils.DEFAULT_CITY_MARKER;

          return <button key={city.id} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect(city.id); }} className="press atlas-map-marker" style={{
            position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
            transform: 'translate(-50%,-50%) scale(var(--vox-marker-inverse-scale, 1))',
            transformOrigin: 'center center', border: 'none', background: 'transparent',
            cursor: 'pointer', padding: 0,
            width: mapUtils.MAP_MARKER_WIDTH, height: mapUtils.MAP_MARKER_HEIGHT,
            pointerEvents: 'auto',
          }} title={mapUtils.stripMinecraftCodes(city.name)}>
            <img src={markerSrc} alt={stripMinecraftCodes(city.name)} draggable={false} style={{
              width: MAP_MARKER_WIDTH, height: MAP_MARKER_HEIGHT, objectFit: 'contain', display: 'block',
            }}/>
          </button>;
        })}
      </div>
    </div>}
  </div>;
}
