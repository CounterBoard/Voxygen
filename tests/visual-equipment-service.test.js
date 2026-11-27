import test from "node:test";
import assert from "node:assert/strict";
import {
  createVisualEquipmentService,
  visualHasTag,
} from "../bot/src/features/customization/visual-equipment-service.js";

function createHarness({
  territory = { id: "city-1", is_government: 0, status: "approved" },
  current = { marker_item_id: null },
  activeMarker = null,
  cityOwned = null,
  residentOwned = null,
  members = [{ telegram_id: 202 }, { telegram_id: 303 }, { telegram_id: null }],
  managers = [{ telegram_id: 101 }, { telegram_id: 202 }],
  cityCandidates = [],
  userCandidates = [],
  visual = { id: "marker-1", active: 1, government_marker: 0, categories_text: "метка", category_name: null },
  eligibleInventory = { owned: 1 },
  achievementCandidates = [],
} = {}) {
  const calls = {
    prepared: [],
    writes: [],
    managerRows: [],
    membershipReads: 0,
    cityCandidateReads: 0,
    userCandidateReads: 0,
    achievementReads: 0,
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const query = { sql: String(sql), values };
          calls.prepared.push(query);
          return {
            async first() {
              if (query.sql.includes("SELECT id,is_government FROM territories")) return territory;
              if (query.sql.includes("SELECT marker_item_id FROM city_customization")) return current;
              if (query.sql.includes("WHERE i.id=? AND i.active=1")) return activeMarker;
              if (query.sql.includes("SELECT 1 AS owned FROM city_items")) return cityOwned;
              if (query.sql.includes("SELECT 1 AS owned FROM user_items")) return residentOwned;
              if (query.sql.includes("SELECT is_government,status FROM territories")) return territory;
              if (query.sql.includes("SELECT i.id,i.active,i.government_marker")) return visual;
              if (query.sql.includes("SELECT 1 FROM city_items WHERE territory_id=? AND item_id=?")) return eligibleInventory;
              throw new Error("Unexpected first() SQL: " + query.sql);
            },
            async all() {
              if (query.sql.includes("FROM city_memberships")) {
                calls.membershipReads += 1;
                return { results: members };
              }
              if (query.sql.includes("i.created_at,i.sort_order")) {
                calls.achievementReads += 1;
                return { results: achievementCandidates };
              }
              if (query.sql.includes("FROM city_items ci")) {
                calls.cityCandidateReads += 1;
                return { results: cityCandidates };
              }
              if (query.sql.includes("FROM user_items ui")) {
                calls.userCandidateReads += 1;
                return { results: userCandidates };
              }
              throw new Error("Unexpected all() SQL: " + query.sql);
            },
            async run() {
              calls.writes.push(query);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const service = createVisualEquipmentService({
    getTerritoryManagerRows: async (_env, territoryId) => {
      calls.managerRows.push(territoryId);
      return managers;
    },
  });
  return { ...service, DB, calls, env: { DB } };
}

test("visual tag matching checks category and comma-separated tags case-insensitively", () => {
  assert.equal(visualHasTag({ category_name: "Метка" }, "метка"), true);
  assert.equal(visualHasTag({ categories_text: "Обложка, МЕТКА, Рамка" }, "метка"), true);
  assert.equal(visualHasTag({ categories_text: "Метка города" }, "метка"), false);
  assert.equal(visualHasTag(null, "метка"), false);
});

test("first-marker setup keeps an active marker already owned by the territory", async () => {
  const activeMarker = {
    id: "marker-1",
    name: "First marker",
    image_data: "data:image/png;base64,AA==",
    categories_text: "метка",
    government_marker: 0,
    category_name: null,
  };
  const h = createHarness({
    current: { marker_item_id: "marker-1" },
    activeMarker,
    cityOwned: { owned: 1 },
  });

  const result = await h.ensureFirstCityMarker(h.env, "city-1");

  assert.deepEqual(result, activeMarker);
  assert.deepEqual(h.calls.managerRows, ["city-1"]);
  assert.equal(h.calls.membershipReads, 1);
  assert.equal(h.calls.writes.length, 0);
  const residentQuery = h.calls.prepared.find(query => query.sql.includes("SELECT 1 AS owned FROM user_items"));
  assert.deepEqual(residentQuery.values, ["marker-1", "101", "202", "303"].map((value, i) => i ? Number(value) : value));
});

test("first-marker setup clears an invalid marker and selects the earliest eligible inventory item", async () => {
  const cityCandidates = [
    { item_id: "later", acquired_at: 100, sort_order: 1, categories_text: "метка" },
    { item_id: "earlier", acquired_at: 50, sort_order: 2, categories_text: "метка" },
    { item_id: "same-time-first-order", acquired_at: 50, sort_order: 1, categories_text: "метка" },
    { item_id: "not-a-marker", acquired_at: 1, sort_order: 0, categories_text: "обложка" },
  ];
  const h = createHarness({
    current: { marker_item_id: "inactive-marker" },
    activeMarker: null,
    cityCandidates,
  });

  const result = await h.ensureFirstCityMarker(h.env, "city-1");

  assert.equal(result.item_id, "same-time-first-order");
  assert.equal(result.id, "same-time-first-order");
  assert.equal(h.calls.writes.length, 2);
  assert.match(h.calls.writes[0].sql, /SET marker_item_id=NULL/);
  assert.match(h.calls.writes[1].sql, /INSERT INTO city_customization/);
  assert.deepEqual(h.calls.writes[1].values[0], "city-1");
  assert.deepEqual(h.calls.writes[1].values[1], "same-time-first-order");
});

test("government marker setup accepts only an active government marker and never borrows resident inventory", async () => {
  const governmentMarker = {
    id: "government-marker",
    name: "Government marker",
    categories_text: "метка",
    government_marker: 1,
    category_name: null,
  };
  const h = createHarness({
    territory: { id: "gov-1", is_government: 1, status: "approved" },
    current: { marker_item_id: "government-marker" },
    activeMarker: governmentMarker,
  });

  const result = await h.ensureFirstCityMarker(h.env, "gov-1");

  assert.deepEqual(result, governmentMarker);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.cityCandidateReads, 0);
  assert.equal(h.calls.userCandidateReads, 0);
});

test("government territories without an assigned government marker do not auto-select ordinary inventory", async () => {
  const h = createHarness({
    territory: { id: "gov-1", is_government: 1, status: "approved" },
    current: { marker_item_id: null },
    cityCandidates: [{ item_id: "ordinary", acquired_at: 1, categories_text: "метка" }],
  });

  const result = await h.ensureFirstCityMarker(h.env, "gov-1");

  assert.equal(result, null);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.cityCandidateReads, 0);
  assert.equal(h.calls.userCandidateReads, 0);
});

test("territory visual reconciliation leaves a currently valid marker unchanged", async () => {
  const h = createHarness({
    current: { marker_item_id: "marker-1" },
    visual: { id: "marker-1", active: 1, government_marker: 0, categories_text: "метка", category_name: null },
    eligibleInventory: { owned: 1 },
  });

  await h.reconcileTerritoryVisualEquipment(h.env, "city-1");

  assert.equal(h.calls.achievementReads, 0);
  assert.equal(h.calls.writes.length, 0);
});

test("territory visual reconciliation falls back to the earliest achievement marker when the current marker is invalid", async () => {
  const h = createHarness({
    current: { marker_item_id: "marker-1" },
    visual: { id: "marker-1", active: 0, government_marker: 0, categories_text: "метка", category_name: null },
    achievementCandidates: [
      { item_id: "achievement-marker", categories_text: "метка, за достижение", category_name: null },
      { item_id: "not-achievement", categories_text: "метка", category_name: null },
    ],
  });

  await h.reconcileTerritoryVisualEquipment(h.env, "city-1");

  assert.equal(h.calls.achievementReads, 1);
  assert.equal(h.calls.writes.length, 1);
  assert.match(h.calls.writes[0].sql, /UPDATE city_customization SET marker_item_id=\?/);
  assert.equal(h.calls.writes[0].values[0], "achievement-marker");
  assert.equal(h.calls.writes[0].values[2], "city-1");
});

test("territory visual reconciliation does not create appearance state when no customization row exists", async () => {
  const h = createHarness({ current: null });

  await h.reconcileTerritoryVisualEquipment(h.env, "city-1");

  assert.equal(h.calls.achievementReads, 0);
  assert.equal(h.calls.writes.length, 0);
});
