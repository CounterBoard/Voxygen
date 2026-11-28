import test from "node:test";
import assert from "node:assert/strict";
import { createTerritoryScreenshotsService } from "../bot/src/features/territories/screenshots-service.js";

function harness(overrides = {}) {
  const calls = { sql: [], telegram: [], achievements: [], ensured: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql), values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM screenshots s") && this.sql.includes("WHERE s.id")) {
            return overrides.screenshot ?? {
              id: "shot-1", territory_id: "city-1", telegram_id: 44,
              status: "pending", file_id: "file-1", image_data: null,
              requested_by_id: 44, owner_telegram_id: 9001, is_government: 0,
            };
          }
          return overrides.firstResult ?? null;
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          return { results: overrides.rows ?? [{
            id: "shot-1", territory_id: "city-1", telegram_id: 44,
            telegram_username: "@reviewer", status: "approved", created_at: 123,
            mc_nickname: "Player", reply_text: null,
          }] };
        },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          return { meta: { changes: overrides.changes ?? 1 } };
        },
      };
      return statement;
    },
  };
  const service = createTerritoryScreenshotsService({
    requireUser: async () => overrides.auth ?? { user: { id: 44, username: "reviewer" } },
    requireVerifiedUser: async () => overrides.auth ?? { user: { id: 44, username: "reviewer" } },
    ensureWorldTables: async () => { calls.ensured += 1; },
    getRoleByTelegramId: async () => overrides.role ?? "user",
    getTerritoryManagerRows: async () => overrides.managers ?? [{ telegram_id: 9001 }],
    normalizeUsername: value => value ? `@${String(value).replace(/^@+/, "")}` : "",
    isTerritoryManager: async () => overrides.isManager ?? true,
    telegram: async (...args) => { calls.telegram.push(args); return { response: { ok: true }, data: { ok: true } }; },
    TELEGRAM_API: "https://api.telegram.org",
    evaluateAchievementsForTerritory: async (...args) => { calls.achievements.push(args); },
    json: (body, status = 200) => ({ body, status }),
    withCors: response => response,
  });
  return { ...service, DB, calls, env: { DB, BOT_TOKEN: "test-token" } };
}

test("approved screenshot listing preserves author fallback and absolute image URLs", async () => {
  const h = harness();
  const result = await h.getScreenshots({ url: "https://voxygen.test/api/screenshots?territoryId=city-1" }, h.env, new URL("https://voxygen.test/api/screenshots?territoryId=city-1"));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.screenshots[0].author, "Player");
  assert.equal(result.body.screenshots[0].url, "https://voxygen.test/api/screenshots/shot-1");
  assert.equal(h.calls.ensured, 1);
  assert.ok(h.calls.sql[0].sql.includes("s.status = 'approved'"));
});

test("screenshot moderation requires manager or main-inspector access and updates pending rows once", async () => {
  const h = harness();
  const result = await h.moderateScreenshot({ json: async () => ({ approve: true }) }, h.env, "shot-1");
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, "approved");
  assert.ok(h.calls.sql.some(x => x.method === "run" && x.sql.includes("WHERE id = ? AND status = 'pending'")));
  assert.equal(h.calls.achievements.length, 1);
});

test("screenshot moderation rejects unrelated users without writing", async () => {
  const h = harness({ isManager: false });
  const result = await h.moderateScreenshot({ json: async () => ({ approve: false }) }, h.env, "shot-1");
  assert.equal(result.status, 403);
  assert.equal(h.calls.sql.some(x => x.method === "run"), false);
});

test("screenshot moderation reports an already processed row on an atomic update race", async () => {
  const h = harness({ changes: 0 });
  const result = await h.moderateScreenshot({ json: async () => ({ approve: false }) }, h.env, "shot-1");
  assert.equal(result.status, 409);
  assert.equal(h.calls.achievements.length, 0);
});

test("government screenshot deletion remains main-inspector only", async () => {
  const h = harness({ screenshot: {
    id: "shot-1", territory_id: "city-1", status: "approved",
    owner_telegram_id: 9001, is_government: 1,
  } });
  const result = await h.deleteScreenshot({}, h.env, "shot-1");
  assert.equal(result.status, 403);
  assert.equal(h.calls.sql.some(x => x.method === "run"), false);
});

test("cached approved screenshot delivery returns JPEG bytes without Telegram lookup", async () => {
  const h = harness({ screenshot: {
    id: "shot-1", status: "approved", file_id: "file-1",
    image_data: btoa("jpeg-bytes"),
  } });
  const response = await h.serveScreenshot({}, h.env, "shot-1");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(new TextDecoder().decode(await response.arrayBuffer()), "jpeg-bytes");
  assert.equal(h.calls.telegram.length, 0);
});

test("Telegram screenshot callback rejects unauthorized actors before moderation", async () => {
  const h = harness({ isManager: false });
  const result = await h.handleScreenshotCallback(h.env, {
    id: "callback-1", data: "screenshot_ok:shot-1",
    from: { id: 123 }, message: { chat: { id: 9001 }, message_id: 77 },
  });
  assert.equal(result.body.ok, true);
  assert.equal(h.calls.telegram[0][1], "answerCallbackQuery");
  assert.equal(h.calls.telegram[0][2].show_alert, true);
  assert.equal(h.calls.sql.some(x => x.method === "run"), false);
});
