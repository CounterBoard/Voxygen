import test from "node:test";
import assert from "node:assert/strict";
import { createCityAppearanceService } from "../bot/src/features/customization/city-appearance-service.js";

function createHarness({
  territory = { id: "city-1", owner_telegram_id: 101, is_government: 0 },
  isManager = true,
  city = { marker_item_id: "marker-1", banner_color: "blue", banner_gradient: "nebula" },
  managers = [{ telegram_id: 101 }, { telegram_id: 202 }],
  members = [{ telegram_id: 202 }, { telegram_id: 303 }, { telegram_id: null }],
  cityItems = [{ item_id: "marker-city", name: "City marker" }],
  userItems = [{ telegram_id: 202, item_id: "marker-user", name: "Resident marker" }],
  awards = [
    { id: "award-late", slot_index: 1 },
    { id: "award-early", slot_index: 0 },
    { id: "award-storage", slot_index: null },
  ],
  recruitment = { enabled: 1, contact_username: "mayor" },
  recruitmentError = false,
  marker = { id: "marker-1", categories_text: "метка", category_name: null, government_marker: 0, hidden_from_users: 0 },
  markerOwned = true,
} = {}) {
  const calls = {
    prepared: [], writes: [], managerChecks: [], ensured: 0,
    managerRows: [], tagChecks: [],
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const query = { sql: String(sql), values };
          calls.prepared.push(query);
          return {
            async first() {
              if (query.sql.includes("SELECT id,owner_telegram_id,is_government FROM territories")) return territory;
              if (query.sql.includes("SELECT id,owner_telegram_id FROM territories")) return territory;
              if (query.sql.includes("SELECT marker_item_id,banner_color,banner_gradient FROM city_customization")) return city;
              if (query.sql.includes("SELECT contact_username,enabled FROM recruitment")) {
                if (recruitmentError) throw new Error("recruitment table unavailable");
                return recruitment;
              }
              if (query.sql.includes("FROM customization_items i LEFT JOIN customization_categories")) return marker;
              if (query.sql.includes("SELECT 1 FROM city_items")) return markerOwned ? { owned: 1 } : null;
              throw new Error("Unexpected first() SQL: " + query.sql);
            },
            async all() {
              if (query.sql.includes("FROM city_memberships")) return { results: members };
              if (query.sql.includes("FROM city_items")) return { results: cityItems };
              if (query.sql.includes("FROM user_items")) return { results: userItems };
              if (query.sql.includes("FROM territory_awards")) return { results: awards };
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
  const service = createCityAppearanceService({
    requireUser: async () => ({ user: { id: 101, username: "buyer" } }),
    ensureWorldTables: async () => { calls.ensured += 1; },
    isTerritoryManager: async (_env, territoryId, userId) => {
      calls.managerChecks.push({ territoryId, userId });
      return isManager;
    },
    visualHasTag: (row, tag) => {
      calls.tagChecks.push({ itemId: row.id, tag });
      return [row.category_name, row.categories_text]
        .filter(Boolean)
        .flatMap(value => String(value).split(","))
        .some(value => value.trim().toLocaleLowerCase("ru-RU") === tag.toLocaleLowerCase("ru-RU"));
    },
    getTerritoryManagerRows: async (_env, territoryId) => {
      calls.managerRows.push(territoryId);
      return managers;
    },
    json: (body, status = 200) => ({ body, status }),
  });
  const env = { DB };
  const getRequest = new Request("https://voxygen.test/api/customization/city?territoryId=city-1");
  const postRequest = body => new Request("https://voxygen.test/api/customization/city", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ...service, calls, env, getRequest, postRequest };
}

test("city appearance read returns settings, eligible marker inventory and ordered award slots", async () => {
  const h = createHarness();
  const result = await h.getCityCustomizationData(h.getRequest, h.env, new URL(h.getRequest.url));

  assert.deepEqual(result.body, {
    ok: true,
    markerItemId: "marker-1",
    bannerColor: "blue",
    bannerGradient: "nebula",
    availableMarkers: [
      { item_id: "marker-city", name: "City marker" },
      { telegram_id: 202, item_id: "marker-user", name: "Resident marker" },
    ],
    territoryAwards: [
      { id: "award-late", slot_index: 1 },
      { id: "award-early", slot_index: 0 },
      { id: "award-storage", slot_index: null },
    ],
    equippedAwards: [
      { id: "award-early", slot_index: 0 },
      { id: "award-late", slot_index: 1 },
    ],
    recruitmentUsername: "mayor",
  });
  assert.equal(h.calls.ensured, 1);
  assert.deepEqual(h.calls.managerRows, ["city-1"]);
  const inventoryQuery = h.calls.prepared.find(query => query.sql.includes("FROM user_items"));
  assert.deepEqual(inventoryQuery.values, [101, 202, 303]);
});

test("city appearance read returns defaults and ignores unavailable optional recruitment data", async () => {
  const h = createHarness({ city: null, recruitmentError: true });
  const result = await h.getCityCustomizationData(h.getRequest, h.env, new URL(h.getRequest.url));

  assert.equal(result.body.markerItemId, null);
  assert.equal(result.body.bannerColor, "none");
  assert.equal(result.body.bannerGradient, "aurora");
  assert.equal(result.body.recruitmentUsername, "");
});

test("city appearance read rejects missing territories and non-managers", async () => {
  const missing = createHarness({ territory: null });
  const missingResult = await missing.getCityCustomizationData(missing.getRequest, missing.env, new URL(missing.getRequest.url));
  assert.equal(missingResult.status, 404);
  assert.equal(missing.calls.managerChecks.length, 0);

  const member = createHarness({ isManager: false });
  const memberResult = await member.getCityCustomizationData(member.getRequest, member.env, new URL(member.getRequest.url));
  assert.equal(memberResult.status, 403);
  assert.equal(member.calls.prepared.length, 1);
  assert.equal(member.calls.managerRows.length, 0);
});

test("city appearance updates preserve manager and government-territory restrictions", async () => {
  const government = createHarness({ territory: { id: "city-1", owner_telegram_id: 101, is_government: 1 } });
  const governmentResult = await government.updateCityCustomization(
    government.postRequest({ territoryId: "city-1", bannerColor: "blue" }),
    government.env
  );
  assert.equal(governmentResult.status, 403);
  assert.equal(government.calls.writes.length, 0);

  const member = createHarness({ isManager: false });
  const memberResult = await member.updateCityCustomization(
    member.postRequest({ territoryId: "city-1", bannerColor: "blue" }),
    member.env
  );
  assert.equal(memberResult.status, 403);
  assert.equal(member.calls.writes.length, 0);
});

test("city appearance validates banner color and gradient allowlists", async () => {
  const color = createHarness();
  const colorResult = await color.updateCityCustomization(
    color.postRequest({ territoryId: "city-1", bannerColor: "ultraviolet" }),
    color.env
  );
  assert.equal(colorResult.status, 400);
  assert.equal(color.calls.writes.length, 0);

  const gradient = createHarness();
  const gradientResult = await gradient.updateCityCustomization(
    gradient.postRequest({ territoryId: "city-1", bannerGradient: "unknown" }),
    gradient.env
  );
  assert.equal(gradientResult.status, 400);
  assert.equal(gradient.calls.writes.length, 0);
});

test("city appearance rejects an invalid or inaccessible marker before persisting", async () => {
  const wrongTag = createHarness({
    marker: { id: "marker-1", categories_text: "обложка", category_name: null, government_marker: 0 },
  });
  const wrongTagResult = await wrongTag.updateCityCustomization(
    wrongTag.postRequest({ territoryId: "city-1", markerItemId: "marker-1" }),
    wrongTag.env
  );
  assert.equal(wrongTagResult.status, 400);
  assert.equal(wrongTag.calls.writes.length, 0);

  const governmentMarker = createHarness({
    marker: { id: "marker-1", categories_text: "метка", category_name: null, government_marker: 1 },
  });
  const governmentMarkerResult = await governmentMarker.updateCityCustomization(
    governmentMarker.postRequest({ territoryId: "city-1", markerItemId: "marker-1" }),
    governmentMarker.env
  );
  assert.equal(governmentMarkerResult.status, 400);
  assert.equal(governmentMarker.calls.writes.length, 0);

  const notOwned = createHarness({ markerOwned: false });
  const notOwnedResult = await notOwned.updateCityCustomization(
    notOwned.postRequest({ territoryId: "city-1", markerItemId: "marker-1" }),
    notOwned.env
  );
  assert.equal(notOwnedResult.status, 400);
  assert.equal(notOwned.calls.writes.length, 0);
});

test("city appearance persists marker and banner fields together and returns the submitted state", async () => {
  const h = createHarness();
  const result = await h.updateCityCustomization(
    h.postRequest({
      territoryId: "city-1",
      markerItemId: "marker-1",
      bannerColor: "turquoise",
      bannerGradient: "crystal",
    }),
    h.env
  );

  assert.deepEqual(result.body, {
    ok: true,
    markerItemId: "marker-1",
    bannerColor: "turquoise",
    bannerGradient: "crystal",
  });
  assert.equal(h.calls.writes.length, 1);
  assert.match(h.calls.writes[0].sql, /INSERT INTO city_customization/);
  assert.deepEqual(h.calls.writes[0].values.slice(0, 4), ["city-1", "marker-1", "turquoise", "crystal"]);
});

test("clearing a selected marker persists null without requiring marker ownership", async () => {
  const h = createHarness();
  const result = await h.updateCityCustomization(
    h.postRequest({ territoryId: "city-1", markerItemId: "" }),
    h.env
  );

  assert.deepEqual(result.body, { ok: true, markerItemId: null });
  assert.equal(h.calls.writes.length, 1);
  assert.equal(h.calls.writes[0].values[1], null);
  assert.equal(h.calls.tagChecks.length, 0);
});
