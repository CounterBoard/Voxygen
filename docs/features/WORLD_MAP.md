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

The app shell remains responsible for loading map metadata and image assets, storing the current view state and zoom preference, and deciding what happens when a territory marker is selected.

## Dependency contract

The viewport receives map data and callbacks through props. `mapUtils` is an explicit adapter supplied by `App.jsx` for territory coordinate validation/conversion, ownership visibility, marker defaults/sizing and Minecraft text cleanup. This avoids importing the application shell into the feature module and prevents a circular dependency.

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

`tests/world-map-ui.test.js` checks the module boundary and key interaction/rendering contracts. Existing coordinate conversion rules remain in `shared/world-map-coordinates.js` and are covered by `tests/world-map-coordinates.test.js`.

This extraction is structural: it does not change map upload/publication routes, tile metadata formats, territory ownership rules or world-coordinate geometry.
