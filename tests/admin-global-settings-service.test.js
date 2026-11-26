import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GLOBAL_SETTING_KEYS,
  getAdminGlobalSettings,
  saveAdminGlobalSetting,
} from "../bot/src/features/admin-tools/global-settings.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function createDb({ overrideRows = [], accessRows = [] } = {}) {
  const statements = [];
  const batches = [];
  const db = {
    statements,
    batches,
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (this.sql.includes("FROM global_setting_overrides")) return { results: overrideRows.filter(row => ["map_zoom", "theme"].includes(row.setting_key)) };
          if (this.sql.includes("FROM theme_access_settings")) return { results: accessRows };
          return { results: [] };
        },
        async first() { return null; },
        async run() {
          statements.push({ sql: this.sql, values: this.values });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(items) {
      batches.push(items.map(item => ({ sql: item.sql, values: item.values })));
      return { success: true };
    },
  };
  return db;
}

function deps(overrides = {}) {
  return {
    requireMainInspector: async () => ({ user: { id: 77 } }),
    ensureGlobalSettingsTable: async () => {},
    json,
    ...overrides,
  };
}

test("only theme and map_zoom are accepted global setting keys", () => {
  assert.deepEqual([...GLOBAL_SETTING_KEYS], ["theme", "map_zoom"]);
});

test("GET requires main-inspector authorization before table initialization or D1 access", async () => {
  let ensured = 0;
  let dbCalls = 0;
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const response = await getAdminGlobalSettings(
    new Request("https://voxygen.test/api/admin/global-settings"),
    { DB: { prepare() { dbCalls += 1; throw new Error("unexpected DB access"); } } },
    deps({
      requireMainInspector: async () => ({ error: authError }),
      ensureGlobalSettingsTable: async () => { ensured += 1; },
    }),
  );

  assert.equal(response, authError);
  assert.equal(response.status, 401);
  assert.equal(ensured, 0);
  assert.equal(dbCalls, 0);
});

test("GET normalizes override values and theme access metadata without changing expiry semantics", async () => {
  const now = Date.now();
  const DB = createDb({
    overrideRows: [
      { setting_key: "map_zoom", value: "73", expires_at: now + 60_000, updated_at: now - 1000, updated_by: 77 },
      { setting_key: "theme", value: "vox", expires_at: now - 1000, updated_at: now - 2000, updated_by: 77 },
      { setting_key: "unknown", value: "x", expires_at: null, updated_at: now, updated_by: 77 },
    ],
    accessRows: [
      { theme_id: "vox", visibility: "private", usernames_json: '["@Example","second","@EXAMPLE"]', updated_at: now, updated_by: 77 },
    ],
  });
  let ensured = 0;
  const response = await getAdminGlobalSettings(
    new Request("https://voxygen.test/api/admin/global-settings"),
    { DB },
    deps({ ensureGlobalSettingsTable: async () => { ensured += 1; } }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.settings, [
    { key: "map_zoom", value: 73, expiresAt: now + 60_000, active: true, updatedAt: now - 1000, updatedBy: 77 },
    { key: "theme", value: "vox", expiresAt: now - 1000, active: false, updatedAt: now - 2000, updatedBy: 77 },
  ]);
  assert.deepEqual(body.themeAccess.vox, {
    visibility: "private",
    usernames: ["example", "second", "example"],
    updatedAt: now,
    updatedBy: 77,
  });
  assert.equal(ensured, 1);
});

test("POST theme access normalizes usernames and upserts through the existing table", async () => {
  const DB = createDb();
  let ensured = 0;
  const response = await saveAdminGlobalSetting(
    new Request("https://voxygen.test/api/admin/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": "signed-init-data" },
      body: JSON.stringify({
        themeAccess: {
          themeId: " VOX ",
          visibility: "private",
          usernames: [" @Alpha_1 ", "beta_22", "@ALPHA_1", "invalid-name"],
        },
      }),
    }),
    { DB },
    deps({ ensureGlobalSettingsTable: async () => { ensured += 1; } }),
  );
  const write = DB.statements[0];

  assert.equal(response.status, 200);
  assert.match(write.sql, /INSERT INTO theme_access_settings/);
  assert.match(write.sql, /ON CONFLICT\(theme_id\) DO UPDATE/);
  assert.deepEqual(write.values.slice(0, 2), ["vox", "private"]);
  assert.deepEqual(JSON.parse(write.values[2]).sort(), ["alpha_1", "beta_22"]);
  assert.equal(write.values[4], 77);
  assert.equal(ensured, 2, "save and refresh both ensure the existing settings table");
});

