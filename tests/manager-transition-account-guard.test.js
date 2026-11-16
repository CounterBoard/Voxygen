import test from "node:test";
import assert from "node:assert/strict";
import { applyManagerChange } from "../bot/src/worker.js";

class ManagerTransitionD1 {
  constructor() { this.manager = false; this.member = true; this.batchStatements = []; }
  prepare(sql) {
    let values = [];
    const normalized = sql.replace(/\\s+/g, " ").trim();
    return {
      bind: (...args) => { values = args; return {
        first: async () => {
          if (normalized.includes("SELECT id,name,owner_telegram_id FROM territories")) return { id: "t-1", name: "Test", owner_telegram_id: null };
          if (normalized.includes("SELECT 1 FROM territory_managers")) return this.manager ? { 1: 1 } : null;
          if (normalized.includes("SELECT 1 FROM city_memberships")) return this.member ? { 1: 1 } : null;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
        statement: { sql: normalized, values },
      }; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 1 } }),
    };
  }
  async batch(statements) {
    this.batchStatements = statements.map(x => x.statement);
    this.manager = true; this.member = false;
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
}

test("promotion SQL rechecks verified account and nickname at write time", async () => {
  const DB = new ManagerTransitionD1();
  const changed = await applyManagerChange({ DB }, { territoryId: "t-1", targetId: 42, action: "promote", initiatorId: 7 });
  assert.equal(changed, true);
  const insert = DB.batchStatements.find(x => x.sql.includes("INSERT OR IGNORE INTO territory_managers"));
  assert.match(insert.sql, /EXISTS\(SELECT 1 FROM users WHERE telegram_id=\? AND status='verified'/);
  assert.match(insert.sql, /trim\(COALESCE\(mc_nickname,''\)\)<>''/);
  assert.equal(insert.values.at(-1), 42);
});
