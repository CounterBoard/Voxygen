import test from "node:test";
import assert from "node:assert/strict";
import { createCustomizationAdminService } from "../bot/src/features/customization/admin-service.js";

function createHarness({
  authError = null,
  currentItem = null,
  foundItem = true,
  categoryExists = true,
  affectedMarkerTerritories = [{ territory_id: "city-1" }],
  governmentTerritories = [{ id: "gov-1" }],
  approvedTerritories = [{ id: "city-1" }],
} = {}) {
  const calls = { sql: [], batches: [], ensured: 0, auth: 0, cleanup: 0, achievements: [], reconciled: [], ids: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id FROM customization_categories WHERE lower(name)=lower(?)")) return categoryExists ? { id: "category-1" } : null;
          if (this.sql.includes("SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_categories")) return { max_order: -1 };
          if (this.sql.includes("SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_items")) return { max_order: 4 };
          if (this.sql.includes("FROM customization_items WHERE id=? AND active=1")) return foundItem ? (currentItem || {
            id: this.values[0], name: "Old Visual", price: 10, image_data: "data:image/png;base64,abc",
            category_id: "category-1", color: "white", categories_text: "Метка", sort_order: 1,
            achievement_enabled: 0, achievement_residents: null, achievement_gems: null,
            achievement_inspector_score: null, achievement_player_score: null,
            achievement_screenshots: null, achievement_comments: null, achievement_visuals: null, government_marker: 0,
          }) : null;
          return null;
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id FROM territories WHERE status='approved' AND is_government=1")) return { results: governmentTerritories };
          if (this.sql.includes("SELECT territory_id FROM city_customization WHERE marker_item_id=?")) return { results: affectedMarkerTerritories };
          if (this.sql.includes("SELECT id FROM territories WHERE status='approved'")) return { results: approvedTerritories };
          return { results: [] };
        },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.batches.push(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const service = createCustomizationAdminService({
    requireMainInspector: async () => { calls.auth += 1; return authError ? { error: authError } : { user: { id: 7001 } }; },
    ensureWorldTables: async () => { calls.ensured += 1; },
    json: (body, status = 200) => ({ body, status }),
    achievementPayload: body => ({
      enabled: body?.achievementEnabled === true || body?.achievementEnabled === 1 || body?.achievementEnabled === "1" || body?.achievementEnabled === "true",
      residents: body?.achievementResidents == null || body?.achievementResidents === "" ? null : Number(body.achievementResidents),
      gems: body?.achievementGems == null || body?.achievementGems === "" ? null : Number(body.achievementGems),
      inspectorScore: body?.achievementInspectorScore == null || body?.achievementInspectorScore === "" ? null : Number(body.achievementInspectorScore),
      playerScore: body?.achievementPlayerScore == null || body?.achievementPlayerScore === "" ? null : Number(body.achievementPlayerScore),
      screenshots: body?.achievementScreenshots == null || body?.achievementScreenshots === "" ? null : Number(body.achievementScreenshots),
      comments: body?.achievementComments == null || body?.achievementComments === "" ? null : Number(body.achievementComments),
      visuals: body?.achievementVisuals == null || body?.achievementVisuals === "" ? null : Number(body.achievementVisuals),
      invalid: [],
    }),
    achievementRequirementError: () => null,
    cleanupCustomizationCategories: async () => { calls.cleanup += 1; },
    evaluateAchievementsForTerritory: async (_env, territoryId) => { calls.achievements.push(String(territoryId)); },
    reconcileTerritoryVisualEquipment: async (_env, territoryId) => { calls.reconciled.push(String(territoryId)); },
    createId: () => "generated-" + (++calls.ids),
  });
  return { ...service, DB, calls, env: { DB } };
}

function request(url, body, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("all admin catalog operations stop before D1 initialization when main-inspector authorization fails", async () => {
  const h = createHarness({ authError: { body: { ok: false }, status: 403 } });
  const denied = await Promise.all([
    h.createCustomizationItem(request("https://voxygen.test/api/customization/items", {}), h.env),
    h.updateCustomizationItem(request("https://voxygen.test/api/customization/items/visual-1", {}, "PATCH"), h.env, "visual-1"),
    h.setCustomizationItemVisibility(request("https://voxygen.test/api/customization/items/visibility", {}), h.env),
    h.deleteCustomizationItem(request("https://voxygen.test/api/customization/items/visual-1", {}, "DELETE"), h.env, "visual-1"),
    h.reorderCustomizationItems(request("https://voxygen.test/api/customization/items/reorder", {}), h.env),
    h.reorderCustomizationTags(request("https://voxygen.test/api/customization/tags/reorder", {}), h.env),
  ]);
  assert.equal(denied.every(result => result.status === 403), true);
  assert.equal(h.calls.ensured, 0);
  assert.equal(h.calls.sql.length, 0);
});

test("creating a visual persists the validated catalog fields and runs category/government synchronization", async () => {
  const h = createHarness({ categoryExists: false });
  const result = await h.createCustomizationItem(request("https://voxygen.test/api/customization/items", {
    name: "Blue Marker", categories: ["Метка", "Редкий"], price: 25,
    imageData: "data:image/png;base64,abc", color: "blue", governmentMarker: false,
  }), h.env);

  assert.equal(result.body.ok, true);
  assert.equal(result.body.item.id, "generated-3");
  assert.equal(result.body.item.category_id, "generated-1");
  assert.equal(result.body.item.sort_order, 5);
  assert.equal(h.calls.cleanup, 1);
  assert.match(h.calls.sql.find(call => call.sql.includes("INSERT INTO customization_items")).sql, /achievement_enabled/);
  assert.equal(h.calls.sql.some(call => call.sql.includes("UPDATE city_customization SET marker_item_id=NULL")), true);
});

test("government marker creation requires the marker tag before writing an item", async () => {
  const h = createHarness();
  const result = await h.createCustomizationItem(request("https://voxygen.test/api/customization/items", {
    name: "Government Mark", categories: ["Государственный"], price: 0,
    imageData: "data:image/png;base64,abc", color: "white", governmentMarker: true,
  }), h.env);

  assert.deepEqual(result.body, { ok: false, error: "Для государственного визуала необходимо указать тег «Метка»" });
  assert.equal(h.calls.sql.some(call => call.sql.includes("INSERT INTO customization_items")), false);
});

test("editing a visual reconciles currently equipped markers and reevaluates enabled achievements", async () => {
  const h = createHarness({
    currentItem: {
      id: "visual-1", name: "Old Visual", price: 10, image_data: "data:image/png;base64,old",
      category_id: "category-1", color: "white", categories_text: "Метка", sort_order: 1,
      achievement_enabled: 1, achievement_residents: 2, achievement_gems: null,
      achievement_inspector_score: null, achievement_player_score: null, achievement_screenshots: null,
      achievement_comments: null, achievement_visuals: null, government_marker: 0,
    },
  });
  const result = await h.updateCustomizationItem(request("https://voxygen.test/api/customization/items/visual-1", {
    name: "Renamed Marker", achievementEnabled: true,
  }, "PATCH"), h.env, "visual-1");

  assert.equal(result.body.ok, true);
  assert.equal(result.body.item.name, "Renamed Marker");
  assert.deepEqual(h.calls.reconciled, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
  assert.equal(h.calls.cleanup, 1);
});

test("visibility changes accept only supported boolean/numeric values and reject missing visuals", async () => {
  const h = createHarness();
  const invalid = await h.setCustomizationItemVisibility(request("https://voxygen.test/api/customization/items/visibility", {
    itemId: "visual-1", hiddenFromUsers: "true",
  }), h.env);
  assert.deepEqual(invalid.body, { ok: false, error: "Укажите визуал и состояние видимости" });

  const valid = await h.setCustomizationItemVisibility(request("https://voxygen.test/api/customization/items/visibility", {
    itemId: "visual-1", hiddenFromUsers: true,
  }), h.env);
  assert.deepEqual(valid.body, { ok: true, itemId: "visual-1", hidden_from_users: 1 });
  assert.ok(h.calls.sql.some(call => call.sql.includes("UPDATE customization_items SET hidden_from_users=?")));
});

test("deleting a visual keeps marker clear, territory inventory cleanup and soft-delete in one batch", async () => {
  const h = createHarness();
  const result = await h.deleteCustomizationItem(request("https://voxygen.test/api/customization/items/visual-1", {}, "DELETE"), h.env, "visual-1");

  assert.deepEqual(result.body, { ok: true });
  assert.equal(h.calls.batches.length, 1);
  assert.match(h.calls.batches[0][0].sql, /UPDATE city_customization SET marker_item_id=NULL/);
  assert.match(h.calls.batches[0][1].sql, /DELETE FROM city_items WHERE item_id=/);
  assert.match(h.calls.batches[0][2].sql, /UPDATE customization_items SET active=0/);
  assert.deepEqual(h.calls.reconciled, ["city-1"]);
  assert.equal(h.calls.cleanup, 1);
  assert.equal(h.calls.sql.some(call => call.sql.includes("DELETE FROM achievement_awards")), false);
});

test("catalog and tag ordering retain their existing sequential update contract", async () => {
  const h = createHarness();
  const items = await h.reorderCustomizationItems(request("https://voxygen.test/api/customization/items/reorder", {
    itemIds: ["visual-a", "visual-b"],
  }), h.env);
  const tags = await h.reorderCustomizationTags(request("https://voxygen.test/api/customization/tags/reorder", {
    tagIds: ["tag-a", "tag-b"],
  }), h.env);

  assert.deepEqual(items.body, { ok: true });
  assert.deepEqual(tags.body, { ok: true });
  const updates = h.calls.sql.filter(call => call.method === "run" && call.sql.startsWith("UPDATE "));
  assert.deepEqual(updates.map(x => x.values), [
    [0, "visual-a"], [1, "visual-b"], [0, "tag-a"], [1, "tag-b"],
  ]);
});
