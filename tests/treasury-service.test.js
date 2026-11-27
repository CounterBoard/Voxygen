import test from "node:test";
import assert from "node:assert/strict";
import { createTreasuryService } from "../bot/src/features/treasury/service.js";

function makeDb({ existing = null, saved = null, locked = false, batchError = null } = {}) {
  const calls = [];
  let operationReads = 0;
  const db = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          calls.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT operation_id,telegram_id,operation_type,target_id,amount,status FROM financial_operations")) {
            operationReads += 1;
            return operationReads === 1 ? existing : saved;
          }
          if (this.sql.includes("SELECT 1 AS locked FROM account_deletion_locks")) {
            return locked ? { locked: 1 } : null;
          }
          return null;
        },
        async run() {
          calls.push({ method: "run", sql: this.sql, values: this.values });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.push({ method: "batch", statements });
      if (batchError) throw batchError;
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  };
  return { DB: db, calls };
}

function transferArgs(db, overrides = {}) {
  return {
    operationId: "operation-1234",
    telegramId: 1001,
    operationType: "treasury_deposit",
    targetId: "territory-1",
    amount: 50,
    debitStatement: db.prepare("DEBIT").bind(50),
    creditStatement: db.prepare("CREDIT").bind(50),
    ...overrides,
  };
}

test("new financial transfers batch idempotency record, debit, credit and final status", async () => {
  const saved = {
    operation_id: "operation-1234",
    telegram_id: 1001,
    operation_type: "treasury_deposit",
    target_id: "territory-1",
    amount: 50,
    status: "completed",
  };
  const db = makeDb({ saved });
  const service = createTreasuryService();
  const args = transferArgs(db.DB);

  const result = await service.executeIdempotentFinancialTransfer({ DB: db.DB }, args);

  assert.deepEqual(result, {
    status: "completed",
    operationId: "operation-1234",
    replayed: false,
  });
  const batch = db.calls.find(call => call.method === "batch");
  assert.equal(batch.statements.length, 4);
  assert.match(batch.statements[0].sql, /INSERT OR IGNORE INTO financial_operations/);
  assert.equal(batch.statements[1].sql, "DEBIT");
  assert.equal(batch.statements[2].sql, "CREDIT");
  assert.match(batch.statements[3].sql, /UPDATE financial_operations SET status=CASE/);
});

test("a matching operation ID replays without a second D1 batch", async () => {
  const existing = {
    operation_id: "operation-1234",
    telegram_id: 1001,
    operation_type: "treasury_deposit",
    target_id: "territory-1",
    amount: 50,
    status: "completed",
  };
  const db = makeDb({ existing });
  const service = createTreasuryService();

  const result = await service.executeIdempotentFinancialTransfer(
    { DB: db.DB },
    transferArgs(db.DB),
  );

  assert.deepEqual(result, {
    status: "completed",
    operationId: "operation-1234",
    replayed: true,
  });
  assert.equal(db.calls.some(call => call.method === "batch"), false);
});

test("reusing an operation ID for different transfer data is rejected", async () => {
  const db = makeDb({
    existing: {
      operation_id: "operation-1234",
      telegram_id: 1001,
      operation_type: "treasury_deposit",
      target_id: "territory-1",
      amount: 50,
      status: "completed",
    },
  });
  const service = createTreasuryService();

  const result = await service.executeIdempotentFinancialTransfer(
    { DB: db.DB },
    transferArgs(db.DB, { amount: 70 }),
  );

  assert.equal(result.status, 409);
  assert.match(result.error, /уже использован/);
  assert.equal(db.calls.some(call => call.method === "batch"), false);
});

test("a failed D1 batch fails closed when the account deletion lock is active", async () => {
  const db = makeDb({ locked: true, batchError: new Error("D1 constraint failure") });
  const service = createTreasuryService();

  const result = await service.executeIdempotentFinancialTransfer(
    { DB: db.DB },
    transferArgs(db.DB),
  );

  assert.equal(result.status, 409);
  assert.match(result.error, /процессе удаления/);
  assert.ok(db.calls.some(call => call.sql?.includes("SELECT 1 AS locked FROM account_deletion_locks")));
});

test("financial operation identifiers retain strict length and character bounds", () => {
  const service = createTreasuryService();
  assert.equal(service.normalizeFinancialOperationId("operation-1234"), "operation-1234");
  assert.equal(service.normalizeFinancialOperationId("short"), null);
  assert.equal(service.normalizeFinancialOperationId("operation with spaces"), null);
  assert.equal(service.normalizeFinancialOperationId("x".repeat(121)), null);
});
