import test from "node:test";
import assert from "node:assert/strict";
import { createEventsService } from "../bot/src/features/events/service.js";

test("UTC calendar-month arithmetic clamps month-end dates", () => {
  const service = createEventsService({});
  assert.equal(
    new Date(service.addUtcCalendarMonths(Date.parse("2026-01-31T12:00:00Z"), 1)).toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    new Date(service.addUtcCalendarMonths(Date.parse("2024-01-31T12:00:00Z"), 1)).toISOString(),
    "2024-02-29T12:00:00.000Z",
  );
});

test("event date limit uses calendar months and price discount stays bounded", () => {
  const service = createEventsService({});
  const now = Date.parse("2026-01-31T12:00:00Z");
  assert.equal(service.eventDateExceedsTwoMonths(Date.parse("2026-03-31T12:00:00Z"), now), false);
  assert.equal(service.eventDateExceedsTwoMonths(Date.parse("2026-04-01T00:00:00Z"), now), true);
  assert.equal(service.calculateDiscountedPrice(100, 25), 75);
  assert.equal(service.calculateDiscountedPrice(100, 100), 0);
  assert.equal(service.calculateDiscountedPrice(-1, 20), Number.NaN);
});

test("event body validation preserves normalization and timezone rules", () => {
  const normalizedZones = [];
  const service = createEventsService({
    normalizeUserTimezone(value) {
      normalizedZones.push(value);
      return "UTC+3";
    },
  });
  const future = Date.now() + 24 * 60 * 60 * 1000;
  const parsed = service.validateEventBody({
    title: "  Voxygen event  ",
    territoryId: "  city-1 ",
    place: "  place ",
    eventAt: future,
    coords: " X 10 / Z 20 ",
    description: "  description ",
    imageData: "",
    pageUrl: "",
    eventTimezone: "UTC+3",
  });
  assert.deepEqual(parsed.value, {
    title: "Voxygen event",
    territoryId: "city-1",
    place: "place",
    eventAt: future,
    coords: "X 10 / Z 20",
    description: "description",
    imageData: null,
    pageUrl: null,
    eventTimezone: "UTC+3",
  });
  assert.deepEqual(normalizedZones, ["UTC+3"]);
  assert.match(service.validateEventBody({ title: "ok", eventAt: Date.now() - 1 }).error, /будущем/);
});

test("expired-event cleanup remains atomic and returns the deleted event count", async () => {
  const calls = [];
  let initialized = 0;
  const DB = {
    prepare(sql) {
      return {
        sql: String(sql),
        bind(...values) { return { sql: String(sql), values }; },
      };
    },
    async batch(statements) {
      calls.push(statements.map(statement => ({ sql: statement.sql, values: statement.values })));
      return [{ meta: { changes: 4 } }, { meta: { changes: 3 } }, { meta: { changes: 2 } }];
    },
  };
  const service = createEventsService({
    ensureEventsTables: async () => { initialized += 1; },
  });

  const deleted = await service.purgeExpiredEvents({ DB }, Date.parse("2026-05-01T12:00:00Z"));
  assert.equal(initialized, 1);
  assert.equal(deleted, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0].sql, /DELETE FROM event_reminders/);
  assert.match(calls[0][1].sql, /DELETE FROM events/);
  assert.match(calls[0][2].sql, /DELETE FROM event_create_requests/);
});
