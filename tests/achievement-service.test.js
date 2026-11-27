import test from "node:test";
import assert from "node:assert/strict";
import {
  achievementPayload,
  achievementRequirementError,
  createAchievementService,
} from "../bot/src/features/customization/achievements.js";

function createHarness({
  territories = [{ id: "city-1", name: "North City", owner_telegram_id: 9001, status: "approved" }],
  items = [],
  residents = 1,
  gems = 0,
  screenshots = 0,
  comments = 0,
  scores = { curator: 0, community: 0 },
  authError = null,
  existingAwards = [],
  notificationFailure = false,
} = {}) {
  const calls = {
    sql: [],
    insertedCityItems: [],
    insertedAwards: [],
    markerSetup: [],
    notifications: [],
    ensured: 0,
    authorization: 0,
  };
  const cityItems = new Set();
  const awards = new Set(existingAwards);
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id FROM territories WHERE status='approved'")) {
            return { results: territories.map(t => ({ id: t.id })) };
          }
          if (this.sql.includes("FROM customization_items") && this.sql.includes("achievement_enabled=1")) {
            return { results: items };
          }
          return { results: [] };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id,name,owner_telegram_id,status FROM territories WHERE id=")) {
            return territories.find(t => String(t.id) === String(this.values[0])) || null;
          }
          if (this.sql.includes("COUNT(DISTINCT ci.item_id)")) return { value: cityItems.size };
          if (this.sql.includes("COUNT(DISTINCT telegram_id)")) return { value: residents };
          if (this.sql.includes("SUM(amount) FROM gem_spend_log")) return { value: gems };
          if (this.sql.includes("COUNT(*) AS value FROM screenshots")) return { value: screenshots };
          if (this.sql.includes("COUNT(*) AS value FROM comments")) return { value: comments };
          return null;
        },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT OR IGNORE INTO city_items")) {
            const key = String(this.values[0]) + ":" + String(this.values[1]);
            const changes = cityItems.has(key) ? 0 : 1;
            cityItems.add(key);
            if (changes) calls.insertedCityItems.push({ territoryId: this.values[0], itemId: this.values[1] });
            return { meta: { changes } };
          }
          if (this.sql.includes("INSERT OR IGNORE INTO achievement_awards")) {
            const key = String(this.values[0]) + ":" + String(this.values[1]);
            const changes = awards.has(key) ? 0 : 1;
            awards.add(key);
            if (changes) calls.insertedAwards.push({ territoryId: this.values[0], itemId: this.values[1] });
            return { meta: { changes } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  const service = createAchievementService({
    calculateTerritoryScores: async () => scores,
    ensureFirstCityMarker: async (_env, territoryId) => { calls.markerSetup.push(String(territoryId)); },
    sendTerritoryNotificationToUser: async (...args) => {
      if (notificationFailure) throw new Error("Telegram unavailable");
      calls.notifications.push(args);
      return true;
    },
    escapeHtml: value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])),
    requireMainInspector: async () => { calls.authorization += 1; return authError ? { error: authError } : { user: { id: 7001 } }; },
    ensureWorldTables: async () => { calls.ensured += 1; },
    json: (body, status = 200) => ({ body, status }),
  });
  return { ...service, DB, calls, env: { DB } };
}

