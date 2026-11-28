import test from "node:test";
import assert from "node:assert/strict";
import { createUserSettingsService } from "../bot/src/features/settings/service.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function createDb({ settings = {}, globalRows = [], themeRows = [], territories = [] } = {}) {
  const statements = [];
  const db = {
    statements,
    prepare(sql) {
      const statement = {
        sql: String(sql), values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (this.sql.includes("FROM user_preferences")) return { ...settings };
          if (this.sql.includes("FROM users")) return { telegram_username: "Viewer" };
          return null;
        },
        async all() {
          if (this.sql.includes("FROM global_setting_overrides")) return { results: globalRows };
          if (this.sql.includes("FROM theme_access_settings")) return { results: themeRows };
          if (this.sql.includes("SELECT t.id FROM territories")) return { results: [{ id: "city-1" }] };
          if (this.sql.includes("FROM territories t LEFT JOIN territory_notification_preferences")) return { results: territories };
          return { results: [] };
        },
        async run() { statements.push({ sql: this.sql, values: this.values }); return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  return db;
}

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    requireUser: async () => ({ user: { id: 42, username: "Viewer" } }),
    ensureWorldTables: async () => { calls.push("world"); },
    ensureUserPreferenceTables: async () => { calls.push("preferences"); },
    ensureGlobalSettingsTable: async () => { calls.push("global"); },
    getRoleByTelegramId: async () => "user",
    normalizeUserTimezone: value => /^UTC[+-]/.test(String(value || "")) ? String(value) : "UTC+3",
    json,
    ...overrides,
  };
}

test("GET rejects unauthenticated requests before table initialization or D1 access", async () => {
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  let dbCalls = 0;
  const deps = dependencies({ requireUser: async () => ({ error: authError }) });
  const service = createUserSettingsService(deps);
  const response = await service.getUserSettings(new Request("https://voxygen.test/api/user-settings"), {
    DB: { prepare() { dbCalls += 1; throw new Error("unexpected DB access"); } },
  });
  assert.equal(response, authError);
  assert.deepEqual(deps.calls, []);
  assert.equal(dbCalls, 0);
});

test("GET preserves effective theme, global zoom, timezone and territory response contracts", async () => {
  const DB = createDb({
    settings: { default_theme: "vox", timezone: "UTC+5", event_notifications: 1, map_zoom_percent: 66, map_zoom_global_updated_at: 0, theme_global_updated_at: 0 },
    globalRows: [
      { setting_key: "theme", value: "vox", expires_at: null, updated_at: 10 },
      { setting_key: "map_zoom", value: "82", expires_at: null, updated_at: 20 },
    ],
    themeRows: [{ theme_id: "vox", visibility: "private", usernames_json: '["viewer"]' }],
    territories: [
      { id: "city-1", name: "Alpha", is_manager: 1, is_member: 1, preference_enabled: null },
      { id: "city-2", name: "Beta", is_manager: 0, is_member: 1, preference_enabled: 0 },
    ],
  });
  const deps = dependencies();
  const service = createUserSettingsService(deps);
  const response = await service.getUserSettings(new Request("https://voxygen.test/api/user-settings"), { DB });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.settings.defaultTheme, "vox");
  assert.equal(body.settings.theme, "vox");
  assert.equal(body.settings.personalTheme, "vox");
  assert.deepEqual(body.settings.availableThemes, ["vox"]);
  assert.equal(body.settings.personalMapZoomPercent, 66);
  assert.equal(body.settings.mapZoomPercent, 82);
  assert.equal(body.settings.timezone, "UTC+5");
  assert.equal(body.settings.allNotifications, true);
  assert.equal(body.settings.eventNotifications, true);
  assert.deepEqual(body.settings.territories, [
    { id: "city-1", name: "Alpha", role: "manager", enabled: true },
    { id: "city-2", name: "Beta", role: "resident", enabled: false },
  ]);
  assert.deepEqual(deps.calls, ["world", "preferences", "global"]);
});

test("GET respects personal override opt-out markers and retains the safe vox fallback", async () => {
  const DB = createDb({
    settings: { default_theme: "unsupported", timezone: "invalid", event_notifications: 0, map_zoom_percent: 61, map_zoom_global_updated_at: 99, theme_global_updated_at: 88 },
    globalRows: [
      { setting_key: "theme", value: "vox", expires_at: null, updated_at: 88 },
      { setting_key: "map_zoom", value: "75", expires_at: null, updated_at: 99 },
    ],
  });
  const service = createUserSettingsService(dependencies());
  const response = await service.getUserSettings(new Request("https://voxygen.test/api/user-settings"), { DB });
  const body = await response.json();

  assert.equal(body.settings.defaultTheme, "vox");
  assert.equal(body.settings.personalTheme, "vox");
  assert.equal(body.settings.personalMapZoomPercent, 61);
  assert.equal(body.settings.mapZoomPercent, 61);
  assert.equal(body.settings.timezone, "UTC+3");
});

test("POST rejects invalid JSON before initializing settings tables", async () => {
  const deps = dependencies();
  const service = createUserSettingsService(deps);
  const response = await service.saveUserSettings(new Request("https://voxygen.test/api/user-settings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  }), { DB: createDb() });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "Invalid JSON" });
  assert.deepEqual(deps.calls, []);
});

test("POST preserves omitted legacy fields and writes only authorized territory preferences", async () => {
  const DB = createDb({
    settings: { default_theme: "vox", timezone: "UTC+7", event_notifications: 1, map_zoom_percent: 71 },
  });
  const service = createUserSettingsService(dependencies());
  const response = await service.saveUserSettings(new Request("https://voxygen.test/api/user-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": "signed-data" },
    body: JSON.stringify({ eventNotifications: false, territories: [{ id: "city-1", enabled: true }, { id: "city-2", enabled: true }] }),
  }), { DB });

  assert.equal(response.status, 200);
  const preferenceWrite = DB.statements.find(entry => entry.sql.includes("INSERT INTO user_preferences"));
  assert.ok(preferenceWrite);
  assert.deepEqual(preferenceWrite.values.slice(0, 8), [42, "vox", "UTC+7", 1, 0, 71, 0, 0]);
  assert.equal(typeof preferenceWrite.values[8], "number");
  const territoryWrites = DB.statements.filter(entry => entry.sql.includes("INSERT INTO territory_notification_preferences"));
  assert.equal(territoryWrites.length, 1);
  assert.deepEqual(territoryWrites[0].values.slice(0, 3), [42, "city-1", 1]);
  assert.equal((await response.json()).ok, true);
});

test("POST rejects unauthenticated requests before parsing or touching D1", async () => {
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const deps = dependencies({ requireUser: async () => ({ error: authError }) });
  const service = createUserSettingsService(deps);
  let dbCalls = 0;
  const response = await service.saveUserSettings(new Request("https://voxygen.test/api/user-settings", {
    method: "POST", body: "not-json",
  }), { DB: { prepare() { dbCalls += 1; throw new Error("unexpected DB access"); } } });
  assert.equal(response, authError);
  assert.deepEqual(deps.calls, []);
  assert.equal(dbCalls, 0);
});
