import test from "node:test";
import assert from "node:assert/strict";
import { buildStaleDestinationOwnerTransferStatements } from "../bot/src/worker.js";

class StatementD1 {
  constructor() { this.statements = []; }
  prepare(sql) {
    const statement = { sql, values: [] };
    this.statements.push(statement);
    return {
      bind: (...values) => {
        statement.values = values;
        return statement;
      },
    };
  }
}

test("Telegram rekey chooses the replacement owner inside a conditional UPDATE", () => {
  const DB = new StatementD1();
  const statements = buildStaleDestinationOwnerTransferStatements({ DB }, "territory-7", 101);

  assert.equal(statements.length, 3);
  const [update, removeNewOwnerRole, removeStaleOwnerRole] = DB.statements;

  assert.match(update.sql, /^UPDATE territories SET/);
  assert.match(update.sql, /owner_telegram_id=\(SELECT tm\.telegram_id/);
  assert.match(update.sql, /ORDER BY tm\.granted_at ASC,tm\.telegram_id ASC LIMIT 1/);
  assert.match(update.sql, /WHERE id=\? AND status='approved' AND owner_telegram_id=\?/);
  assert.deepEqual(update.values, [101, 101, 101, "territory-7", 101]);

  assert.match(removeNewOwnerRole.sql, /SELECT owner_telegram_id FROM territories/);
  assert.match(removeNewOwnerRole.sql, /owner_telegram_id=territory_managers\.telegram_id/);
  assert.deepEqual(removeNewOwnerRole.values, ["territory-7", "territory-7", 101, "territory-7"]);

  assert.match(removeStaleOwnerRole.sql, /DELETE FROM territory_managers WHERE territory_id=\? AND telegram_id=\?/);
  assert.deepEqual(removeStaleOwnerRole.values, ["territory-7", 101]);
});

test("Telegram rekey no longer needs a pre-read owner candidate", () => {
  const DB = new StatementD1();
  buildStaleDestinationOwnerTransferStatements({ DB }, "territory-8", 202);
  assert.equal(DB.statements.some(({ sql }) => /^SELECT\s+tm\.telegram_id/i.test(sql.trim())), false);
});
