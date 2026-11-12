import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_MAP_GEOMETRY,
  isValidWorldCoordinate,
  worldCoordinateToPercent,
  coordinateGeometryMatchesManifest,
  mapZoomPercentToScale,
  normalizeMapZoomPercent,
} from "../shared/world-map-coordinates.js";

test("world coordinate system is fixed independently of raster dimensions", () => {
  assert.deepEqual(WORLD_MAP_GEOMETRY, {
    minX: -3008,
    maxX: 3007,
    minZ: -3008,
    maxZ: 3007,
    coordinateSystem: "minecraft-world-block-centers",
  });
  assert.equal(isValidWorldCoordinate(-3008, -3008), true);
  assert.equal(isValidWorldCoordinate(3007, 3007), true);
  assert.equal(isValidWorldCoordinate(-3008.5, 0), false);
  assert.equal(isValidWorldCoordinate(0, 3007.5), false);
});

test("block centers map to normalized world percentages", () => {
  const first = worldCoordinateToPercent(-3008, -3008);
  const center = worldCoordinateToPercent(0, 0);
  const last = worldCoordinateToPercent(3007, 3007);
  assert.ok(Math.abs(first.x - (0.5 / 6016) * 100) < 1e-12);
  assert.ok(Math.abs(first.y - (0.5 / 6016) * 100) < 1e-12);
  assert.deepEqual(center, { x: (3008.5 / 6016) * 100, y: (3008.5 / 6016) * 100 });
  assert.ok(Math.abs(last.x - (6015.5 / 6016) * 100) < 1e-12);
  assert.ok(Math.abs(last.y - (6015.5 / 6016) * 100) < 1e-12);
});

test("legacy and current manifests use fixed world bounds, not raster width/height", () => {
  assert.equal(coordinateGeometryMatchesManifest(null), true);
  assert.equal(coordinateGeometryMatchesManifest({
    type: "minecraft-world-block-centers",
    minX: -3008, maxX: 3007, minZ: -3008, maxZ: 3007,
  }), true);
  assert.equal(coordinateGeometryMatchesManifest({
    type: "minecraft-block-pixel-centers",
    minX: -3008, maxX: 3007, minZ: -3008, maxZ: 3007,
    width: 4096, height: 2048, originX: 3008, originY: 3008,
  }), true);
  assert.equal(coordinateGeometryMatchesManifest({
    type: "minecraft-world-block-centers",
    minX: -3000, maxX: 3007, minZ: -3008, maxZ: 3007,
  }), false);
});

test("map zoom preserves the established Voxygen overview-to-close-up range", () => {
  assert.equal(mapZoomPercentToScale(100), 1);
  assert.equal(mapZoomPercentToScale(1), 24);
  assert.equal(mapZoomPercentToScale(50), 1 + (50 / 99) * 23);
  assert.equal(normalizeMapZoomPercent(-10), 1);
  assert.equal(normalizeMapZoomPercent(140), 100);
  assert.equal(normalizeMapZoomPercent("invalid"), 100);
});
