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

test("world map coordinates cover the calibrated pixel-center range", () => {
  assert.equal(isValidWorldCoordinate(-3008, -3008), true);
  assert.equal(isValidWorldCoordinate(3007, 3007), true);
  assert.equal(isValidWorldCoordinate(-3008.5, 0), false);
  assert.equal(isValidWorldCoordinate(0, 3007.5), false);
  assert.deepEqual(worldCoordinateToPercent(0, 0), { x: (3008.5 / 6016) * 100, y: (3008.5 / 6016) * 100 });
  const first = worldCoordinateToPercent(-3008, -3008);
  const last = worldCoordinateToPercent(3007, 3007);
  assert.ok(first.x > 0 && first.y > 0);
  assert.ok(last.x < 100 && last.y < 100);
  assert.ok(Math.abs(first.x - (0.5 / 6016) * 100) < 1e-12);
});

test("manifest geometry must match the backend calibration", () => {
  const manifestGeometry = {
    type: WORLD_MAP_GEOMETRY.coordinateSystem,
    width: 6016, height: 6016, originX: 3008, originY: 3008,
    minX: -3008, maxX: 3007, minZ: -3008, maxZ: 3007,
  };
  assert.equal(coordinateGeometryMatchesManifest(manifestGeometry), true);
  assert.equal(coordinateGeometryMatchesManifest({ ...manifestGeometry, width: 6015 }), false);
  assert.equal(coordinateGeometryMatchesManifest(null), false);
});

test("map zoom percent is bounded and stable at both ends", () => {
  assert.equal(mapZoomPercentToScale(100), 1);
  assert.equal(mapZoomPercentToScale(1), 24);
  assert.equal(normalizeMapZoomPercent(-10), 1);
  assert.equal(normalizeMapZoomPercent(140), 100);
  assert.equal(normalizeMapZoomPercent("invalid"), 100);
});
