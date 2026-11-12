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

test("new and legacy manifests do not bind coordinates to image width or height", () => {
  const manifestGeometry = {
    type: "minecraft-world-block-centers",
    minX: -3008, maxX: 3007, minZ: -3008, maxZ: 3007,
  };
  assert.equal(coordinateGeometryMatchesManifest(manifestGeometry), true);
  assert.equal(coordinateGeometryMatchesManifest({
    type: "minecraft-block-pixel-centers",
    minX: -3008, maxX: 3007, minZ: -3008, maxZ: 3007,
    width: 4096, height: 2048, originX: 3008, originY: 3008,
  }), true);
  assert.equal(coordinateGeometryMatchesManifest(null), true);
  assert.equal(coordinateGeometryMatchesManifest({ ...manifestGeometry, minX: -3000 }), false);
  assert.equal(coordinateGeometryMatchesManifest({ ...manifestGeometry, type: "unknown" }), false);
});

test("map visibility percentage maps to the expected magnification", () => {
  assert.equal(mapZoomPercentToScale(100), 1);
  assert.equal(mapZoomPercentToScale(50), 2);
  assert.equal(mapZoomPercentToScale(25), 4);
  assert.equal(mapZoomPercentToScale(10), 10);
  assert.equal(mapZoomPercentToScale(1), 24);
  assert.equal(mapZoomPercentToScale(0), 24);
  assert.equal(mapZoomPercentToScale(140), 1);
  assert.equal(normalizeMapZoomPercent(-10), 1);
  assert.equal(normalizeMapZoomPercent(140), 100);
  assert.equal(normalizeMapZoomPercent("invalid"), 100);
});
