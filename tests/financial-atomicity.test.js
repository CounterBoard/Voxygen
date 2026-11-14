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

test("banker transfers refuse locked accounts without attempting currency inserts or updates", () => {
  const handler = bodyOf("handleBankMessage");
  const apply = bodyOf("applyBankBalanceChange");
  assert.match(handler, /INSERT OR IGNORE INTO user_currency\(telegram_id,balance\) SELECT \?,0 WHERE NOT EXISTS\(SELECT 1 FROM account_deletion_locks WHERE telegram_id=\?\)/);
  assert.match(apply, /UPDATE user_currency SET balance=balance-\?.*NOT EXISTS\(SELECT 1 FROM account_deletion_locks WHERE telegram_id=\?\)/);
  assert.match(apply, /UPDATE user_currency SET balance=balance\+\?.*NOT EXISTS\(SELECT 1 FROM account_deletion_locks WHERE telegram_id=\?\)/);
  assert.match(apply, /UPDATE bank_transactions[\s\S]*status='rejected'[\s\S]*changes\(\)=0/);
});


test("treasury transfer entry points and idempotent batch fail closed for deletion-locked users", () => {
  const source = readFileSync(new URL("../bot/src/worker.js", import.meta.url), "utf8").replace(/\s+/g, " ");
  for (const name of ["treasuryDeposit", "treasuryDonate", "treasuryWithdraw", "getCustomization"]) {
    const body = bodyOf(name).replace(/\s+/g, " ");
    assert.ok(body.includes("INSERT OR IGNORE INTO user_currency") && body.includes("NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)"), name+" must guard balance initialization");
  }
  const transfer = bodyOf("executeIdempotentFinancialTransfer");
  assert.match(transfer, /try\s*\{\s*batchResult=await env\.DB\.batch/);
  assert.match(transfer, /SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=\?/);
  assert.match(transfer, /Аккаунт находится в процессе удаления/);
});
