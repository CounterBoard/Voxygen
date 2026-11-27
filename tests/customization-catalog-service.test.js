import test from "node:test";
import assert from "node:assert/strict";
import { createCustomizationCatalogService } from "../bot/src/features/customization/catalog-service.js";

function createHarness({
  user = { id: 101, username: "viewer" },
  authError = null,
  managerCities = [],
  role = "user",
  currentUser = { mc_nickname: "ViewerMC" },
  personalBalance = 25,
  treasuryBalance = 80,
  personalOwned = [{ item_id: "visual-1", source: "purchase", acquired_at: 1 }],
  selectedOwned = [{ item_id: "visual-2", source: "purchase", acquired_at: 2 }],
  categories = [{ id: "cat-1", name: "Frames", sort_order: 0 }],
  items = [
    { id: "visual-1", name: "Blue Frame", price: 100, image_data: "data:image/png;base64,abc", discount_percent: 20, discount_expires_at: 999999, government_marker: 0, hidden_from_users: 0 },
    { id: "government", name: "Government Mark", price: 0, image_data: "data:image/png;base64,abc", discount_percent: 0, government_marker: 1, hidden_from_users: 0 },
    { id: "hidden", name: "Hidden Visual", price: 50, image_data: "data:image/png;base64,abc", discount_percent: 0, government_marker: 0, hidden_from_users: 1 },
  ],
  membership = false,
  cityCustomization = { marker_item_id: null, banner_color: "red", banner_gradient: "aurora" },
  cityOnly = [{ territory_id: "city-1", item_id: "visual-2", name: "City Item", source: "achievement" }],
  userOwnedRows = [{ telegram_id: 202, item_id: "visual-3", name: "Manager Item", source: "purchase" }],
  awards = [{ id: "award-1", name: "Founder Award", slot_index: 1 }, { id: "award-2", name: "Old Award", slot_index: null }],
  autoMarker = { id: "marker-1" },
} = {}) {
  const calls = {
    sql: [], runs: [], ensured: 0, cleanup: 0, managerLookups: 0,
    roleLookups: 0, managerRows: 0, markerSetup: [], calculatedPrices: [],
  };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          calls.runs.push({ sql: this.sql, values: this.values });
          return { meta: { changes: 1 } };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT mc_nickname FROM users")) return currentUser;
          if (this.sql.includes("SELECT balance FROM user_currency")) return { balance: personalBalance };
          if (this.sql.includes("SELECT balance FROM city_treasury")) return { balance: treasuryBalance };
          if (this.sql.includes("SELECT 1 FROM city_memberships")) return membership ? { ok: 1 } : null;
          if (this.sql.includes("SELECT marker_item_id,banner_color,banner_gradient FROM city_customization")) return cityCustomization;
          return null;
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM customization_categories ORDER BY")) return { results: categories };
          if (this.sql.includes("FROM customization_items i LEFT JOIN customization_categories")) return { results: items };
          if (this.sql.includes("FROM user_items WHERE telegram_id=?")) {
            return { results: this.values[0] === 101 ? personalOwned : selectedOwned };
          }
          if (this.sql.includes("FROM city_items WHERE territory_id=?")) return { results: selectedOwned };
          if (this.sql.includes("SELECT telegram_id FROM city_memberships")) return { results: [{ telegram_id: 303 }] };
          if (this.sql.includes("FROM city_items ci JOIN customization_items")) return { results: cityOnly };
          if (this.sql.includes("FROM user_items ui JOIN customization_items")) return { results: userOwnedRows };
          if (this.sql.includes("FROM territory_awards WHERE territory_id=?")) return { results: awards };
          return { results: [] };
        },
      };
      return statement;
    },
  };
  const service = createCustomizationCatalogService({
    requireUser: async () => authError ? { error: authError } : { user },
    ensureWorldTables: async () => { calls.ensured += 1; },
    getTreasuryManagerCities: async () => { calls.managerLookups += 1; return managerCities; },
    cleanupCustomizationCategories: async () => { calls.cleanup += 1; },
    getRoleByTelegramId: async () => { calls.roleLookups += 1; return role; },
    calculateDiscountedPrice: (price, percent) => {
      calls.calculatedPrices.push({ price, percent });
      return Math.floor(Number(price) * (100 - percent) / 100);
    },
    getTerritoryManagerRows: async () => {
      calls.managerRows += 1;
      return [{ telegram_id: 202 }, { telegram_id: 202 }];
    },
    ensureFirstCityMarker: async () => {
      calls.markerSetup.push(true);
      return autoMarker;
    },
    json: body => ({ body }),
  });
  return { ...service, DB, calls, env: { DB } };
}

test("unauthenticated catalog reads stop before database initialization", async () => {
  const h = createHarness({ authError: { body: { ok: false }, status: 401 } });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization"), h.env);
  assert.deepEqual(result, { body: { ok: false }, status: 401 });
  assert.equal(h.calls.ensured, 0);
  assert.equal(h.calls.sql.length, 0);
});

