import test from "node:test";
import assert from "node:assert/strict";
import { transferTerritoryOwnerAfterAccountRemoval } from "../bot/src/worker.js";

class OwnerTransferD1 {
  constructor(changes, ownerId = null) {
    this.changes = changes;
    this.ownerId = ownerId;
    this.calls = [];
  }

  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          this.calls.push({ kind: "run", sql, values });
          return { meta: { changes: sql.startsWith("UPDATE territories") ? this.changes : 1 } };
        },
        first: async () => {
          this.calls.push({ kind: "first", sql, values });
          return { owner_telegram_id: this.ownerId };
        },
      }),
    };
  }
}

test("owner handoff is conditional on the territory still belonging to the removed account", async () => {
  const db = new OwnerTransferD1(0, 22);
  await transferTerritoryOwnerAfterAccountRemoval({ DB: db }, "territory-1", 11);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /owner_telegram_id=\?$/);
  assert.deepEqual(db.calls[0].values, [11, 11, 11, "territory-1", 11]);
});

test("new manager role is removed only after a successful ownership transfer and while still owner", async () => {
  const db = new OwnerTransferD1(1, 22);
  await transferTerritoryOwnerAfterAccountRemoval({ DB: db }, "territory-1", 11);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].sql, /ORDER BY tm\.granted_at ASC,tm\.telegram_id ASC LIMIT 1/);
  assert.match(db.calls[2].sql, /EXISTS\(SELECT 1 FROM territories WHERE id=\? AND owner_telegram_id=\?\)/);
  assert.deepEqual(db.calls[2].values, ["territory-1", 22, "territory-1", 22]);
});
