import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyInitData, parseBankCommand, applyBankBalanceChange } from "../bot/src/worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const BOT_TOKEN = "voxygen-test-token";
const encoder = new TextEncoder();

async function signedInitData(authDate, user = { id: 123456, first_name: "Test" }) {
  const values = {
    query_id: "AA-test-query",
    user: JSON.stringify(user),
  };
  if (authDate !== undefined) values.auth_date = String(authDate);
  const params = new URLSearchParams(values);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const webAppDataKey = await crypto.subtle.importKey(
    "raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const secretBytes = await crypto.subtle.sign("HMAC", webAppDataKey, encoder.encode(BOT_TOKEN));
  const secretKey = await crypto.subtle.importKey(
    "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(dataCheckString));
  params.set("hash", [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join(""));
  return params.toString();
}

test("Telegram Init Data accepts a correctly signed recent auth_date", async () => {
  const now = 1_800_000_000_000;
  const user = { id: 123456, first_name: "Test" };
  const initData = await signedInitData(Math.floor(now / 1000) - 300, user);

  assert.deepEqual(await verifyInitData(initData, BOT_TOKEN, now), user);
});

test("Telegram Init Data rejects expired, future and missing auth_date values", async () => {
  const now = 1_800_000_000_000;
  assert.equal(await verifyInitData(await signedInitData(Math.floor(now / 1000) - 86401), BOT_TOKEN, now), null);
  assert.equal(await verifyInitData(await signedInitData(Math.floor(now / 1000) + 61), BOT_TOKEN, now), null);
  assert.equal(await verifyInitData(await signedInitData(undefined), BOT_TOKEN, now), null);
});

test("bank command parser preserves target-first and amount-first debit syntax", () => {
  assert.deepEqual(parseBankCommand("North Harbor -120"), {
    target: "North Harbor", amount: 120, direction: "debit",
  });
  assert.deepEqual(parseBankCommand("42 Steve"), {
    target: "Steve", amount: 42, direction: "credit",
  });
  assert.deepEqual(parseBankCommand("-42 @Steve"), {
    target: "Steve", amount: 42, direction: "debit",
  });
});

class FakeBankD1 {
  constructor(balance) {
    this.balance = balance;
    this.transactions = new Map([[77, { status: "processing", balance_after: null }]]);
  }

  prepare(sql) {
    const statement = {
      sql,
      binds: [],
      bind(...binds) { this.binds = binds; return this; },
      first: async () => {
        if (sql.includes("SELECT status,balance_after FROM bank_transactions")) {
          return this.transactions.get(Number(statement.binds[0])) || null;
        }
        return null;
      },
    };
    return statement;
  }

  async batch(statements) {
    let previousChanges = 0;
    const results = [];
    for (const statement of statements) {
      const { sql, binds } = statement;
      const transaction = this.transactions.get(77);
      let changes = 0;
      if (sql.includes("UPDATE city_treasury SET balance=balance-?")) {
        const [amount, , territoryId, minimum, updateId] = binds;
        if (territoryId === "city-1" && Number(updateId) === 77 && transaction?.status === "processing" && this.balance >= minimum) {
          this.balance -= amount;
          changes = 1;
        }
      } else if (sql.includes("UPDATE city_treasury SET balance=balance+?")) {
        const [, , territoryId, updateId] = binds;
        if (territoryId === "city-1" && Number(updateId) === 77 && transaction?.status === "processing") {
          this.balance += binds[0];
          changes = 1;
        }
      } else if (sql.includes("status='success'")) {
        const [, , , , , updateId] = binds;
        if (previousChanges === 1 && Number(updateId) === 77 && transaction?.status === "processing") {
          transaction.status = "success";
          transaction.balance_after = this.balance;
          changes = 1;
        }
      } else if (sql.includes("status='rejected'")) {
        const [, , , , , updateId] = binds;
        if (previousChanges === 0 && Number(updateId) === 77 && transaction?.status === "processing") {
          transaction.status = "rejected";
          transaction.balance_after = this.balance;
          changes = 1;
        }
      }
      previousChanges = changes;
      results.push({ meta: { changes } });
    }
    return results;
  }
}

test("bank balance update and ledger status are committed as one idempotent transition", async () => {
  const DB = new FakeBankD1(100);
  const env = { DB };
  const args = {
    updateId: 77, targetType: "treasury", targetId: "city-1", amount: 40,
    direction: "debit", ledgerDirection: "treasury_debit", now: 123,
    successNote: "test debit", rejectedNote: "insufficient",
  };

  const first = await applyBankBalanceChange(env, args);
  const replay = await applyBankBalanceChange(env, args);

  assert.deepEqual(first, { status: "success", balanceAfter: 60, replayed: false });
  assert.deepEqual(replay, { status: "success", balanceAfter: 60, replayed: true });
  assert.equal(DB.balance, 60);
});

test("bank debit records rejection without changing the balance when funds are insufficient", async () => {
  const DB = new FakeBankD1(20);
  const result = await applyBankBalanceChange({ DB }, {
    updateId: 77, targetType: "treasury", targetId: "city-1", amount: 40,
    direction: "debit", ledgerDirection: "treasury_debit", now: 123,
    successNote: "test debit", rejectedNote: "insufficient",
  });

  assert.deepEqual(result, { status: "rejected", balanceAfter: 20, replayed: false });
  assert.equal(DB.balance, 20);
});
