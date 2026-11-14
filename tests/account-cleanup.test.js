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
      all: async () => ({ results: [{ name: "finalizing_at" }] }),
      bind: (...values) => ({
        run: async () => {
          if (sql.startsWith("CREATE TABLE")) return { success: true, meta: { changes: 0 } };
          this.executed.push({ sql, values });
          if (this.failSql && sql.includes(this.failSql)) {
            throw new Error(`simulated D1 failure: ${this.failSql}`);
          }
          return { success: true, meta: { changes: 1 } };
        },
      }),
    };
  }
}

const requiredStatements = [
  ["manager_change_requests", "UPDATE manager_change_requests"],
  ["manager_change_votes", "DELETE FROM manager_change_votes"],
  ["inspectors", "DELETE FROM inspectors"],
  ["user_items", "DELETE FROM user_items"],
  ["user_currency", "DELETE FROM user_currency"],
];

for (const [table, statement] of requiredStatements) {
  test(`required account cleanup propagates a failure in ${table}`, async () => {
    const db = new CleanupD1(statement);
    await assert.rejects(
      completeRequiredAccountCleanup({ DB: db }, 12345),
      (error) => error.message.includes(`simulated D1 failure: ${statement}`),
    );
    assert.equal(db.executed.length, requiredStatements.findIndex(([name]) => name === table) + 1);
  });
}

test("required account cleanup processes manager relations and personal tables in order", async () => {
  const db = new CleanupD1();
  await completeRequiredAccountCleanup({ DB: db }, 12345);
  assert.deepEqual(
    db.executed.map((entry) => entry.sql.startsWith("UPDATE")
      ? "UPDATE manager_change_requests"
      : entry.sql.match(/DELETE FROM [a-z_]+/)?.[0]),
    requiredStatements.map(([, statement]) => statement),
  );
  assert.ok(db.executed.every((entry) => entry.values.includes(12345)));
});
