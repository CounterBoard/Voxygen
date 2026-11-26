import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getUserSettings,
  saveUserSettings,
  normalizeUserTimezone,
} from "../bot/src/features/settings/user-settings.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function createDb({
  preferences = {},
  userRow = { telegram_username: "PlayerOne" },
  themeAccessRows = [],
  territoryRows = [],
  allowedTerritories = [],
} = {}) {
  const operations = [];
  const queries = [];
  const DB = {
    operations,
    queries,
    prepare(sql) {
      const query = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          queries.push({ sql: this.sql, values: this.values });
          if (this.sql.includes("FROM user_preferences")) return preferences;
          if (this.sql.includes("FROM users WHERE telegram_id=?")) return userRow;
          return null;
        },
        async all() {
          queries.push({ sql: this.sql, values: this.values });
          if (this.sql.includes("FROM theme_access_settings")) return { results: themeAccessRows };
          if (this.sql.includes("SELECT t.id,t.name")) return { results: territoryRows };
          if (this.sql.includes("SELECT t.id FROM territories")) return { results: allowedTerritories };
          return { results: [] };
        },
        async run() {
          operations.push({ sql: this.sql, values: this.values });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return query;
    },
  };
  return DB;
}

function createDependencies(overrides = {}) {
  const calls = [];
  const defaults = {
    async requireUser(request) {
      calls.push({ name: "requireUser", header: request.headers.get("X-Telegram-Init-Data") });
      return { user: { id: 42, username: "PlayerOne" } };
    },
    async ensureWorldTables() { calls.push({ name: "ensureWorldTables" }); },
    async ensureUserPreferenceTables() { calls.push({ name: "ensureUserPreferenceTables" }); },
    async ensureGlobalSettingsTable() { calls.push({ name: "ensureGlobalSettingsTable" }); },
    async readGlobalSettingOverrides() {
      calls.push({ name: "readGlobalSettingOverrides" });
      return {};
    },
    async getRoleByTelegramId(_env, id, username) {
      calls.push({ name: "getRoleByTelegramId", id, username });
      return "user";
    },
    json,
  };
  return { dependencies: { ...defaults, ...overrides }, calls };
}

test("timezone normalization preserves supported quarter-hour offsets and falls back safely", () => {
  assert.equal(normalizeUserTimezone(" UTC+5:30 "), "UTC+5:30");
  assert.equal(normalizeUserTimezone("utc-12"), "UTC-12");
  assert.equal(normalizeUserTimezone("UTC+14"), "UTC+14");
  assert.equal(normalizeUserTimezone("UTC+14:15"), "UTC+3");
  assert.equal(normalizeUserTimezone("UTC-12:15"), "UTC+3");
  assert.equal(normalizeUserTimezone("UTC+5:10"), "UTC+3");
  assert.equal(normalizeUserTimezone("UTC+3\u0000"), "UTC+3");
  assert.equal(normalizeUserTimezone("Europe/Berlin"), "UTC+3");
});

test("GET rejects unauthenticated users before world, preference or global table initialization", async () => {
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const DB = createDb();
  const { dependencies, calls } = createDependencies({
    async requireUser() { return { error: authError }; },
  });
  const response = await getUserSettings(
    new Request("https://voxygen.test/api/user-settings"),
    { DB },
    dependencies,
  );

  assert.equal(response, authError);
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
  assert.equal(DB.queries.length, 0);
  assert.equal(DB.operations.length, 0);
});

