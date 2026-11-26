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

## Validation

`tests/world-map-ui.test.js` checks the module boundary and key interaction/rendering contracts. Existing coordinate conversion rules remain in `shared/world-map-coordinates.js` and are covered by `tests/world-map-coordinates.test.js`.

This extraction is structural: it does not change map upload/publication routes, tile metadata formats, territory ownership rules or world-coordinate geometry.
