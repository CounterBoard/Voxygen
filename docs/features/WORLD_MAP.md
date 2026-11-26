# World map viewport

**Status:** current implementation  
**Updated:** 2026-11-26

## Module boundary

`src/features/world-map/VoxMap.jsx` owns the interactive map viewport:

- pointer capture and one-finger panning;
- two-pointer pinch zoom and wheel zoom;
- transform clamping and synchronization with the parent view state;
- reset handling, resize handling and animation-frame painting;
- visible tile selection for `deepzoom` and `url-grid` map sources;
- map image and tile rendering;
- territory marker placement and marker click forwarding.

The asset-loading state machine is owned by `src/features/world-map/useWorldMap.js`: it validates the publication manifest, decodes the preview, falls back to the legacy image endpoint only when no manifest exists, handles retry, and ignores stale requests. `App.jsx` decides when the loader should run, stores the interactive map view state and zoom preference, and decides what happens when a territory marker is selected.

## Asset loader contract

`useWorldMap` returns the current image URL, optional manifest source, loading/error state, a loader callback, a retry callback and `onMapSaved`. The publication callback invalidates any in-flight load before adopting the newly published map, so an older request cannot overwrite the just-saved image.

The loader keeps the legacy `/api/map` HEAD/GET bridge strictly for the no-manifest case. A present but invalid manifest must fail visibly instead of silently falling back to the legacy image. Both manifest preview and legacy image are decoded before being committed to component state.

## Dependency contract

The viewport receives map data and callbacks through props. `mapUtils` is an explicit adapter supplied by `App.jsx` for territory coordinate validation/conversion, ownership visibility, marker defaults/sizing and Minecraft text cleanup. This avoids importing the application shell into the feature module and prevents a circular dependency. Every injected marker helper and dimension must be read through `mapUtils` at every use site; the shared zoom constants and conversion helper are imported directly from `shared/world-map-coordinates.js`.

The module reads the shared `MAP_ASSETS_BASE` configuration for relative tile paths. A map source may override this with its own `assetBase`.

## Rendering and performance invariants

- Gesture frames update the existing map layer DOM transform directly. Do not replace this with React state updates on every pointer movement: that would re-render all territory markers during a gesture.
- Tile refresh is throttled; only tiles intersecting the viewport (with a one-tile safety margin) are rendered.
- Marker icons counter-scale against map zoom so their visual size stays stable.
- Pan/zoom is bounded so the map cannot be dragged beyond its viewport.
- The parent owns the persistent view state; the component reports the settled transform through `onViewStateChange`.

## Publication flow

The upload UI lives in `src/features/world-map/MapUploadPanel.jsx`; the application shell only supplies the Telegram init data, status callbacks and the map-saved callback.

1. The browser accepts PNG, JPEG or WebP up to 90 MB, reads image dimensions and rejects non-square files. The raster resolution itself is unrestricted.
2. The browser sends the original binary file to `POST /api/map` using XHR. The request carries `Content-Type`, `X-Telegram-Init-Data` and `X-Map-Size`; upload progress is shown while the browser streams the request.
3. The Worker authorizes the main inspector, validates the declared size and MIME type, and streams the body into an asset in the `world-map` GitHub Release. It dispatches `publish-map.yml` in `CounterBoard/Voxygen-map-assets` with the immutable source URL and map version, then stores the source URL and content type in D1. Existing source assets are retained for 48 hours to protect queued processing jobs.
4. The frontend polls `world-map/manifest.json` until it sees the exact uploaded `mapVersion`. It accepts `deepzoom` and `url-grid` sources, validates deep-zoom dimensions and the canonical world coordinate geometry, then decodes the preview image before switching the active map.
5. The pending version is stored under `voxygen:map-publication-pending`. If the app closes while tiles are being generated, the inspector panel resumes polling on the next open. A successful publication clears the pending marker.

The Worker, GitHub Actions pipeline, D1 keys, manifest shape and tile-generation implementation are intentionally outside this frontend component boundary. Keep their contracts unchanged when refactoring the upload UI.

## Validation

`tests/world-map-ui.test.js` checks the viewport boundary and key interaction/rendering contracts. `tests/world-map-loader.test.js` checks manifest validation, legacy fallback, preview decoding, retry and stale-request protection. Existing coordinate conversion rules remain in `shared/world-map-coordinates.js` and are covered by `tests/world-map-coordinates.test.js`.

This extraction is structural: it does not change map upload/publication routes, tile metadata formats, territory ownership rules or world-coordinate geometry.