test("achievement requirement payload keeps disabled thresholds empty and validates enabled values", () => {
  assert.deepEqual(achievementPayload({ achievementEnabled: false, achievementResidents: "9" }), {
    enabled: false,
    residents: null,
    gems: null,
    inspectorScore: null,
    playerScore: null,
    screenshots: null,
    comments: null,
    visuals: null,
    invalid: [],
  });

  const enabled = achievementPayload({
    achievementEnabled: "true",
    achievementResidents: "4",
    achievementGems: "1200",
    achievementInspectorScore: "8.5",
    achievementPlayerScore: "11",
    achievementScreenshots: "-1",
    achievementComments: "2.5",
    achievementVisuals: "",
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.residents, 4);
  assert.equal(enabled.gems, 1200);
  assert.equal(enabled.inspectorScore, 8.5);
  assert.deepEqual(enabled.invalid.sort(), ["comments", "playerScore", "screenshots"]);
  assert.match(achievementRequirementError(enabled), /оценка игроков от 0 до 10/);
  assert.match(achievementRequirementError(enabled), /скриншоты \(целое число\)/);
});

test("achievement evaluation skips territories without an approved founder", async () => {
  const h = createHarness({ territories: [{ id: "city-1", name: "No owner", owner_telegram_id: null }] });
  const result = await h.evaluateAchievementsForTerritory(h.env, "city-1");

  assert.deepEqual(result, { checked: false, skipped: "no_founder", awarded: 0 });
  assert.equal(h.calls.sql.some(call => call.sql.includes("FROM customization_items")), false);
});

test("achievement evaluation grants eligible rewards and resolves chained visual requirements in passes", async () => {
  const h = createHarness({
    items: [
      {
        id: "resident-reward",
        name: "Resident Reward",
        achievement_residents: 1,
        achievement_gems: null,
        achievement_inspector_score: null,
        achievement_player_score: null,
        achievement_screenshots: null,
        achievement_comments: null,
        achievement_visuals: null,
      },
      {
        id: "visual-reward",
        name: "Visual Reward",
        achievement_residents: null,
        achievement_gems: null,
        achievement_inspector_score: null,
        achievement_player_score: null,
        achievement_screenshots: null,
        achievement_comments: null,
        achievement_visuals: 1,
      },
    ],
  });
  const result = await h.evaluateAchievementsForTerritory(h.env, "city-1");

  assert.deepEqual(result, { checked: true, awarded: 2, passes: 3 });
  assert.deepEqual(h.calls.insertedCityItems, [
    { territoryId: "city-1", itemId: "resident-reward" },
    { territoryId: "city-1", itemId: "visual-reward" },
  ]);
  assert.deepEqual(h.calls.insertedAwards, [
    { territoryId: "city-1", itemId: "resident-reward" },
    { territoryId: "city-1", itemId: "visual-reward" },
  ]);
  assert.deepEqual(h.calls.markerSetup, ["city-1", "city-1"]);
  assert.equal(h.calls.notifications.length, 2);
  assert.equal(h.calls.notifications[0][2], 9001);
  assert.match(h.calls.notifications[0][3], /Resident Reward/);
});

test("achievement evaluation repairs a missing inventory visual without duplicating an existing award", async () => {
  const h = createHarness({
    items: [{
      id: "repair-reward",
      name: "<Reward>",
      achievement_residents: 1,
      achievement_gems: null,
      achievement_inspector_score: null,
      achievement_player_score: null,
      achievement_screenshots: null,
      achievement_comments: null,
      achievement_visuals: null,
    }],
    existingAwards: ["city-1:repair-reward"],
  });
  const result = await h.evaluateAchievementsForTerritory(h.env, "city-1");

  assert.deepEqual(result, { checked: true, awarded: 0, passes: 2 });
  assert.deepEqual(h.calls.insertedCityItems, [{ territoryId: "city-1", itemId: "repair-reward" }]);
  assert.equal(h.calls.insertedAwards.length, 0);
  assert.equal(h.calls.markerSetup.length, 1);
  assert.equal(h.calls.notifications.length, 0);
});

test("main inspector recheck endpoint retains authorization, aggregates outcomes and skips locked work", async () => {
  const h = createHarness({
    territories: [
      { id: "city-no-owner", name: "No owner", owner_telegram_id: null },
      { id: "city-no-items", name: "No rewards", owner_telegram_id: 9002 },
    ],
    items: [],
  });
  const result = await h.recheckAchievements(new Request("https://voxygen.test/api/achievements/recheck", { method: "POST" }), h.env);

  assert.deepEqual(result.body, { ok: true, checked: 1, skipped: 1, awarded: 0, errors: 0 });
  assert.equal(h.calls.authorization, 1);
  assert.equal(h.calls.ensured, 1);
});

test("a failed authorization stops achievement recheck before database initialization", async () => {
  const h = createHarness({ authError: { body: { ok: false }, status: 403 } });
  const result = await h.recheckAchievements(new Request("https://voxygen.test/api/achievements/recheck", { method: "POST" }), h.env);

  assert.deepEqual(result, { body: { ok: false }, status: 403 });
  assert.equal(h.calls.authorization, 1);
  assert.equal(h.calls.ensured, 0);
});

test("a notification delivery error does not roll back an earned achievement visual", async () => {
  const h = createHarness({
    items: [{
      id: "no-notify-reward",
      name: "Reward",
      achievement_residents: 1,
      achievement_gems: null,
      achievement_inspector_score: null,
      achievement_player_score: null,
      achievement_screenshots: null,
      achievement_comments: null,
      achievement_visuals: null,
    }],
    notificationFailure: true,
  });
  const result = await h.evaluateAchievementsForTerritory(h.env, "city-1");

  assert.deepEqual(result, { checked: true, awarded: 1, passes: 2 });
  assert.equal(h.calls.insertedCityItems.length, 1);
  assert.equal(h.calls.insertedAwards.length, 1);
  assert.equal(h.calls.notifications.length, 0);
});