test("GET preserves initialization order and returns normalized personal/effective settings and territory preferences", async () => {
  const DB = createDb({
    preferences: {
      default_theme: "vox",
      timezone: "UTC+5:30",
      all_notifications: 0,
      event_notifications: 1,
      map_zoom_percent: 88,
      map_zoom_global_updated_at: 0,
      theme_global_updated_at: 0,
    },
    themeAccessRows: [],
    territoryRows: [
      { id: "city-manager", name: "Manager City", is_manager: 1, is_member: 0, preference_enabled: null },
      { id: "city-resident", name: "Resident City", is_manager: 0, is_member: 1, preference_enabled: 0 },
    ],
  });
  const { dependencies, calls } = createDependencies({
    async readGlobalSettingOverrides(_env) {
      return {
        mapZoomPercent: { value: 72, updatedAt: 100 },
        theme: { value: "vox", updatedAt: 200 },
      };
    },
  });
  const response = await getUserSettings(
    new Request("https://voxygen.test/api/user-settings"),
    { DB },
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.settings.theme, "vox");
  assert.equal(body.settings.defaultTheme, "vox");
  assert.equal(body.settings.personalTheme, "vox");
  assert.equal(body.settings.personalMapZoomPercent, 88);
  assert.equal(body.settings.mapZoomPercent, 72);
  assert.equal(body.settings.timezone, "UTC+5:30");
  assert.equal(body.settings.allNotifications, true);
  assert.equal(body.settings.eventNotifications, true);
  assert.deepEqual(body.settings.availableThemes, ["vox"]);
  assert.deepEqual(body.settings.territories, [
    { id: "city-manager", name: "Manager City", role: "manager", enabled: true },
    { id: "city-resident", name: "Resident City", role: "resident", enabled: false },
  ]);
  assert.deepEqual(calls.slice(0, 3).map(call => call.name), [
    "requireUser",
    "ensureWorldTables",
    "ensureUserPreferenceTables",
  ]);
  assert.ok(calls.some(call => call.name === "ensureGlobalSettingsTable"));
  assert.ok(calls.some(call => call.name === "getRoleByTelegramId" && call.id === 42 && call.username === "PlayerOne"));
  assert.ok(DB.operations.some(item => item.sql.includes("INSERT OR IGNORE INTO user_preferences")));
});

test("GET respects a user's global map-zoom opt-out marker", async () => {
  const DB = createDb({
    preferences: {
      default_theme: "vox",
      timezone: "UTC+3",
      event_notifications: 0,
      map_zoom_percent: 64,
      map_zoom_global_updated_at: 500,
      theme_global_updated_at: 0,
    },
  });
  const { dependencies } = createDependencies({
    async readGlobalSettingOverrides() {
      return { mapZoomPercent: { value: 30, updatedAt: 500 } };
    },
  });
  const response = await getUserSettings(new Request("https://voxygen.test/api/user-settings"), { DB }, dependencies);
  const body = await response.json();

  assert.equal(body.settings.personalMapZoomPercent, 64);
  assert.equal(body.settings.mapZoomPercent, 64);
});

test("POST preserves omitted preferences for older clients and saves only territories the user may manage", async () => {
  const DB = createDb({
    preferences: {
      default_theme: "vox",
      timezone: "UTC+3",
      event_notifications: 0,
      map_zoom_percent: 64,
      map_zoom_global_updated_at: 111,
      theme_global_updated_at: 222,
    },
    allowedTerritories: [{ id: "city-owned" }],
  });
  const { dependencies, calls } = createDependencies({
    async readGlobalSettingOverrides() { return {}; },
  });
  const request = new Request("https://voxygen.test/api/user-settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": "signed-init-data",
    },
    body: JSON.stringify({
      timezone: "UTC-4",
      eventNotifications: true,
      territories: [
        { id: "city-owned", enabled: false },
        { id: "not-owned", enabled: true },
      ],
    }),
  });
  const response = await saveUserSettings(request, { DB }, dependencies);
  const body = await response.json();
  const preferenceWrite = DB.operations.find(item => item.sql.includes("INSERT INTO user_preferences"));
  const notificationWrites = DB.operations.filter(item => item.sql.includes("INSERT INTO territory_notification_preferences"));

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(preferenceWrite.values.slice(0, 8), [42, "vox", "UTC-4", 1, 1, 64, 0, 0]);
  assert.equal(preferenceWrite.values[9], 0, "omitted map preference does not change the map global marker");
  assert.equal(preferenceWrite.values[10], 0, "omitted theme preference does not change the theme global marker");
  assert.equal(notificationWrites.length, 1);
  assert.deepEqual(notificationWrites[0].values.slice(0, 3), [42, "city-owned", 0]);
  assert.equal(calls.filter(call => call.name === "ensureWorldTables").length, 2);
  assert.equal(calls.filter(call => call.name === "ensureUserPreferenceTables").length, 2);
  assert.equal(calls.filter(call => call.name === "requireUser").length, 2);
  const authCalls = calls.filter(call => call.name === "requireUser");
  assert.equal(authCalls.length, 2);
  assert.equal(authCalls[1].header, "signed-init-data", "the refresh GET reuses the signed Telegram init data");
});

