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
  assert.equal(isValidWorldCoordinate(-3000, -3000), true);
  assert.equal(isValidWorldCoordinate(3000, 3000), true);
  assert.equal(isValidWorldCoordinate(-3000.5, 0), false);
  assert.equal(isValidWorldCoordinate(0, 3000.5), false);
  assert.deepEqual(worldCoordinateToPercent(0, 0), { x: 50, y: 50 });
  const first = worldCoordinateToPercent(-3000, -3000);
  const last = worldCoordinateToPercent(3000, 3000);
  assert.ok(first.x > 0 && first.y > 0);
  assert.ok(last.x < 100 && last.y < 100);
  assert.ok(Math.abs(first.x - (0.5 / 6001) * 100) < 1e-12);
});

test("manifest geometry must match the backend calibration", () => {
  const manifestGeometry = {
    type: WORLD_MAP_GEOMETRY.coordinateSystem,
    width: 6001, height: 6001, originX: 3000, originY: 3000,
    minX: -3000, maxX: 3000, minZ: -3000, maxZ: 3000,
  };
  assert.equal(coordinateGeometryMatchesManifest(manifestGeometry), true);
  assert.equal(coordinateGeometryMatchesManifest({ ...manifestGeometry, width: 6000 }), false);
  assert.equal(coordinateGeometryMatchesManifest(null), false);
});

test("map zoom percent is bounded and stable at both ends", () => {
  assert.equal(mapZoomPercentToScale(100), 1);
  assert.equal(mapZoomPercentToScale(1), 24);
  assert.equal(normalizeMapZoomPercent(-10), 1);
  assert.equal(normalizeMapZoomPercent(140), 100);
  assert.equal(normalizeMapZoomPercent("invalid"), 100);
});
