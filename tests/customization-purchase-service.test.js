import test from "node:test";
import assert from "node:assert/strict";
import { createCustomizationPurchaseService } from "../bot/src/features/customization/purchase-service.js";

function createHarness({
  item = { id: "visual-1", name: "Blue Frame", price: 100, government_marker: 0, hidden_from_users: 0 },
  role = "user", managerCities = [], activeDiscount = null,
  initialPersonalBalance = 250, initialTreasuryBalance = 300,
  alreadyOwned = false, ownedAfterFailedBatch = false, batchChanges = 1,
  batchError = null, deletionLocked = false, attributedCity = null,
  buyer = { mc_nickname: "BuyerMC", telegram_username: "buyer" },
  bankerError = false, managerNoticeError = false, markerError = false, achievementError = false,
} = {}) {
  const calls = {
    sql: [], batches: [], personalBalanceInits: [], treasuryInits: [],
    bankerNotices: [], managerNotices: [], markers: [], achievements: [],
    ensured: 0, createdIds: 0, discountedPrices: [], waitUntil: [],
  };
  let personalBalance = initialPersonalBalance;
  let treasuryBalance = initialTreasuryBalance;
  let owned = alreadyOwned;
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql), values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT OR IGNORE INTO user_currency")) calls.personalBalanceInits.push(this.values);
          if (this.sql.includes("INSERT OR IGNORE INTO city_treasury")) calls.treasuryInits.push(this.values);
          return { meta: { changes: 1 } };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM customization_items WHERE id=? AND active=1")) return item;
          if (this.sql.includes("SELECT percent,expires_at FROM customization_discounts")) return activeDiscount;
          if (this.sql.includes("SELECT item_id FROM city_items") || this.sql.includes("SELECT item_id FROM user_items")) {
            const count = calls.sql.filter(entry => entry.method === "first" && (
              entry.sql.includes("SELECT item_id FROM city_items") || entry.sql.includes("SELECT item_id FROM user_items")
            )).length;
            if (count === 1) return alreadyOwned ? { item_id: item.id } : null;
            return owned || ownedAfterFailedBatch ? { item_id: item.id } : null;
          }
          if (this.sql.includes("SELECT balance FROM city_treasury")) return { balance: treasuryBalance };
          if (this.sql.includes("SELECT balance FROM user_currency")) return { balance: personalBalance };
          if (this.sql.includes("SELECT t.id,t.name FROM city_memberships")) return attributedCity;
          if (this.sql.includes("SELECT 1 AS locked FROM account_deletion_locks")) return deletionLocked ? { locked: 1 } : null;
          if (this.sql.includes("SELECT mc_nickname,telegram_username FROM users")) return buyer;
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.batches.push(statements);
      if (batchError) throw batchError;
      if (!batchChanges) return statements.map(() => ({ meta: { changes: 0 } }));
      const debit = statements[0];
      if (debit.sql.includes("UPDATE city_treasury")) {
        treasuryBalance -= debit.values[0];
        owned = true;
      } else {
        personalBalance -= debit.values[0];
        owned = true;
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const service = createCustomizationPurchaseService({
    requireUser: async () => ({ user: { id: 101, username: "buyer" } }),
    ensureWorldTables: async () => { calls.ensured += 1; },
    getTreasuryManagerCities: async () => managerCities,
    getRoleByTelegramId: async () => role,
    calculateDiscountedPrice: (price, percent) => {
      calls.discountedPrices.push({ price, percent });
      return Math.floor(Number(price) * (100 - percent) / 100);
    },
    notifyBankerOfPurchase: async (_env, details) => {
      calls.bankerNotices.push(details);
      if (bankerError) throw new Error("banker notification unavailable");
    },
    notifyTerritoryManagers: async (...args) => {
      calls.managerNotices.push(args);
      if (managerNoticeError) throw new Error("manager notification unavailable");
    },
    escapeHtml: value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])),
    formatTelegramNickname: value => "<code>" + String(value ?? "") + "</code>",
    ensureFirstCityMarker: async (_env, territoryId) => {
      calls.markers.push(String(territoryId));
      if (markerError) throw new Error("marker setup unavailable");
    },
    evaluateAchievementsForTerritory: async (_env, territoryId) => {
      calls.achievements.push(String(territoryId));
      if (achievementError) throw new Error("achievement evaluation unavailable");
    },
    json: (body, status = 200) => ({ body, status }),
    createId: () => "spend-log-" + (++calls.createdIds),
  });
  const request = new Request("https://voxygen.test/api/customization/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: item.id, accountScope: "personal" }),
  });
  const env = { DB };
  return {
    ...service, DB, calls, env, request,
    requestFor: accountScope => new Request("https://voxygen.test/api/customization/purchase", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, accountScope }),
    }),
  };
}

