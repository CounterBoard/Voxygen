import test from "node:test";
import assert from "node:assert/strict";
import { parseRequestCoords, parseTwoCoordinates } from "../bot/src/shared/validation.js";

test("parseRequestCoords accepts labelled X/Z coordinates", () => {
  assert.deepEqual(parseRequestCoords("X: 120 / Z: -240"), { x: 120, z: -240 });
  assert.deepEqual(parseRequestCoords("x=1,5 z=-2,25"), { x: 1.5, z: -2.25 });
});

test("parseRequestCoords accepts an unlabelled coordinate pair", () => {
  assert.deepEqual(parseRequestCoords("120, -240"), { x: 120, z: -240 });
  assert.deepEqual(parseRequestCoords("1,5; -2,25"), { x: 1.5, z: -2.25 });
});

test("parseRequestCoords normalizes a Unicode minus and rejects malformed or non-finite input", () => {
  assert.deepEqual(parseRequestCoords("−10 / 20"), { x: -10, z: 20 });
  assert.equal(parseRequestCoords("X 10 / Z"), null);
  assert.equal(parseRequestCoords("Infinity, 1"), null);
  assert.equal(parseRequestCoords("9".repeat(400) + ", 1"), null);
});

test("parseTwoCoordinates accepts exactly two whitespace-separated numbers", () => {
  assert.deepEqual(parseTwoCoordinates("120 -240"), { x: 120, z: -240 });
  assert.deepEqual(parseTwoCoordinates("1,5 2,25"), { x: 1.5, z: 2.25 });
  assert.deepEqual(parseTwoCoordinates("−10 20"), { x: -10, z: 20 });
});

test("parseTwoCoordinates rejects incomplete, extra, or malformed input", () => {
  assert.equal(parseTwoCoordinates("120"), null);
  assert.equal(parseTwoCoordinates("120, -240"), null);
  assert.equal(parseTwoCoordinates("120 -240 extra"), null);
  assert.equal(parseTwoCoordinates("NaN 1"), null);
});
