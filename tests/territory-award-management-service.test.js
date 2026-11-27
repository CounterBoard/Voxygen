import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdminAwards,
  addTelegramAwardPack,
  deleteTelegramAwardPack,
  grantTerritoryAward,
  deleteTerritoryAwardById,
} from "../bot/src/features/awards/award-management.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deps(overrides = {}) {
  return {
    requireMainInspector: async () => ({ user: { id: 77 } }),
    ensureWorldTables: async () => {},
    json,
    telegram: async () => ({ response: { ok: true }, data: { ok: true, result: { stickers: [] } } }),
    parseTelegramEmojiSetName: value => value === "https://t.me/addemoji/valid_pack" ? "valid_pack" : null,
    isTelegramCustomEmojiSet: value => value?.sticker_type === "custom_emoji",
    getTelegramStickerFormat: () => "image",
    notifyTerritoryManagers: async () => {},
    escapeHtml: value => String(value),
    ...overrides,
  };
}

test("admin award listing authorizes before initializing D1 and returns issued awards", async () => {
  let ensureCalls = 0;
  const env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /FROM territory_awards/);
        return { async all() { return { results: [{ id: "award-1" }] }; } };
      },
    },
  };
  const response = await getAdminAwards(
    new Request("https://voxygen.test/api/admin/awards?view=issued"),
    env,
    deps({ ensureWorldTables: async () => { ensureCalls += 1; } }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, awards: [{ id: "award-1" }] });
  assert.equal(ensureCalls, 1);
});

test("admin award listing stops before D1 when main-inspector authorization fails", async () => {
  let ensureCalls = 0;
  const denied = json({ ok: false, code: "FORBIDDEN" }, 403);
  const response = await getAdminAwards(
    new Request("https://voxygen.test/api/admin/awards"),
    {},
    deps({
      requireMainInspector: async () => ({ error: denied }),
      ensureWorldTables: async () => { ensureCalls += 1; },
    }),
  );

  assert.equal(response, denied);
  assert.equal(ensureCalls, 0);
});

test("adding an award pack rejects malformed Telegram links before D1 or Telegram calls", async () => {
  let ensureCalls = 0;
  let telegramCalls = 0;
  const response = await addTelegramAwardPack(
    new Request("https://voxygen.test/api/admin/award-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-a-pack" }),
    }),
    {},
    deps({
      ensureWorldTables: async () => { ensureCalls += 1; },
      telegram: async () => { telegramCalls += 1; },
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(ensureCalls, 0);
  assert.equal(telegramCalls, 0);
  assert.match((await response.json()).error, /t\.me\/addemoji/);
});

test("adding an existing award pack returns conflict without requesting Telegram", async () => {
  let telegramCalls = 0;
  const env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /SELECT id FROM telegram_award_packs/);
        return { bind(value) { assert.equal(value, "valid_pack"); return this; }, async first() { return { id: "already-added" }; } };
      },
    },
  };
  const response = await addTelegramAwardPack(
    new Request("https://voxygen.test/api/admin/award-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://t.me/addemoji/valid_pack" }),
    }),
    env,
    deps({ telegram: async () => { telegramCalls += 1; } }),
  );

  assert.equal(response.status, 409);
  assert.equal(telegramCalls, 0);
});

test("granting an award validates required fields before initializing D1", async () => {
  let ensureCalls = 0;
  const response = await grantTerritoryAward(
    new Request("https://voxygen.test/api/admin/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ territoryId: "city-1", stickerId: "sticker-1", name: "" }),
    }),
    {},
    deps({ ensureWorldTables: async () => { ensureCalls += 1; } }),
  );

  assert.equal(response.status, 400);
  assert.equal(ensureCalls, 0);
});

test("granting an award persists a metadata snapshot and notifies territory managers", async () => {
  const prepared = [];
  let notification = "";
  const env = {
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() {
            if (sql.includes("FROM territories")) return { id: "city-1", name: "Тестовый город" };
            if (sql.includes("FROM telegram_award_pack_stickers")) return {
              file_id: "telegram-file",
              file_unique_id: "unique-file",
              emoji: "🏆",
              custom_emoji_id: "custom-emoji",
              format: "tgs",
              thumbnail_file_id: "thumbnail-file",
              set_name: "valid_pack",
            };
            return null;
          },
          async run() {
            prepared.push({ sql, values: this.values });
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    },
  };
  const response = await grantTerritoryAward(
    new Request("https://voxygen.test/api/admin/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        territoryId: "city-1",
        stickerId: "sticker-1",
        name: "  Первая   награда ",
        awardedAt: 1764000000000,
      }),
    }),
    env,
    deps({
      notifyTerritoryManagers: async (_env, territoryId, message) => {
        assert.equal(territoryId, "city-1");
        notification = message;
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.name, "Первая награда");
  assert.equal(prepared.length, 1);
  assert.match(prepared[0].sql, /INSERT OR IGNORE INTO territory_awards/);
  assert.ok(prepared[0].values.includes("telegram-file"));
  assert.ok(prepared[0].values.includes("thumbnail-file"));
  assert.match(notification, /Тестовый город/);
  assert.match(notification, /Экипированные награды появляются/);
});

test("deleting an issued award closes its equipment slot and compacts later slots", async () => {
  const batch = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          sql,
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() { return { territory_id: "city-1", slot_index: 1 }; },
        };
      },
      async batch(statements) { batch.push(...statements.map(s => ({ sql: s.sql, values: s.values }))); },
    },
  };
  const response = await deleteTerritoryAwardById(
    new Request("https://voxygen.test/api/admin/awards/award-1", { method: "DELETE" }),
    env,
    "award-1",
    deps(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, deleted: true, awardId: "award-1" });
  assert.equal(batch.length, 2);
  assert.match(batch[0].sql, /DELETE FROM territory_awards/);
  assert.match(batch[1].sql, /slot_index=slot_index-1/);
});

test("deleting an award pack returns not-found without issuing a delete batch", async () => {
  let batchCalls = 0;
  const env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /SELECT id FROM telegram_award_packs/);
        return { bind() { return this; }, async first() { return null; } };
      },
      async batch() { batchCalls += 1; },
    },
  };
  const response = await deleteTelegramAwardPack(
    new Request("https://voxygen.test/api/admin/award-packs/pack-1", { method: "DELETE" }),
    env,
    "pack-1",
    deps(),
  );

  assert.equal(response.status, 404);
  assert.equal(batchCalls, 0);
});