test("lite personal read keeps its compact response and does not load the full catalog", async () => {
  const h = createHarness();
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization?lite=1"), h.env);

  assert.deepEqual(result.body, {
    ok: true, balance: 25, personalBalance: 25, accountScope: "personal", accountLabel: "ViewerMC",
  });
  assert.equal(h.calls.ensured, 1);
  assert.equal(h.calls.managerLookups, 1);
  assert.equal(h.calls.cleanup, 0);
  assert.equal(h.calls.sql.some(call => call.sql.includes("FROM customization_items")), false);
  assert.equal(h.calls.runs.some(call => call.sql.includes("INSERT OR IGNORE INTO user_currency")), true);
});

test("lite account scope falls back to personal when the requester is not a treasury manager", async () => {
  const h = createHarness({ managerCities: [] });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization?lite=1&account=treasury:city-1"), h.env);

  assert.equal(result.body.accountScope, "personal");
  assert.equal(result.body.balance, 25);
  assert.equal(result.body.accountLabel, "ViewerMC");
  assert.equal(h.calls.runs.some(call => call.sql.includes("INSERT OR IGNORE INTO city_treasury")), false);
  assert.equal(h.calls.sql.some(call => call.sql.includes("SELECT balance FROM city_treasury")), false);
});

test("lite treasury balance is returned only for an authorized manager and includes personal balance", async () => {
  const h = createHarness({ managerCities: [{ id: "city-1", name: "North City" }] });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization?lite=1&account=treasury:city-1"), h.env);

  assert.deepEqual(result.body, {
    ok: true,
    balance: 80,
    personalBalance: 25,
    accountScope: "treasury:city-1",
    accountLabel: "Казна: North City",
  });
  assert.equal(h.calls.runs.some(call => call.sql.includes("INSERT OR IGNORE INTO city_treasury")), true);
});

test("full catalog applies role visibility and discounts, then assembles manager territory inventory and awards", async () => {
  const h = createHarness({ managerCities: [{ id: "city-1", name: "North City" }] });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization?account=treasury:city-1&territoryId=city-1"), h.env);
  const body = result.body;

  assert.equal(body.accountScope, "treasury:city-1");
  assert.equal(body.accountLabel, "Казна: North City");
  assert.equal(body.balance, 80);
  assert.equal(body.personalBalance, 25);
  assert.deepEqual(body.categories, [{ id: "cat-1", name: "Frames", sort_order: 0 }]);
  assert.deepEqual(body.items.map(item => item.id), ["visual-1"]);
  assert.equal(body.items[0].discount_percent, 20);
  assert.equal(body.items[0].discounted_price, 80);
  assert.deepEqual(body.owned, [{ item_id: "visual-2", source: "purchase", acquired_at: 2 }]);
  assert.equal(body.myItems.length, 1);
  assert.equal(body.myItems[0].item_id, "visual-1");
  assert.equal(body.cityId, "city-1");
  assert.equal(body.cityRole, "manager");
  assert.equal(body.cityInventory.length, 2);
  assert.deepEqual(body.cityInventory.map(item => item.item_id), ["visual-2", "visual-3"]);
  assert.equal(body.territoryAwards.length, 2);
  assert.equal(body.equippedAwards.length, 1);
  assert.equal(body.equippedMarkerItemId, "marker-1");
  assert.equal(body.bannerColor, "red");
  assert.equal(body.bannerGradient, "aurora");
  assert.equal(h.calls.cleanup, 1);
  assert.equal(h.calls.managerRows, 1);
  assert.equal(h.calls.markerSetup.length, 1);
  assert.deepEqual(h.calls.calculatedPrices, [{ price: 100, percent: 20 }]);
});

test("regular users do not see government or hidden catalog visuals", async () => {
  const h = createHarness({ role: "user", managerCities: [] });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization"), h.env);
  assert.deepEqual(result.body.items.map(item => item.id), ["visual-1"]);
});

test("main inspector can see government and hidden catalog visuals", async () => {
  const h = createHarness({ role: "main_inspector", managerCities: [] });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization"), h.env);
  assert.deepEqual(result.body.items.map(item => item.id), ["visual-1", "government", "hidden"]);
});

test("unauthorized profile territory is dropped and first marker is not ensured for that territory", async () => {
  const h = createHarness({ managerCities: [], membership: false });
  const result = await h.getCustomization(new Request("https://voxygen.test/api/customization?territoryId=secret-city"), h.env);
  assert.equal(result.body.cityId, null);
  assert.equal(result.body.cityInventory.length, 0);
  assert.equal(h.calls.markerSetup.length, 0);
  assert.equal(h.calls.sql.some(call => call.sql.includes("SELECT 1 FROM city_memberships")), true);
});
