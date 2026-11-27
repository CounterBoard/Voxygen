import test from "node:test";
import assert from "node:assert/strict";
import { createVisualInventoryHandler } from "../bot/src/features/customization/telegram-inventory.js";

function normalize(value) {
  return String(value || "")
    .replace(/§[0-9a-fk-or]/gi, "")
    .normalize("NFKC")
    .replace(/<\/?(?:b|strong|i|em|u|s|code|pre)>/gi, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function createHarness({
  items = [{ id: "visual-1", name: "Blue Banner", active: 1 }],
  territories = [],
  users = [{ telegram_id: 2002, telegram_username: "steve", mc_nickname: "Steve" }],
  affectedTerritories = [],
  insertChanges = 1,
  deleteChanges = 1,
  locked = false,
} = {}) {
  const calls = {
    sql: [], telegram: [], ensured: 0, directoryInit: 0,
    reconcile: [], achievements: [], firstMarker: [],
  };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id,name,active FROM customization_items")) return { results: items };
          if (this.sql.includes("SELECT id,name FROM territories WHERE status='approved'")) return { results: territories };
          if (this.sql.includes("SELECT telegram_id,telegram_username,mc_nickname FROM users")) return { results: users };
          if (this.sql.includes("SELECT territory_id FROM city_memberships")) return { results: affectedTerritories };
          return { results: [] };
        },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT OR IGNORE INTO city_items")) return { meta: { changes: insertChanges } };
          if (this.sql.includes("INSERT OR IGNORE INTO user_items")) return { meta: { changes: insertChanges } };
          if (this.sql.includes("DELETE FROM city_items") || this.sql.includes("DELETE FROM user_items")) return { meta: { changes: deleteChanges } };
          return { meta: { changes: 1 } };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT 1 FROM account_deletion_locks")) return locked ? { locked: 1 } : null;
          return null;
        },
      };
      return statement;
    },
  };
  const handler = createVisualInventoryHandler({
    ensureWorldTables: async () => { calls.ensured += 1; },
    ensureUserDirectoryTable: async () => { calls.directoryInit += 1; },
    normalizeVisualCommandText: normalize,
    stripMinecraftFormatting: value => String(value || "").replace(/§[0-9a-fk-or]/gi, ""),
    reconcileTerritoryVisualEquipment: async (_env, territoryId) => { calls.reconcile.push(String(territoryId)); },
    evaluateAchievementsForTerritory: async (_env, territoryId) => { calls.achievements.push(String(territoryId)); },
    ensureFirstCityMarker: async (_env, territoryId) => { calls.firstMarker.push(String(territoryId)); },
    escapeHtml: value => String(value || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])),
    formatTelegramNickname: value => "<code>" + String(value || "") + "</code>",
    telegram: async (_env, method, payload) => { calls.telegram.push({ method, payload }); },
    json: (body, status = 200) => ({ body, status }),
  });
  const message = (text) => ({
    text,
    message_id: 91,
    chat: { id: 9001, type: "private" },
    from: { id: 9001 },
  });
  return { calls, DB, handler, message, env: { DB } };
}

test("territory visual grant keeps marker and achievement side effects", async () => {
  const h = createHarness({ territories: [{ id: "city-1", name: "North City" }] });
  const result = await h.handler(h.env, h.message("North City Blue Banner"), "North City Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_granted", target: "territory" });
  assert.equal(h.calls.ensured, 1);
  assert.equal(h.calls.directoryInit, 1);
  const insert = h.calls.sql.find(call => call.sql.includes("INSERT OR IGNORE INTO city_items"));
  assert.deepEqual(insert.values.slice(0, 2), ["city-1", "visual-1"]);
  assert.deepEqual(h.calls.firstMarker, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
  assert.match(h.calls.telegram[0].payload.text, /выдан/);
});

