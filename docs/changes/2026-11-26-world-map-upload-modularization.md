# World map upload UI modularization — 2026-11-26

## Scope

Extracted the main-inspector world-map upload and publication-status UI from `src/App.jsx` into `src/features/world-map/MapUploadPanel.jsx`.

## What moved

- Square-image validation for PNG, JPEG and WebP files up to 90 MB.
- Binary XHR upload to the existing `POST /api/map` endpoint, including Telegram authorization, declared file size, timeout and progress reporting.
- Version-specific polling of the published manifest, validation of map source type, deep-zoom dimensions and world-coordinate geometry, and preview-image decoding.
- Persistence and recovery of a pending publication across app reloads.

## What did not change

- Worker route, authorization, streaming implementation, GitHub Release storage, D1 settings, GitHub Actions dispatch, tile generation, manifest schema and map viewport behavior.
- Existing user-facing messages, upload limits, request headers, polling cadence and publication timeout.
- The application shell still owns the overall inspector screen and receives the successful map through the same `onMapSaved` callback.

## Documentation and tests

- Updated `docs/ARCHITECTURE.md` to identify the upload/publication module.
- Expanded `docs/features/WORLD_MAP.md` with the end-to-end upload and publication sequence and the unchanged cross-service contracts.
- Added `tests/world-map-upload-ui.test.js` to protect the module boundary, request contract and resumable publication behavior.
