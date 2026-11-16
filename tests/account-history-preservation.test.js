import test from "node:test";
import assert from "node:assert/strict";
import { preserveAccountHistoryAuthor } from "../bot/src/worker.js";

class HistoryD1 {
  constructor(failOn) { this.failOn = failOn; this.calls = []; }
  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          this.calls.push({ sql, values });
          if (sql.startsWith(this.failOn)) throw new Error(`simulated D1 failure: ${this.failOn}`);
          return { meta: { changes: 1 } };
        },
      }),
    };
  }
}

for (const table of ["UPDATE comments", "UPDATE screenshots"]) {
  test(`account deletion stops when historical author preservation fails for ${table}`, async () => {
    const DB = new HistoryD1(table);
    await assert.rejects(
      preserveAccountHistoryAuthor({ DB }, 12345, "FormerPlayer"),
      new RegExp(`simulated D1 failure: ${table}`),
    );
    assert.equal(DB.calls.at(-1).sql.startsWith(table), true);
    if (table === "UPDATE screenshots") {
      assert.equal(DB.calls[0].sql.startsWith("UPDATE comments"), true);
      assert.equal(DB.calls.length, 2);
    } else {
      assert.equal(DB.calls.length, 1);
    }
  });
}

test("historical author preservation fills only missing snapshots", async () => {
  const DB = new HistoryD1(null);
  await preserveAccountHistoryAuthor({ DB }, 12345, "FormerPlayer");
  assert.equal(DB.calls.length, 2);
  assert.ok(DB.calls.every(({ sql, values }) => sql.includes("COALESCE(author_mc_nickname,?)")
    && values[0] === "FormerPlayer" && values[1] === 12345));
});
