import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyInitData, parseBankCommand, applyBankBalanceChange, executeIdempotentFinancialTransfer } from "../bot/src/worker.js";

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


class FakeFinancialD1 {
  constructor(balance) { this.personalBalance=balance; this.treasuryBalance=0; this.operations=new Map(); }
  prepare(sql) {
    const st={sql,binds:[],bind(...values){this.binds=values;return this;},first:async()=>{
      if(sql.includes("SELECT operation_id,telegram_id,operation_type,target_id,amount,status"))return this.operations.get(st.binds[0])||null;
      return null;
    }};
    return st;
  }
  async batch(statements) {
    const results=[];let changes=0,previousChanges=0;
    for(const st of statements){
      const b=st.binds,s=st.sql;changes=0;
      if(s.includes("INSERT OR IGNORE INTO financial_operations")){
        if(!this.operations.has(b[0])){this.operations.set(b[0],{operation_id:b[0],telegram_id:b[1],operation_type:b[2],target_id:b[3],amount:b[4],status:"processing"});changes=1;}
      }else if(s.includes("UPDATE user_currency SET balance=balance-?")){
        if(previousChanges===1&&this.operations.get("op-123")?.status==="processing"&&this.personalBalance>=b[2]){this.personalBalance-=b[0];changes=1;}
      }else if(s.includes("INSERT INTO city_treasury")){
        if(previousChanges===1){this.treasuryBalance+=b[1];changes=1;}
      }else if(s.includes("UPDATE financial_operations SET status=CASE")){
        const op=this.operations.get(b[1]);if(op&&op.status==="processing"){op.status=previousChanges===1?"completed":"rejected";changes=1;}
      }
      results.push({meta:{changes}});previousChanges=changes;
    }
    return results;
  }
}

test("financial transfer operation ID is replay-safe and does not debit twice", async () => {
  const DB=new FakeFinancialD1(100);
  const args={operationId:"op-123",telegramId:7,operationType:"treasury_deposit",targetId:"city-A",amount:30,
    debitStatement:DB.prepare("UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=?").bind(30,7,30),
    creditStatement:DB.prepare("INSERT INTO city_treasury(territory_id,balance,updated_at) SELECT ?,?,? WHERE changes()=1").bind("city-A",30,1)};
  const first=await executeIdempotentFinancialTransfer({DB},args);
  const replay=await executeIdempotentFinancialTransfer({DB},args);
  assert.equal(first.status,"completed");
  assert.equal(replay.replayed,true);
  assert.equal(DB.personalBalance,70);
  assert.equal(DB.treasuryBalance,30);
});

test("financial transfer rejects operation ID reuse with different payload", async () => {
  const DB=new FakeFinancialD1(100);
  DB.operations.set("op-123",{operation_id:"op-123",telegram_id:7,operation_type:"treasury_deposit",target_id:"city-A",amount:30,status:"completed"});
  const result=await executeIdempotentFinancialTransfer({DB},{operationId:"op-123",telegramId:8,operationType:"treasury_deposit",targetId:"city-A",amount:30,
    debitStatement:DB.prepare("UPDATE user_currency SET balance=balance-?").bind(30),
    creditStatement:DB.prepare("INSERT INTO city_treasury").bind("city-A",30,1)});
  assert.equal(result.status,409);
  assert.equal(result.replayed,true);
});
