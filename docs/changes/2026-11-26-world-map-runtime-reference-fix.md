# World map runtime reference fix — 2026-11-26

## Problem

After territory data and the map became ready, the map viewport could enter a render path that referenced helpers and dimensions as free identifiers even though they were not declared in the VoxMap.jsx module. The zoom constants were also used without importing them.

This can throw a runtime ReferenceError during the first map render and leave the React application blank or dark. The production build alone did not detect the missing runtime bindings.

## Fix

- Import MAP_ZOOM_MAX_SCALE and mapZoomPercentToScale from shared/world-map-coordinates.js.
- Resolve the marker image alt text and dimensions through the injected mapUtils adapter.
- Extend tests/world-map-ui.test.js to guard all affected runtime references.
- Clarify the dependency contract in docs/features/WORLD_MAP.md.

No Worker, API, database, map geometry, marker sizing or visual behavior was changed.
