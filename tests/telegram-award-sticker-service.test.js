import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serveTelegramAwardSticker } from "../bot/src/features/territory-awards/sticker-delivery.js";
import worker from "../bot/src/worker.js";

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function dependencies(overrides = {}) {
  return {
    TELEGRAM_API: "https://api.telegram.org",
    withCors,
    ensureWorldTables: async () => {},
    telegram: async () => ({ response: { ok: true }, data: { ok: true, result: { file_path: "stickers/file.webp" } } }),
    ...overrides,
  };
}

test("invalid sticker selector is rejected before D1 initialization or Telegram access", async () => {
  let ensureCalls = 0;
  let telegramCalls = 0;
  const response = await serveTelegramAwardSticker(
    new Request("https://voxygen.test/api/telegram-sticker"),
    { BOT_TOKEN: "test-token" },
    dependencies({
      ensureWorldTables: async () => { ensureCalls += 1; },
      telegram: async () => { telegramCalls += 1; },
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: "invalid_query" });
  assert.equal(response.headers.get("X-Voxygen-Sticker-Error"), "invalid_query");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(ensureCalls, 0);
  assert.equal(telegramCalls, 0);
});

test("missing sticker records return an opaque no-store response", async () => {
  let selectedSql = "";
  let selectedId = null;
  let ensureCalls = 0;
  let telegramCalls = 0;
  const env = {
    BOT_TOKEN: "test-token",
    DB: {
      prepare(sql) {
        selectedSql = sql;
        return {
          bind(value) { selectedId = value; return this; },
          async first() { return null; },
        };
      },
    },
  };
  const response = await serveTelegramAwardSticker(
    new Request("https://voxygen.test/api/telegram-sticker?stickerId=sticker-123"),
    env,
    dependencies({
      ensureWorldTables: async () => { ensureCalls += 1; },
      telegram: async () => { telegramCalls += 1; },
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: "record_not_found" });
  assert.equal(response.headers.get("X-Voxygen-Sticker-Error"), "record_not_found");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(selectedId, "sticker-123");
  assert.match(selectedSql, /telegram_award_pack_stickers/);
  assert.equal(ensureCalls, 1);
  assert.equal(telegramCalls, 0);
});

test("TGS preview without a saved thumbnail is rejected without asking Telegram for a file", async () => {
  let selectedSql = "";
  let telegramCalls = 0;
  const env = {
    BOT_TOKEN: "test-token",
    DB: {
      prepare(sql) {
        selectedSql = sql;
        return {
          bind() { return this; },
          async first() {
            return { file_id: "full-file-id", format: "tgs", thumbnail_file_id: null };
          },
        };
      },
    },
  };
  const response = await serveTelegramAwardSticker(
    new Request("https://voxygen.test/api/telegram-sticker?awardId=award-123&preview=1"),
    env,
    dependencies({ telegram: async () => { telegramCalls += 1; } }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: "preview_unavailable" });
  assert.equal(response.headers.get("X-Voxygen-Sticker-Error"), "preview_unavailable");
  assert.match(selectedSql, /territory_awards/);
  assert.equal(telegramCalls, 0);
});

test("the extracted handler receives infrastructure dependencies explicitly", () => {
  const source = readFileSync(new URL("../bot/src/features/territory-awards/sticker-delivery.js", import.meta.url), "utf8");
  assert.match(source, /serveTelegramAwardSticker\(request, env, \{ TELEGRAM_API, withCors, ensureWorldTables, telegram \}\)/);
});

test("the Worker exposes the extracted service through the existing public route and CORS contract", async () => {
  const response = await worker.fetch(
    new Request("https://voxygen.test/api/telegram-sticker"),
    { BOT_TOKEN: "test-token" },
    { waitUntil() {} },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: "invalid_query" });
  assert.equal(response.headers.get("X-Voxygen-Sticker-Error"), "invalid_query");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});
