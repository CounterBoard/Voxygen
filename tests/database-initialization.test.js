import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseInitialization } from "../bot/src/db/initialization.js";

function worldDependencies(calls = []) {
  return {
    cleanupCustomizationCategories: async () => { calls.push("cleanupCustomizationCategories"); },
  };
}

function createDb({
  schemaVersion = null,
  worldSchemaVersion = null,
  recruitmentColumns = [],
  userPreferenceColumns = [],
  managerChangeColumns = [],
  userDirectoryColumns = [],
  failRunCount = 0,
  failSql = null,
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
        if (failuresRemaining > 0 && (!failSql || String(sql).includes(failSql))) {
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
        if (String(sql).includes("PRAGMA table_info(user_preferences)")) {
          return { results: userPreferenceColumns.map(name => ({ name })) };
        }
        if (String(sql).includes("PRAGMA table_info(manager_change_requests)")) {
          return { results: managerChangeColumns.map(name => ({ name })) };
        }
        if (String(sql).includes("PRAGMA table_info(user_directory)")) {
          return { results: userDirectoryColumns.map(name => ({ name })) };
        }
        return { results: [] };
      },
    };
  }

  return {
    DB: {
      prepare(sql) { return statement(sql); },
      async batch(statements) {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      },
    },
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

  assert.deepEqual(calls, ["cleanupCustomizationCategories"]);
  const runSql = db.calls.filter(call => call.method === "run").map(call => call.sql);
  assert.ok(runSql.some(query => query.includes("CREATE TABLE IF NOT EXISTS account_deletion_locks")));
  assert.ok(runSql.some(query => query.includes("CREATE TABLE IF NOT EXISTS user_directory")));
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

test("event tables initialize after world schema and share one cached promise", async () => {
  const calls = [];
  const initialization = createDatabaseInitialization(worldDependencies(calls));
  const db = createDb({ worldSchemaVersion: "2026-11-v41" });
  const env = { DB: db.DB };

  await Promise.all([
    initialization.ensureEventsTables(env),
    initialization.ensureEventsTables(env),
    initialization.ensureEventsTables(env),
  ]);

  const sql = db.calls.filter(call => call.method === "run").map(call => call.sql);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS events")).length, 1);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS event_reminders")).length, 1);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS event_create_requests")).length, 1);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS bank_transactions")).length, 1);
  assert.deepEqual(calls, []);
  assert.ok(db.calls.findIndex(call => call.sql.includes("world_schema_version")) <
    db.calls.findIndex(call => call.sql.includes("CREATE TABLE IF NOT EXISTS events")));
});

test("failed event table initialization clears its cache so a retry can succeed", async () => {
  const initialization = createDatabaseInitialization(worldDependencies());
  const db = createDb({
    worldSchemaVersion: "2026-11-v41",
    failRunCount: 1,
    failSql: "CREATE TABLE IF NOT EXISTS events",
  });
  const env = { DB: db.DB };

  await assert.rejects(initialization.ensureEventsTables(env), /simulated D1 failure/);
  await initialization.ensureEventsTables(env);

  const eventsCreates = db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS events"));
  assert.equal(eventsCreates.length, 2);
});

test("user preference initializer is world-first, cached and migrates missing columns", async () => {
  const initialization = createDatabaseInitialization(worldDependencies());
  const db = createDb({
    worldSchemaVersion: "2026-11-v41",
    userPreferenceColumns: ["telegram_id", "default_theme", "timezone", "all_notifications", "event_notifications", "map_zoom_percent", "updated_at"],
  });
  const env = { DB: db.DB };
  await Promise.all([
    initialization.ensureUserPreferenceTables(env),
    initialization.ensureUserPreferenceTables(env),
    initialization.ensureUserPreferenceTables(env),
  ]);
  const sql = db.calls.filter(call => call.method === "run").map(call => call.sql);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS user_preferences")).length, 1);
  assert.equal(sql.filter(query => query.includes("CREATE TABLE IF NOT EXISTS territory_notification_preferences")).length, 1);
  assert.ok(sql.some(query => query.includes("ALTER TABLE user_preferences ADD COLUMN map_zoom_global_updated_at")));
  assert.ok(sql.some(query => query.includes("ALTER TABLE user_preferences ADD COLUMN theme_global_updated_at")));
  assert.ok(sql.some(query => query.includes("guard_user_preferences_deletion_lock_insert")));
});

