# World map asset loader extraction — 2026-11-26

## Scope

Extracted map image and publication-manifest loading from `CityRatingApp` into the feature hook `src/features/world-map/useWorldMap.js`.

The hook now owns map image/source/loading/error state, request-generation guards, the loaded-image guard, manifest validation, preview decoding, legacy image fallback and retry. It also exposes `onMapSaved` so a completed publication invalidates older in-flight requests before adopting the uploaded image/source.

## Contracts preserved

- The published manifest URL, `deepzoom` / `url-grid` source types, geometry validation and preview URL rules remain unchanged.
- The manifest preview is decoded before the map is committed to state.
- Legacy `/api/map` delivery is used only when the manifest endpoint returns 404; HEAD metadata and supported image MIME types remain validated.
- Retry still invalidates the loaded flag. A new publication invalidates any in-flight asset request and becomes the active map immediately.
- App navigation still determines when loading runs; interactive map view state, zoom state, viewport and marker selection remain in their existing owners.
- No Worker, storage, upload route, manifest format or database behavior changed.

## Documentation and tests

- Updated `docs/features/WORLD_MAP.md` to document asset-loader ownership and concurrency invariants.
- Updated `docs/ARCHITECTURE.md` with the map loader module.
- Added `tests/world-map-loader.test.js` for the loader boundary, manifest and legacy contracts, decoding and stale-request protection.