test("POST records global opt-out markers only when the matching personal setting changed", async () => {
  const DB = createDb({
    preferences: {
      default_theme: "vox",
      timezone: "UTC+3",
      event_notifications: 0,
      map_zoom_percent: 88,
      map_zoom_global_updated_at: 0,
      theme_global_updated_at: 0,
    },
  });
  const { dependencies } = createDependencies({
    async readGlobalSettingOverrides() {
      return {
        theme: { value: "vox", updatedAt: 1234 },
        mapZoomPercent: { value: 77, updatedAt: 5678 },
      };
    },
  });
  await saveUserSettings(
    new Request("https://voxygen.test/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": "init" },
      body: JSON.stringify({
        personalThemeChanged: true,
        personalMapZoomChanged: true,
        defaultTheme: "vox",
        mapZoomPercent: 70,
      }),
    }),
    { DB },
    dependencies,
  );
  const write = DB.operations.find(item => item.sql.includes("INSERT INTO user_preferences"));

  assert.deepEqual(write.values.slice(0, 8), [42, "vox", "UTC+3", 1, 0, 70, 5678, 1234]);
  assert.equal(write.values[9], 1);
  assert.equal(write.values[10], 1);
});

test("POST rejects invalid JSON and authorization failures before any D1 initialization", async () => {
  const unauthorized = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const DB = createDb();
  let ensureCalls = 0;
  const { dependencies } = createDependencies({
    async requireUser() { return { error: unauthorized }; },
    async ensureWorldTables() { ensureCalls += 1; },
    async ensureUserPreferenceTables() { ensureCalls += 1; },
  });
  const response = await saveUserSettings(
    new Request("https://voxygen.test/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    { DB },
    dependencies,
  );

  assert.equal(response.status, 401);
  assert.equal(ensureCalls, 0);
  assert.equal(DB.operations.length, 0);
  assert.equal(DB.queries.length, 0);

  const { dependencies: validAuthDeps } = createDependencies();
  const invalidJson = await saveUserSettings(
    new Request("https://voxygen.test/api/user-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    { DB },
    validAuthDeps,
  );
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, "Invalid JSON");
  assert.equal(DB.operations.length, 0);
});

test("Worker keeps preference DDL and shared global override reader outside the API service", () => {
  const worker = readFileSync(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const service = readFileSync(new URL("../bot/src/features/settings/user-settings.js", import.meta.url), "utf8");
  const workerShell = worker.slice(worker.indexOf("export default {"));

  assert.match(worker, /async function ensureUserPreferenceTables\(env\)/);
  assert.match(worker, /async function readGlobalSettingOverrides\(env/);
  assert.match(worker, /async function ensureGlobalSettingsTable\(env\)/);
  assert.match(workerShell, /getUserSettings\(request, env, \{ requireUser, ensureWorldTables, ensureUserPreferenceTables, ensureGlobalSettingsTable, readGlobalSettingOverrides, getRoleByTelegramId, json \}\)/);
  assert.match(workerShell, /saveUserSettings\(request, env, \{ requireUser, ensureWorldTables, ensureUserPreferenceTables, ensureGlobalSettingsTable, readGlobalSettingOverrides, getRoleByTelegramId, json \}\)/);
  assert.doesNotMatch(worker, /async function getUserSettings\(request/);
  assert.doesNotMatch(worker, /async function saveUserSettings\(request/);
  assert.match(service, /ON CONFLICT\(telegram_id\) DO UPDATE/);
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});