test("POST applies a permanent map zoom through the existing override upsert", async () => {
  const DB = createDb();
  const response = await saveAdminGlobalSetting(
    new Request("https://voxygen.test/api/admin/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { map_zoom: 72 }, permanent: true }),
    }),
    { DB },
    deps(),
  );

  assert.equal(response.status, 200);
  assert.equal(DB.batches.length, 1);
  const [write] = DB.batches[0];
  assert.match(write.sql, /INSERT INTO global_setting_overrides/);
  assert.match(write.sql, /ON CONFLICT\(setting_key\) DO UPDATE/);
  assert.deepEqual(write.values.slice(0, 3), ["map_zoom", "72", null]);
  assert.equal(write.values[4], 77);
});

test("POST clear removes only the requested override and refreshes current settings", async () => {
  const DB = createDb();
  const response = await saveAdminGlobalSetting(
    new Request("https://voxygen.test/api/admin/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true, key: "theme" }),
    }),
    { DB },
    deps(),
  );

  assert.equal(response.status, 200);
  assert.equal(DB.batches.length, 1);
  assert.match(DB.batches[0][0].sql, /DELETE FROM global_setting_overrides WHERE setting_key=\?/);
  assert.deepEqual(DB.batches[0][0].values, ["theme"]);
});

test("POST rejects unknown keys, invalid zoom and invalid expiry without executing writes", async () => {
  for (const payload of [
    { key: "timezone", value: "UTC+3" },
    { key: "map_zoom", value: 0 },
    { key: "map_zoom", value: 101 },
    { key: "map_zoom", value: 42, expiresAt: Date.now() - 1 },
    { key: "map_zoom", value: 42, durationMinutes: 5_260_000 },
  ]) {
    const DB = createDb();
    const response = await saveAdminGlobalSetting(
      new Request("https://voxygen.test/api/admin/global-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { DB },
      deps(),
    );
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.equal(DB.statements.length, 0);
    assert.equal(DB.batches.length, 0);
  }
});

test("POST theme access rejects unsupported theme IDs before database writes", async () => {
  const DB = createDb();
  const response = await saveAdminGlobalSetting(
    new Request("https://voxygen.test/api/admin/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeAccess: { themeId: "unknown-theme", visibility: "private", usernames: [] } }),
    }),
    { DB },
    deps(),
  );

  assert.equal(response.status, 400);
  assert.equal(DB.statements.length, 0);
  assert.equal(DB.batches.length, 0);
});

test("POST requires main-inspector authorization before reading or initializing settings", async () => {
  const authError = json({ ok: false, error: "forbidden" }, 403);
  let ensured = 0;
  let dbCalls = 0;
  const response = await saveAdminGlobalSetting(
    new Request("https://voxygen.test/api/admin/global-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { map_zoom: 50 } }),
    }),
    { DB: { prepare() { dbCalls += 1; throw new Error("unexpected DB access"); }, batch() { dbCalls += 1; } } },
    deps({
      requireMainInspector: async () => ({ error: authError }),
      ensureGlobalSettingsTable: async () => { ensured += 1; },
    }),
  );

  assert.equal(response, authError);
  assert.equal(ensured, 0);
  assert.equal(dbCalls, 0);
});

test("Worker retains table creation and shared override reader while delegating admin routes", () => {
  const worker = readFileSync(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const service = readFileSync(new URL("../bot/src/features/admin-tools/global-settings.js", import.meta.url), "utf8");
  const workerShell = worker.slice(worker.indexOf("export default {"));

  assert.match(worker, /async function ensureGlobalSettingsTable\(env\)/);
  assert.match(worker, /async function readGlobalSettingOverrides\(env/);
  assert.match(worker, /GLOBAL_SETTINGS_INIT_CACHE/);
  assert.match(workerShell, /getAdminGlobalSettings\(request, env, \{ requireMainInspector, ensureGlobalSettingsTable, json \}\)/);
  assert.match(workerShell, /saveAdminGlobalSetting\(request, env, \{ requireMainInspector, ensureGlobalSettingsTable, json \}\)/);
  assert.doesNotMatch(worker, /async function getAdminGlobalSettings\(request/);
  assert.doesNotMatch(worker, /async function saveAdminGlobalSetting\(request/);
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
