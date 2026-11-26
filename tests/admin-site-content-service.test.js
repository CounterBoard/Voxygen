import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FAQ_TEXT,
  getFaq,
  saveFaq,
  DEFAULT_HOME_FEATURE_BUTTON,
  normalizeHomeFeatureButton,
  getHomeFeatureButton,
  saveHomeFeatureButton,
} from "../bot/src/features/admin-tools/site-content.js";
import worker from "../bot/src/worker.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function dbReturning(value) {
  return {
    prepare() {
      return {
        bind() { return this; },
        async first() { return value; },
        async run() { return { success: true }; },
      };
    },
  };
}

test("FAQ keeps its default content when no stored value exists", async () => {
  let ensured = 0;
  const response = await getFaq(
    { DB: dbReturning(null) },
    { ensureMapSettingsTable: async () => { ensured += 1; }, json },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.text, DEFAULT_FAQ_TEXT);
  assert.equal(ensured, 1);
});

test("FAQ save checks main-inspector authorization before validating or writing", async () => {
  let dbCalls = 0;
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const response = await saveFaq(
    new Request("https://voxygen.test/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "A valid FAQ" }),
    }),
    { DB: { prepare() { dbCalls += 1; throw new Error("unexpected D1 access"); } } },
    {
      requireMainInspector: async () => ({ error: authError }),
      ensureMapSettingsTable: async () => {},
      json,
    },
  );

  assert.equal(response, authError);
  assert.equal(response.status, 401);
  assert.equal(dbCalls, 0);
});

test("FAQ save rejects empty and oversized text before table access", async () => {
  let ensured = 0;
  const dependencies = {
    requireMainInspector: async () => ({ user: { id: 1 } }),
    ensureMapSettingsTable: async () => { ensured += 1; },
    json,
  };
  const empty = await saveFaq(
    new Request("https://voxygen.test/api/faq", { method: "POST", body: JSON.stringify({ text: "  " }) }),
    { DB: dbReturning(null) },
    dependencies,
  );
  const oversized = await saveFaq(
    new Request("https://voxygen.test/api/faq", { method: "POST", body: JSON.stringify({ text: "x".repeat(12001) }) }),
    { DB: dbReturning(null) },
    dependencies,
  );

  assert.equal(empty.status, 400);
  assert.equal(oversized.status, 400);
  assert.equal(ensured, 0);
});

test("home feature button normalization limits fields and accepts only a bounded data image", () => {
  const normalized = normalizeHomeFeatureButton(JSON.stringify({
    imageData: "https://example.com/image.png",
    title: "T".repeat(90),
    subtitle: "S".repeat(160),
    text: "X".repeat(6100),
    hidden: 1,
  }));

  assert.equal(normalized.imageData, "");
  assert.equal(normalized.title.length, 80);
  assert.equal(normalized.subtitle.length, 140);
  assert.equal(normalized.text.length, 6000);
  assert.equal(normalized.hidden, false);
  assert.equal(normalizeHomeFeatureButton("{malformed").title, DEFAULT_HOME_FEATURE_BUTTON.title);
});

test("hidden home feature content is redacted for ordinary users", async () => {
  let ensureWorld = 0;
  let ensureSettings = 0;
  let roleArguments = null;
  const config = {
    imageData: "data:image/png;base64,AAAA",
    title: "Скрытая кнопка",
    subtitle: "Private",
    text: "Private content",
    hidden: true,
  };
  const response = await getHomeFeatureButton(
    new Request("https://voxygen.test/api/home-feature-button"),
    { DB: dbReturning({ value: JSON.stringify(config) }) },
    {
      requireUser: async () => ({ user: { id: 123, username: "player" } }),
      ensureWorldTables: async () => { ensureWorld += 1; },
      ensureMapSettingsTable: async () => { ensureSettings += 1; },
      getRoleByTelegramId: async (...args) => { roleArguments = args; return "resident"; },
      json,
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, config: { ...DEFAULT_HOME_FEATURE_BUTTON, hidden: true } });
  assert.equal(ensureWorld, 1);
  assert.equal(ensureSettings, 1);
  assert.deepEqual(roleArguments, [{ DB: dbReturning({ value: JSON.stringify(config) }) }, 123, "player"]);
});

test("main inspector can read the configured hidden home feature content", async () => {
  const config = { imageData: "", title: "Открыто", subtitle: "Подзаголовок", text: "Информация", hidden: true };
  const response = await getHomeFeatureButton(
    new Request("https://voxygen.test/api/home-feature-button"),
    { DB: dbReturning({ value: JSON.stringify(config) }) },
    {
      requireUser: async () => ({ user: { id: 1, username: "inspector" } }),
      ensureWorldTables: async () => {},
      ensureMapSettingsTable: async () => {},
      getRoleByTelegramId: async () => "main_inspector",
      json,
    },
  );

  assert.deepEqual((await response.json()).config, config);
});

test("saving an unsupported home button image returns 413 before settings-table access", async () => {
  let ensured = 0;
  const response = await saveHomeFeatureButton(
    new Request("https://voxygen.test/api/home-feature-button", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: "data:text/html;base64,AAAA" }),
    }),
    { DB: dbReturning(null) },
    {
      requireMainInspector: async () => ({ user: { id: 1 } }),
      ensureMapSettingsTable: async () => { ensured += 1; },
      json,
    },
  );

  assert.equal(response.status, 413);
  assert.equal(ensured, 0);
});

test("Worker keeps the existing public/private route split and delegates to the content service", () => {
  const app = readFileSync(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const appShell = app.slice(app.indexOf("export default {"));
  const service = readFileSync(new URL("../bot/src/features/admin-tools/site-content.js", import.meta.url), "utf8");

  assert.ok(appShell.includes("return getFaq(env, { ensureMapSettingsTable, json })"));
  assert.ok(appShell.includes("return saveFaq(request, env, { requireMainInspector, ensureMapSettingsTable, json })"));
  assert.ok(appShell.includes("return getHomeFeatureButton(request, env, { requireUser, ensureWorldTables, ensureMapSettingsTable, getRoleByTelegramId, json })"));
  assert.ok(appShell.includes("return saveHomeFeatureButton(request, env, { requireMainInspector, ensureMapSettingsTable, json })"));
  assert.doesNotMatch(appShell, /function (getFaq|saveFaq|getHomeFeatureButton|saveHomeFeatureButton)\(/);
  assert.ok(service.includes("hidden && role !== 'main_inspector'"));
});
