import test from "node:test";
import assert from "node:assert/strict";
import { completeRequiredAccountCleanup } from "../bot/src/worker.js";

class CleanupD1 {
  constructor(failSql = null) {
    this.failSql = failSql;
    this.executed = [];
  }

  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          this.executed.push({ sql, values });
          if (sql.includes(this.failSql || "\u0000")) {
            throw new Error(`simulated D1 failure: ${this.failSql}`);
          }
          return { success: true, meta: { changes: 1 } };
        },
      }),
    };
  }
}

for (const table of ["inspectors", "user_items", "user_currency"]) {
  test(`required account cleanup propagates a DELETE failure in ${table}`, async () => {
    const db = new CleanupD1(`DELETE FROM ${table}`);
    await assert.rejects(
      completeRequiredAccountCleanup({ DB: db }, 12345),
      new RegExp(`simulated D1 failure: DELETE FROM ${table}`),
    );
    assert.equal(db.executed.length, ["inspectors", "user_items", "user_currency"].indexOf(table) + 1);
  });
}

test("required account cleanup removes all personal tables in order", async () => {
  const db = new CleanupD1();
  await completeRequiredAccountCleanup({ DB: db }, 12345);
  assert.deepEqual(
    db.executed.map((entry) => entry.sql.match(/DELETE FROM ([a-z_]+)/)?.[1]),
    ["inspectors", "user_items", "user_currency"],
  );
  assert.ok(db.executed.every((entry) => entry.values[0] === 12345));
});
