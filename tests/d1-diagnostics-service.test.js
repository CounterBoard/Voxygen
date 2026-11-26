import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getD1Diagnostics, sqlIdentifier } from "../bot/src/features/admin-tools/d1-diagnostics.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

test("SQL identifiers are quoted and embedded quotes are escaped", () => {
  assert.equal(sqlIdentifier("territories"), '"territories"');
  assert.equal(sqlIdentifier('odd"name'), '"odd""name"');
});

test("main-inspector authorization runs before D1 access", async () => {
  let dbCalls = 0;
  const authError = json({ ok: false, code: "AUTHENTICATION_REQUIRED" }, 401);
  const response = await getD1Diagnostics(
    new Request("https://voxygen.test/api/admin/diagnostics/d1"),
    { DB: { prepare() { dbCalls += 1; throw new Error("D1 must not be reached"); } } },
    {
      requireMainInspector: async () => ({ error: authError }),
      json,
    },
  );

  assert.equal(response, authError);
  assert.equal(response.status, 401);
  assert.equal(dbCalls, 0);
});

test("missing D1 binding returns the existing unavailable response", async () => {
  const response = await getD1Diagnostics(
    new Request("https://voxygen.test/api/admin/diagnostics/d1"),
    {},
    {
      requireMainInspector: async () => ({ user: { id: 1 } }),
      json,
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "Диагностика D1 недоступна" });
});

test("D1 diagnostics returns a read-only inventory and issues only SELECT/PRAGMA statements", async () => {
  const statements = [];
  const databaseTables = ["territories", "users"];
  const DB = {
    prepare(sql) {
      const statement = String(sql);
      statements.push(statement);
      return {
        async first() {
          return { row_count: 0 };
        },
        async all() {
          if (statement.includes("sqlite_master")) {
            return { results: databaseTables.map(name => ({ name })) };
          }
          return { results: [] };
        },
      };
    },
  };

  const response = await getD1Diagnostics(
    new Request("https://voxygen.test/api/admin/diagnostics/d1"),
    { DB },
    {
      requireMainInspector: async () => ({ user: { id: 1 } }),
      json,
    },
  );
  const report = await response.json();

  assert.equal(response.status, 200);
  assert.equal(report.ok, true);
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.tables, [
    { table: "territories", rows: 0 },
    { table: "users", rows: 0 },
  ]);
  assert.ok(statements.length >= 4);
  assert.ok(statements.every(sql => /^(SELECT|PRAGMA)\b/i.test(sql.trimStart())), statements.join("\n"));
  assert.ok(!statements.some(sql => /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE)\b/i.test(sql)));
});

test("the diagnostics service stays read-only and never invokes schema bootstrap", () => {
  const source = readFileSync(
    new URL("../bot/src/features/admin-tools/d1-diagnostics.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /deliberately avoids ensureWorldTables/);
  assert.doesNotMatch(source, /ensureWorldTables|CREATE TABLE|INSERT INTO|UPDATE .* SET|DELETE FROM/);
});
