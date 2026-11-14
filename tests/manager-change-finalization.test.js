import test from "node:test";
import assert from "node:assert/strict";
import { claimManagerChangeFinalization, recordManagerChangeVote } from "../bot/src/worker.js";

class ManagerClaimD1 {
  constructor(status = "pending", finalizingAt = null) {
    this.row = { status, finalizing_at: finalizingAt };
    this.lastSql = "";
    this.lastValues = [];
  }

  prepare(sql) {
    this.lastSql = sql;
    return {
      bind: (...values) => {
        this.lastValues = values;
        return {
          run: async () => {
            if (sql.includes("SET status='finalizing'")) {
              if (this.row.status !== "pending") return { meta: { changes: 0 } };
              this.row.status = "finalizing";
              this.row.finalizing_at = values[0];
              return { meta: { changes: 1 } };
            }
            if (sql.includes("SET finalizing_at=?")) {
              const [claimedAt, , staleBefore] = values;
              if (this.row.status !== "finalizing" || Number(this.row.finalizing_at || 0) > staleBefore) {
                return { meta: { changes: 0 } };
              }
              this.row.finalizing_at = claimedAt;
              return { meta: { changes: 1 } };
            }
            if (sql.includes("INSERT INTO manager_change_votes")) {
              const allowed = this.row.status === "pending";
              return { meta: { changes: allowed ? 1 : 0 } };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
        };
      },
    };
  }
}

test("only one worker can claim a pending manager-change request", async () => {
  const db = new ManagerClaimD1("pending");
  assert.equal(await claimManagerChangeFinalization({ DB: db }, "req-1", "pending", 1000), true);
  assert.equal(await claimManagerChangeFinalization({ DB: db }, "req-1", "pending", 1001), false);
  assert.equal(db.row.status, "finalizing");
  assert.equal(db.row.finalizing_at, 1000);
});

test("a stale finalization claim can be recovered once after a worker crash", async () => {
  const db = new ManagerClaimD1("finalizing", 1000);
  assert.equal(await claimManagerChangeFinalization({ DB: db }, "req-2", "finalizing", 62001), true);
  assert.equal(db.row.finalizing_at, 62001);
  assert.equal(await claimManagerChangeFinalization({ DB: db }, "req-2", "finalizing", 62002), false);
});

test("manager votes are accepted only while the request remains pending", async () => {
  const pending = new ManagerClaimD1("pending");
  const accepted = await recordManagerChangeVote({ DB: pending }, "req-3", 77, true, 500);
  assert.equal(accepted.meta.changes, 1);
  assert.match(pending.lastSql, /WHERE EXISTS\(SELECT 1 FROM manager_change_requests WHERE id=\? AND status='pending'\)/);
  assert.deepEqual(pending.lastValues, ["req-3", 77, 1, 500, "req-3"]);

  const finalizing = new ManagerClaimD1("finalizing", 500);
  const rejected = await recordManagerChangeVote({ DB: finalizing }, "req-3", 77, false, 600);
  assert.equal(rejected.meta.changes, 0);
});
