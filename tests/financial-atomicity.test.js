import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../bot/src/worker.js", import.meta.url), "utf8");
function bodyOf(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} exists`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("financial transfer helper keeps idempotency insert, debit, credit and status in one D1 batch", () => {
  const body = bodyOf("executeIdempotentFinancialTransfer");
  assert.match(body, /INSERT OR IGNORE INTO financial_operations/);
  assert.match(body, /env\.DB\.batch\(\[/);
  assert.match(body, /debitStatement/);
  assert.match(body, /creditStatement/);
  assert.match(body, /UPDATE financial_operations SET status=CASE WHEN changes\(\)=1 THEN 'completed' ELSE 'rejected' END/);
  assert.match(body, /operation_id,telegram_id,operation_type,target_id,amount,status/);
  assert.match(body, /existing\.operation_type!==operationType/);
  assert.match(body, /existing\.target_id\).*String\(targetId\)/);
  assert.match(body, /existing\.amount\).*Number\(amount\)/);
});

test("treasury transfer endpoints use conditional debits and atomic idempotent helper", () => {
  for (const name of ["treasuryDeposit", "treasuryDonate", "treasuryWithdraw"]) {
    const body = bodyOf(name);
    assert.match(body, /executeIdempotentFinancialTransfer\(env,/);
    assert.match(body, /WHERE .*balance>=\? AND changes\(\)=1/s);
    assert.match(body, /operationId:body\?\.operationId/);
  }
  assert.match(bodyOf("treasuryDeposit"), /ON CONFLICT\(territory_id\) DO UPDATE SET balance=city_treasury\.balance\+excluded\.balance/);
  assert.match(bodyOf("treasuryWithdraw"), /ON CONFLICT\(telegram_id\) DO UPDATE SET balance=user_currency\.balance\+excluded\.balance/);
});

test("customization purchase debits only if item is not already owned and grants inventory only after debit", () => {
  const body = bodyOf("purchaseCustomizationItem");
  assert.match(body, /balance>=\? AND NOT EXISTS \(SELECT 1 FROM (?:city_items|user_items)/);
  assert.match(body, /INSERT INTO (?:city_items|user_items).*SELECT .*WHERE changes\(\)=1/s);
  assert.match(body, /env\.DB\.batch\(\[/);
  assert.match(body, /gem_spend_log/);
  assert.match(body, /if\(!purchaseBatch\?\.\[0\]\?\.meta\?\.changes\)/);
});

test("operation identifiers are length- and character-bounded", () => {
  const body = bodyOf("normalizeFinancialOperationId");
  assert.match(body, /\^\[A-Za-z0-9\._:-\]\{8,120\}\$/);
});