test("failed user preference initialization clears its cache for retry", async () => {
  const initialization = createDatabaseInitialization(worldDependencies());
  const db = createDb({
    worldSchemaVersion: "2026-11-v41",
    failRunCount: 1,
    failSql: "CREATE TABLE IF NOT EXISTS user_preferences",
  });
  const env = { DB: db.DB };
  await assert.rejects(initialization.ensureUserPreferenceTables(env), /simulated D1 failure/);
  await initialization.ensureUserPreferenceTables(env);
  assert.equal(db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS user_preferences")).length, 2);
});

test("global settings tables are initialized in one cached D1 batch", async () => {
  const initialization = createDatabaseInitialization();
  const db = createDb();
  const env = { DB: db.DB };
  await Promise.all([
    initialization.ensureGlobalSettingsTable(env),
    initialization.ensureGlobalSettingsTable(env),
    initialization.ensureGlobalSettingsTable(env),
  ]);
  assert.equal(db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS theme_access_settings")).length, 1);
  assert.equal(db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS global_setting_overrides")).length, 1);
});

test("failed global settings initialization clears its cache for retry", async () => {
  const initialization = createDatabaseInitialization();
  const db = createDb({ failRunCount: 1, failSql: "CREATE TABLE IF NOT EXISTS theme_access_settings" });
  const env = { DB: db.DB };
  await assert.rejects(initialization.ensureGlobalSettingsTable(env), /simulated D1 failure/);
  await initialization.ensureGlobalSettingsTable(env);
  assert.equal(db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS theme_access_settings")).length, 2);
});

test("manager change tables remain repeatable and preserve the finalizing_at migration", async () => {
  const initialization = createDatabaseInitialization();
  const db = createDb({ managerChangeColumns: ["finalizing_at"] });
  const env = { DB: db.DB };
  await initialization.ensureManagerChangeTables(env);
  await initialization.ensureManagerChangeTables(env);
  assert.equal(db.calls.filter(call => call.sql.includes("CREATE TABLE IF NOT EXISTS account_deletion_locks")).length, 2);
  assert.equal(db.calls.filter(call => call.sql.includes("PRAGMA table_info(manager_change_requests)")).length, 2);
  assert.equal(db.calls.filter(call => call.sql.includes("guard_manager_change_requests_deletion_lock_insert")).length, 2);
  assert.equal(db.calls.filter(call => call.sql.includes("ALTER TABLE manager_change_requests ADD COLUMN finalizing_at")).length, 0);
});

test("approval session cleanup deliberately runs for each initializer call", async () => {
  const initialization = createDatabaseInitialization();
  const db = createDb();
  const env = { DB: db.DB };
  await initialization.ensureApprovalSessionsTable(env);
  await initialization.ensureApprovalSessionsTable(env);
  assert.equal(db.calls.filter(call => call.sql.includes("DELETE FROM territory_approval_sessions AS older")).length, 2);
  assert.equal(db.calls.filter(call => call.sql.includes("idx_territory_approval_sessions_chat")).length, 2);
});

test("user directory initializer adds the hidden column to legacy installations", async () => {
  const initialization = createDatabaseInitialization();
  const db = createDb({ userDirectoryColumns: ["id", "telegram_id", "telegram_username", "mc_nickname", "auto_linked", "created_at", "updated_at"] });
  await initialization.ensureUserDirectoryTable({ DB: db.DB });
  assert.ok(db.calls.some(call => call.sql.includes("CREATE TABLE IF NOT EXISTS user_directory")));
  assert.ok(db.calls.some(call => call.sql.includes("PRAGMA table_info(user_directory)")));
  assert.ok(db.calls.some(call => call.sql.includes("ALTER TABLE user_directory ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")));
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