test("territory names take precedence over a same-named player nickname", async () => {
  const h = createHarness({
    territories: [{ id: "city-1", name: "Steve" }],
    users: [{ telegram_id: 2002, telegram_username: "steve", mc_nickname: "Steve" }],
  });
  const result = await h.handler(h.env, h.message("Steve Blue Banner"), "Steve Blue Banner");

  assert.equal(result.body.target, "territory");
  const insert = h.calls.sql.find(call => call.sql.includes("INSERT OR IGNORE INTO city_items"));
  assert.ok(insert);
  assert.equal(h.calls.sql.some(call => call.sql.includes("INSERT OR IGNORE INTO user_items")), false);
});

test("territory visual removal reconciles equipment and reevaluates achievements", async () => {
  const h = createHarness({
    territories: [{ id: "city-1", name: "North City" }],
    deleteChanges: 1,
  });
  const result = await h.handler(h.env, h.message("North City -Blue Banner"), "North City -Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_removed", target: "territory" });
  const deletion = h.calls.sql.find(call => call.sql.includes("DELETE FROM city_items"));
  assert.deepEqual(deletion.values, ["city-1", "visual-1"]);
  assert.deepEqual(h.calls.reconcile, ["city-1"]);
  assert.deepEqual(h.calls.achievements, ["city-1"]);
});

test("personal visual removal reconciles all affected territories", async () => {
  const h = createHarness({
    affectedTerritories: [{ territory_id: "city-1" }, { territory_id: "city-2" }],
  });
  const result = await h.handler(h.env, h.message("Steve -Blue Banner"), "Steve -Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_removed", target: "user" });
  const deletion = h.calls.sql.find(call => call.sql.includes("DELETE FROM user_items"));
  assert.deepEqual(deletion.values, [2002, "visual-1"]);
  assert.deepEqual(h.calls.reconcile, ["city-1", "city-2"]);
  assert.match(h.calls.telegram[0].payload.text, /<code>Steve<\/code>/);
});

test("personal visual grant is blocked while the target account has a deletion lock", async () => {
  const h = createHarness({ insertChanges: 0, locked: true });
  const result = await h.handler(h.env, h.message("Steve Blue Banner"), "Steve Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_granted", target: "user" });
  assert.match(h.calls.telegram[0].payload.text, /не выдан: аккаунт находится в процессе удаления/);
  const insert = h.calls.sql.find(call => call.sql.includes("INSERT OR IGNORE INTO user_items"));
  assert.match(insert.sql, /NOT EXISTS\(SELECT 1 FROM account_deletion_locks/);
});

test("inactive visuals cannot be granted", async () => {
  const h = createHarness({
    items: [{ id: "visual-1", name: "Blue Banner", active: 0 }],
    territories: [{ id: "city-1", name: "North City" }],
  });
  const result = await h.handler(h.env, h.message("North City Blue Banner"), "North City Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_item_inactive" });
  assert.equal(h.calls.sql.some(call => call.sql.includes("INSERT OR IGNORE INTO city_items")), false);
});

test("ambiguous recipients are rejected without changing any inventory", async () => {
  const h = createHarness({
    users: [
      { telegram_id: 2002, telegram_username: "one", mc_nickname: "Alex" },
      { telegram_id: 2003, telegram_username: "two", mc_nickname: "Alex" },
    ],
  });
  const result = await h.handler(h.env, h.message("Alex Blue Banner"), "Alex Blue Banner");

  assert.deepEqual(result.body, { ok: true, handled: "visual_inventory_target_not_found" });
  assert.match(h.calls.telegram[0].payload.text, /Найдено несколько пользователей\/территорий/);
  assert.equal(h.calls.sql.some(call => call.sql.includes("INSERT OR IGNORE INTO user_items")), false);
});

test("unrelated main-inspector message is left unhandled without database access", async () => {
  const h = createHarness();
  const result = await h.handler(h.env, h.message("обычное сообщение"), "обычное сообщение");

  assert.equal(result, null);
  assert.equal(h.calls.ensured, 0);
  assert.equal(h.calls.sql.length, 0);
});
