import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVisualDiscountCommand,
  addUtcCalendarMonths,
  eventDateExceedsTwoMonths,
  calculateDiscountedPrice,
} from "../bot/src/worker.js";

test("bank visual discount parser accepts all-visual and tag/name selectors", () => {
  assert.deepEqual(parseVisualDiscountCommand("Все 15% 2ч"), {
    targets: ["Все"],
    all: true,
    percent: 15,
    mode: "set",
    durationMs: 7_200_000,
    durationLabel: "2ч",
  });

  assert.deepEqual(parseVisualDiscountCommand("Синий визуал, Метка -15% 45м"), {
    targets: ["Синий визуал", "Метка"],
    all: false,
    percent: 15,
    mode: "decrease",
    durationMs: 2_700_000,
    durationLabel: "45м",
  });
});

test("bank visual discount parser rejects malformed, zero and out-of-range discounts", () => {
  assert.equal(parseVisualDiscountCommand("Все 0% 2ч"), null);
  assert.equal(parseVisualDiscountCommand("Все 101% 2ч"), null);
  assert.equal(parseVisualDiscountCommand("Все 15% 0м"), null);
  assert.equal(parseVisualDiscountCommand("Все 15 2ч"), null);
  assert.equal(parseVisualDiscountCommand("Все 15% два часа"), null);
});

test("event date limit is two UTC calendar months, including month-end clamping", () => {
  const start = Date.UTC(2026, 0, 31, 12, 30);
  const boundary = Date.UTC(2026, 2, 31, 12, 30);
  assert.equal(addUtcCalendarMonths(start, 2), boundary);
  assert.equal(eventDateExceedsTwoMonths(boundary, start), false);
  assert.equal(eventDateExceedsTwoMonths(boundary + 1, start), true);

  const leapDay = Date.UTC(2024, 1, 29, 8);
  assert.equal(new Date(addUtcCalendarMonths(leapDay, 2)).toISOString(), "2024-04-29T08:00:00.000Z");
});

test("discounted visual prices are rounded to whole gems and never negative", () => {
  assert.equal(calculateDiscountedPrice(100, 15), 85);
  assert.equal(calculateDiscountedPrice(499, 15), 424);
  assert.equal(calculateDiscountedPrice(10, 15), 9);
  assert.equal(calculateDiscountedPrice(100, 100), 0);
  assert.equal(calculateDiscountedPrice(100, 0), 100);
});