test("personal purchase debits, grants inventory and writes the spend journal in one D1 batch", async () => {
  const h = createHarness({ activeDiscount: { percent: 20, expires_at: Date.now() + 60_000 }, attributedCity: { id: "city-1", name: "North City" } });
  const result = await h.purchaseCustomizationItem(h.request, h.env);

  assert.deepEqual(result.body, { ok: true, balance: 170, accountScope: "personal" });
  assert.equal(h.calls.batches.length, 1);
  const batch = h.calls.batches[0];
  assert.equal(batch.length, 3);
  assert.match(batch[0].sql, /UPDATE user_currency SET balance=balance-\?/);
  assert.match(batch[0].sql, /NOT EXISTS \(SELECT 1 FROM user_items/);
  assert.match(batch[0].sql, /NOT EXISTS \(SELECT 1 FROM account_deletion_locks/);
  assert.match(batch[1].sql, /INSERT INTO user_items .*source.*purchase.*WHERE changes\(\)=1/s);
  assert.match(batch[2].sql, /INSERT INTO gem_spend_log/);
  assert.equal(batch[0].values[0], 80);
  assert.equal(batch[1].values[1], "visual-1");
  assert.equal(batch[2].values[4], 80);
  assert.equal(batch[2].values[0], "spend-log-1");
  assert.deepEqual(h.calls.discountedPrices, [{ price: 100, percent: 20 }]);
  assert.deepEqual(h.calls.markers, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
  assert.equal(h.calls.bankerNotices.length, 1);
  assert.equal(h.calls.managerNotices.length, 0);
});

test("territory treasury purchase debits city treasury, grants city item and notifies opted-in managers excluding buyer", async () => {
  const h = createHarness({ managerCities: [{ id: "city-1", name: "North City" }], initialTreasuryBalance: 300 });
  const result = await h.purchaseCustomizationItem(h.requestFor("treasury:city-1"), h.env);

  assert.deepEqual(result.body, { ok: true, balance: 200, accountScope: "treasury:city-1" });
  const batch = h.calls.batches[0];
  assert.equal(batch.length, 3);
  assert.match(batch[0].sql, /UPDATE city_treasury SET balance=balance-\?/);
  assert.match(batch[0].sql, /NOT EXISTS \(SELECT 1 FROM city_items/);
  assert.match(batch[0].sql, /NOT EXISTS \(SELECT 1 FROM account_deletion_locks/);
  assert.match(batch[1].sql, /INSERT INTO city_items .*'treasury_purchase'.*WHERE changes\(\)=1/s);
  assert.equal(batch[2].values[1], "city-1");
  assert.equal(batch[2].values[4], 100);
  assert.equal(h.calls.bankerNotices[0].territoryName, "North City");
  assert.equal(h.calls.managerNotices.length, 1);
  assert.equal(h.calls.managerNotices[0][1], "city-1");
  assert.equal(h.calls.managerNotices[0][3], 101);
  assert.deepEqual(h.calls.managerNotices[0][4], { managersOnly: true });
  assert.match(h.calls.managerNotices[0][2], /Трата из казны/);
  assert.deepEqual(h.calls.markers, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
});

test("an already-owned visual returns without a balance debit or notification", async () => {
  const h = createHarness({ alreadyOwned: true });
  const result = await h.purchaseCustomizationItem(h.request, h.env);

  assert.deepEqual(result.body, { ok: true, alreadyOwned: true, accountScope: "personal" });
  assert.equal(h.calls.batches.length, 0);
  assert.equal(h.calls.bankerNotices.length, 0);
  assert.equal(h.calls.managerNotices.length, 0);
});

test("insufficient personal or treasury balance rejects before the D1 transaction", async () => {
  const personal = createHarness({ initialPersonalBalance: 10 });
  const personalResult = await personal.purchaseCustomizationItem(personal.request, personal.env);
  assert.deepEqual(personalResult.body, { ok: false, error: "Недостаточно самоцветов" });
  assert.equal(personal.calls.batches.length, 0);

  const treasury = createHarness({ managerCities: [{ id: "city-1", name: "North City" }], initialTreasuryBalance: 10 });
  const treasuryResult = await treasury.purchaseCustomizationItem(treasury.requestFor("treasury:city-1"), treasury.env);
  assert.deepEqual(treasuryResult.body, { ok: false, error: "Недостаточно самоцветов" });
  assert.equal(treasury.calls.batches.length, 0);
});

test("government visuals and hidden visuals remain unavailable to ordinary buyers", async () => {
  const government = createHarness({ item: { id: "gov", name: "Government Mark", price: 0, government_marker: 1, hidden_from_users: 0 } });
  const govResult = await government.purchaseCustomizationItem(government.request, government.env);
  assert.equal(govResult.status, 403);
  assert.equal(government.calls.batches.length, 0);

  const hidden = createHarness({ item: { id: "hidden", name: "Hidden", price: 50, government_marker: 0, hidden_from_users: 1 }, role: "user" });
  const hiddenResult = await hidden.purchaseCustomizationItem(hidden.request, hidden.env);
  assert.equal(hiddenResult.status, 403);
  assert.equal(hidden.calls.batches.length, 0);

  const inspector = createHarness({ item: { id: "hidden", name: "Hidden", price: 50, government_marker: 0, hidden_from_users: 1 }, role: "main_inspector" });
  const inspectorResult = await inspector.purchaseCustomizationItem(inspector.request, inspector.env);
  assert.equal(inspectorResult.body.ok, true);
});

test("a purchase batch race returns alreadyOwned when another request granted the item first", async () => {
  const h = createHarness({ batchChanges: 0, ownedAfterFailedBatch: true });
  const result = await h.purchaseCustomizationItem(h.request, h.env);

  assert.deepEqual(result.body, { ok: true, alreadyOwned: true, accountScope: "personal" });
  assert.equal(h.calls.bankerNotices.length, 0);
  assert.equal(h.calls.batches.length, 1);
});

test("a deletion-lock failure during the D1 batch returns 409 and does not send notifications", async () => {
  const h = createHarness({ batchError: new Error("D1 constraint failed"), deletionLocked: true });
  const result = await h.purchaseCustomizationItem(h.request, h.env);

  assert.deepEqual(result.body, { ok: false, error: "Аккаунт находится в процессе удаления" });
  assert.equal(result.status, 409);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.bankerNotices.length, 0);
});

test("notification delivery uses ctx.waitUntil when supplied, without blocking the purchase response", async () => {
  const h = createHarness();
  const waitUntil = [];
  const result = await h.purchaseCustomizationItem(h.request, h.env, { waitUntil: promise => waitUntil.push(promise) });

  assert.equal(result.body.ok, true);
  assert.equal(waitUntil.length, 1);
  await waitUntil[0];
  assert.equal(h.calls.bankerNotices.length, 1);
});

test("manager notification and marker/achievement failures do not undo a completed territory purchase", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const h = createHarness({
      managerCities: [{ id: "city-1", name: "North City" }],
      bankerError: true, managerNoticeError: true, markerError: true, achievementError: true,
    });
    const result = await h.purchaseCustomizationItem(h.requestFor("treasury:city-1"), h.env);
    assert.deepEqual(result.body, { ok: true, balance: 200, accountScope: "treasury:city-1" });
    assert.equal(h.calls.batches.length, 1);
    assert.deepEqual(h.calls.markers, ["city-1"]);
    assert.deepEqual(h.calls.achievements, ["city-1"]);
  } finally {
    console.error = originalError;
  }
});

test("banker notification failure does not undo a completed personal purchase", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const h = createHarness({ bankerError: true });
    const result = await h.purchaseCustomizationItem(h.request, h.env);
    assert.deepEqual(result.body, { ok: true, balance: 150, accountScope: "personal" });
    assert.equal(h.calls.batches.length, 1);
    assert.equal(h.calls.bankerNotices.length, 1);
  } finally {
    console.error = originalError;
  }
});

test("a personal purchase uses the first affiliated territory for spend attribution and achievement updates", async () => {
  const h = createHarness({ managerCities: [{ id: "city-1", name: "North City" }] });
  const result = await h.purchaseCustomizationItem(h.request, h.env);
  assert.equal(result.body.ok, true);
  assert.equal(h.calls.batches[0][2].values[1], "city-1");
  assert.deepEqual(h.calls.markers, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
});
