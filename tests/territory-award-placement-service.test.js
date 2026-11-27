import test from "node:test";
import assert from "node:assert/strict";
import { createTerritoryAwardPlacementService } from "../bot/src/features/awards/placement-service.js";

function createHarness({
  auth = { user: { id: 101, username: "manager" } },
  territory = { id: "city-1", is_government: 0 },
  isManager = true,
  award = { id: "award-1", slot_index: null },
  updateChanges = 1,
  placedSlotIndex = 2,
  currentSlotIndex = null,
} = {}) {
  const calls = {
    ensures: 0,
    authorizations: 0,
    managerChecks: [],
    prepared: [],
    batches: [],
    runs: [],
    placementReads: 0,
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const query = { sql: String(sql), values };
          calls.prepared.push(query);
          return {
            sql: query.sql,
            values: query.values,
            async first() {
              if (query.sql.includes("SELECT id,is_government FROM territories")) return territory;
              if (query.sql.includes("SELECT id,slot_index FROM territory_awards")) return award;
              if (query.sql.includes("SELECT slot_index FROM territory_awards")) {
                calls.placementReads += 1;
                return { slot_index: updateChanges ? placedSlotIndex : currentSlotIndex };
              }
              throw new Error("Unexpected first() SQL: " + query.sql);
            },
            async run() {
              calls.runs.push(query);
              return { meta: { changes: updateChanges } };
            },
          };
        },
      };
    },
    async batch(statements) {
      calls.batches.push(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const service = createTerritoryAwardPlacementService({
    requireUser: async () => {
      calls.authorizations += 1;
      return auth;
    },
    ensureWorldTables: async () => { calls.ensures += 1; },
    isTerritoryManager: async (_env, territoryId, userId) => {
      calls.managerChecks.push({ territoryId, userId });
      return isManager;
    },
    json: (body, status = 200) => ({ body, status }),
  });
  const env = { DB };
  const request = body => new Request("https://voxygen.test/api/customization/city/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { ...service, calls, env, request };
}

test("award placement rejects unauthenticated callers before D1 initialization", async () => {
  const denied = { error: { status: 401 } };
  const h = createHarness({ auth: denied });
  const result = await h.toggleTerritoryAwardPlacement(h.request({ territoryId: "city-1", awardId: "award-1" }), h.env);

  assert.equal(result, denied.error);
  assert.equal(h.calls.ensures, 0);
  assert.equal(h.calls.prepared.length, 0);
});

test("award placement validates required identifiers and approved territory", async () => {
  const missing = createHarness();
  const missingResult = await missing.toggleTerritoryAwardPlacement(
    missing.request({ territoryId: "", awardId: "" }),
    missing.env
  );
  assert.equal(missingResult.status, 400);
  assert.equal(missing.calls.prepared.length, 0);

  const unknown = createHarness({ territory: null });
  const unknownResult = await unknown.toggleTerritoryAwardPlacement(
    unknown.request({ territoryId: "city-1", awardId: "award-1" }),
    unknown.env
  );
  assert.equal(unknownResult.status, 404);
  assert.equal(unknown.calls.managerChecks.length, 0);
});

test("award placement rejects government territories and non-managers", async () => {
  const government = createHarness({ territory: { id: "city-1", is_government: 1 } });
  const governmentResult = await government.toggleTerritoryAwardPlacement(
    government.request({ territoryId: "city-1", awardId: "award-1" }),
    government.env
  );
  assert.equal(governmentResult.status, 403);
  assert.equal(government.calls.managerChecks.length, 0);

  const member = createHarness({ isManager: false });
  const memberResult = await member.toggleTerritoryAwardPlacement(
    member.request({ territoryId: "city-1", awardId: "award-1" }),
    member.env
  );
  assert.equal(memberResult.status, 403);
  assert.equal(member.calls.managerChecks.length, 1);
  assert.equal(member.calls.runs.length, 0);
  assert.equal(member.calls.batches.length, 0);
});

test("award placement rejects an award that is not in the selected territory inventory", async () => {
  const h = createHarness({ award: null });
  const result = await h.toggleTerritoryAwardPlacement(
    h.request({ territoryId: "city-1", awardId: "award-missing" }),
    h.env
  );

  assert.equal(result.status, 404);
  assert.equal(h.calls.batches.length, 0);
  assert.equal(h.calls.runs.length, 0);
});

test("unequipping an award clears its slot and compacts later slots in one D1 batch", async () => {
  const h = createHarness({ award: { id: "award-1", slot_index: 1 } });
  const result = await h.toggleTerritoryAwardPlacement(
    h.request({ territoryId: "city-1", awardId: "award-1" }),
    h.env
  );

  assert.deepEqual(result.body, { ok: true, equipped: false, awardId: "award-1" });
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].length, 2);
  assert.match(h.calls.batches[0][0].sql, /UPDATE territory_awards SET slot_index=NULL WHERE id=\? AND territory_id=\?/);
  assert.deepEqual(h.calls.batches[0][0].values, ["award-1", "city-1"]);
  assert.match(h.calls.batches[0][1].sql, /UPDATE territory_awards SET slot_index=slot_index-1 WHERE territory_id=\? AND slot_index>\?/);
  assert.deepEqual(h.calls.batches[0][1].values, ["city-1", 1]);
  assert.equal(h.calls.runs.length, 0);
});

test("equipping an award assigns the next ordered slot with an atomic four-slot limit", async () => {
  const h = createHarness({ award: { id: "award-1", slot_index: null }, updateChanges: 1, placedSlotIndex: 2 });
  const result = await h.toggleTerritoryAwardPlacement(
    h.request({ territoryId: "city-1", awardId: "award-1" }),
    h.env
  );

  assert.deepEqual(result.body, { ok: true, equipped: true, awardId: "award-1", slotIndex: 2 });
  assert.equal(h.calls.runs.length, 1);
  assert.match(h.calls.runs[0].sql, /COALESCE\(MAX\(slot_index\),-1\)\+1/);
  assert.match(h.calls.runs[0].sql, /COUNT\(\*\).*slot_index IS NOT NULL\)<4/s);
  assert.match(h.calls.runs[0].sql, /slot_index IS NULL/);
  assert.deepEqual(h.calls.runs[0].values, ["city-1", "award-1", "city-1", "city-1"]);
  assert.equal(h.calls.placementReads, 1);
});

test("award placement returns conflict when all four slots are occupied", async () => {
  const h = createHarness({ award: { id: "award-1", slot_index: null }, updateChanges: 0, currentSlotIndex: null });
  const result = await h.toggleTerritoryAwardPlacement(
    h.request({ territoryId: "city-1", awardId: "award-1" }),
    h.env
  );

  assert.deepEqual(result.body, { ok: false, error: "Максимум 4 награды на странице территории" });
  assert.equal(result.status, 409);
  assert.equal(h.calls.runs.length, 1);
  assert.equal(h.calls.placementReads, 1);
});

test("a concurrent placement that equipped the same award returns its current slot", async () => {
  const h = createHarness({ award: { id: "award-1", slot_index: null }, updateChanges: 0, currentSlotIndex: 3 });
  const result = await h.toggleTerritoryAwardPlacement(
    h.request({ territoryId: "city-1", awardId: "award-1" }),
    h.env
  );

  assert.deepEqual(result.body, { ok: true, equipped: true, awardId: "award-1", slotIndex: 3 });
  assert.equal(h.calls.runs.length, 1);
  assert.equal(h.calls.placementReads, 1);
});
