import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseInitialization } from "../bot/src/db/initialization.js";

function worldDependencies(calls = []) {
  return {
    ensureManagerChangeTables: async () => { calls.push("ensureManagerChangeTables"); },
    cleanupCustomizationCategories: async () => { calls.push("cleanupCustomizationCategories"); },
    ensureUserDirectoryTable: async () => { calls.push("ensureUserDirectoryTable"); },
  };
}

function createDb({
  schemaVersion = null,
  worldSchemaVersion = null,
  recruitmentColumns = [],
  failRunCount = 0,
} = {}) {
  const calls = [];
  let failuresRemaining = failRunCount;

  function statement(sql, values = []) {
    return {
      bind(...bound) {
        return statement(sql, bound);
      },
      async run() {
        calls.push({ method: "run", sql: String(sql), values });
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          throw new Error("simulated D1 failure");
        }
        return { success: true, meta: { changes: 1 } };
      },
      async first() {
        calls.push({ method: "first", sql: String(sql), values });
        if (String(sql).includes("recruitment_schema_version")) {
          return schemaVersion ? { value: schemaVersion } : null;
        }
        if (String(sql).includes("world_schema_version")) {
          return worldSchemaVersion ? { value: worldSchemaVersion } : null;
        }
        return null;
      },
      async all() {
        calls.push({ method: "all", sql: String(sql), values });
        if (String(sql).includes("PRAGMA table_info(recruitment)")) {
          return { results: recruitmentColumns.map(name => ({ name })) };
        }
        return { results: [] };
      },
    };
  }

  return {
    DB: { prepare(sql) { return statement(sql); } },
    calls,
  };
}

test("recruitment initialization applies the existing versioned contact column migration", async () => {
  const { ensureRecruitmentTable } = createDatabaseInitialization();
  const db = createDb({ recruitmentColumns: ["territory_id", "description", "enabled", "updated_at"] });
  const env = { DB: db.DB };

  await ensureRecruitmentTable(env);

  const sql = db.calls.map(call => call.sql);
  assert.ok(sql.some(query => query.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta")));
  assert.ok(sql.some(query => query.includes("CREATE TABLE IF NOT EXISTS recruitment")));
  assert.ok(sql.some(query => query.includes("PRAGMA table_info(recruitment)")));
  assert.ok(sql.some(query => query.includes("ALTER TABLE recruitment ADD COLUMN contact_username TEXT")));
  assert.ok(sql.some(query => query.includes("recruitment_schema_version")));
});

test("recruitment initialization skips migration when the current schema version is recorded", async () => {
  const { ensureRecruitmentTable } = createDatabaseInitialization();
  const db = createDb({ schemaVersion: "2026-10-v25" });
  await ensureRecruitmentTable({ DB: db.DB });

  const sql = db.calls.map(call => call.sql);
  assert.ok(sql.some(query => query.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta")));
  assert.ok(sql.some(query => query.includes("recruitment_schema_version")));
  assert.ok(!sql.some(query => query.includes("CREATE TABLE IF NOT EXISTS recruitment")));
  assert.ok(!sql.some(query => query.includes("ALTER TABLE recruitment")));
});

test("recruitment initialization is cached per environment and shares concurrent work", async () => {
  const { ensureRecruitmentTable } = createDatabaseInitialization();
  const db = createDb({ schemaVersion: "2026-10-v25" });
  const env = { DB: db.DB };

  await Promise.all([
    ensureRecruitmentTable(env),
    ensureRecruitmentTable(env),
    ensureRecruitmentTable(env),
  ]);
  const metaCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta"));
  assert.equal(metaCreates.length, 1);
});

test("failed recruitment initialization clears its cache so a retry can succeed", async () => {
  const { ensureRecruitmentTable } = createDatabaseInitialization();
  const db = createDb({ schemaVersion: "2026-10-v25", failRunCount: 1 });
  const env = { DB: db.DB };

  await assert.rejects(ensureRecruitmentTable(env), /simulated D1 failure/);
  await ensureRecruitmentTable(env);

  const metaCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta"));
  assert.equal(metaCreates.length, 2);
});

test("world schema initialization is cached and skips a recorded current version", async () => {
  const calls = [];
  const initialization = createDatabaseInitialization(worldDependencies(calls));
  const db = createDb({ worldSchemaVersion: "2026-11-v41" });
  const env = { DB: db.DB };

  await Promise.all([
    initialization.ensureWorldTables(env),
    initialization.ensureWorldTables(env),
    initialization.ensureWorldTables(env),
  ]);

  const metaCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta"));
  assert.equal(metaCreates.length, 1);
  assert.deepEqual(calls, []);
});

test("world schema migration keeps its dependent cleanup/bootstrap steps and writes version last", async () => {
  const calls = [];
  const initialization = createDatabaseInitialization(worldDependencies(calls));
  const db = createDb();
  const env = { DB: db.DB };

  await initialization.ensureWorldTables(env);

  assert.deepEqual(calls, [
    "ensureManagerChangeTables",
    "cleanupCustomizationCategories",
    "ensureUserDirectoryTable",
  ]);
  const lastRun = db.calls.filter(call => call.method === "run").at(-1);
  assert.match(lastRun.sql, /world_schema_version/);
});

test("failed world schema initialization clears its cache so a retry can succeed", async () => {
  const calls = [];
  const initialization = createDatabaseInitialization(worldDependencies(calls));
  const db = createDb({ worldSchemaVersion: "2026-11-v41", failRunCount: 1 });
  const env = { DB: db.DB };

  await assert.rejects(initialization.ensureWorldTables(env), /simulated D1 failure/);
  await initialization.ensureWorldTables(env);

  const metaCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS voxygen_schema_meta"));
  assert.equal(metaCreates.length, 2);
});

test("app_settings initialization is cached per environment", async () => {
  const { ensureMapSettingsTable } = createDatabaseInitialization();
  const db = createDb();
  const env = { DB: db.DB };

  await Promise.all([
    ensureMapSettingsTable(env),
    ensureMapSettingsTable(env),
    ensureMapSettingsTable(env),
  ]);

  const appSettingsCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS app_settings"));
  assert.equal(appSettingsCreates.length, 1);
});

test("failed app_settings initialization clears its cache so a retry can succeed", async () => {
  const { ensureMapSettingsTable } = createDatabaseInitialization();
  const db = createDb({ failRunCount: 1 });
  const env = { DB: db.DB };

  await assert.rejects(ensureMapSettingsTable(env), /simulated D1 failure/);
  await ensureMapSettingsTable(env);

  const appSettingsCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS app_settings"));
  assert.equal(appSettingsCreates.length, 2);
});
