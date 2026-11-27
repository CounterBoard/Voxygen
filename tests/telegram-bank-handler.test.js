import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramBankHandler } from "../bot/src/features/treasury/telegram-bank.js";

function createHarness({
  insertChanges = 1,
  existingStatus = "success",
  resultStatus = "success",
  balanceAfter = 60,
  territories = [],
  userIds = [2002],
  discountCommand = null,
} = {}) {
  const calls = { sql: [], batches: [], telegram: [], managerNotices: [], userDirectoryInit: 0, discounts: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT OR IGNORE INTO bank_transactions")) return { meta: { changes: insertChanges } };
          return { meta: { changes: 1 } };
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id,name FROM territories WHERE status='approved'")) return { results: territories };
          if (this.sql.includes("SELECT telegram_id FROM users")) return { results: userIds.map(telegram_id => ({ telegram_id })) };
          return { results: [] };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT status FROM bank_transactions WHERE update_id")) return { status: existingStatus };
          if (this.sql.includes("SELECT status,balance_after FROM bank_transactions")) return { status: resultStatus, balance_after: balanceAfter };
          if (this.sql.includes("SELECT mc_nickname FROM users")) return { mc_nickname: "TargetMC" };
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.batches.push(statements);
      return [
        { meta: { changes: 1 } },
        { meta: { changes: resultStatus === "success" ? 1 : 0 } },
        { meta: { changes: resultStatus === "rejected" ? 1 : 0 } },
      ];
    },
  };
  const handler = createTelegramBankHandler({
    ensureWorldTables: async () => {},
    ensureEventsTables: async () => {},
    ensureUserDirectoryTable: async () => { calls.userDirectoryInit += 1; },
    normalizeVisualCommandText: value => String(value || "").trim().toLocaleLowerCase("ru-RU"),
    stripMinecraftFormatting: value => String(value ?? "").replace(/§[0-9a-fk-or]/gi, ""),
    escapeHtml: value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])),
    formatTelegramNickname: value => "<code>" + String(value || "") + "</code>",
    telegram: async (_env, method, payload) => { calls.telegram.push({ method, payload }); },
    json: (body, status = 200) => ({ body, status }),
    notifyTerritoryManagers: async (...args) => { calls.managerNotices.push(args); },
    parseVisualDiscountCommand: () => discountCommand,
    handleVisualDiscountMessage: async (_env, _update, _message, command) => {
      calls.discounts.push(command);
      return { body: { ok: true, handled: "discount-forwarded" } };
    },
  });
  const bankerId = 9001;
  const env = { DB, BANKER_TELEGRAM_ID: String(bankerId) };
  const update = { update_id: 77 };
  return {
    calls, DB, env, handler, update,
    message: (text, overrides = {}) => ({
      text,
      message_id: 88,
      from: { id: bankerId, first_name: "Banker" },
      chat: { id: bankerId, type: "private" },
      ...overrides,
    }),
  };
}

test("only the configured banker in a private chat can trigger bank processing", async () => {
  const h = createHarness();
  const ignored = await h.handler(h.env, h.update, h.message("Steve +20", {
    chat: { id: -100, type: "supergroup" },
  }));
  assert.equal(ignored, null);
  assert.equal(h.calls.sql.length, 0);
});

test("personal bank transfer resolves one player, updates the ledger and notifies the recipient", async () => {
  const h = createHarness();
  const result = await h.handler(h.env, h.update, h.message("Steve -40"));

  assert.deepEqual(result.body, { ok: true, handled: "bank_success" });
  assert.equal(h.calls.userDirectoryInit, 1);
  const insert = h.calls.sql.find(call => call.sql.includes("INSERT OR IGNORE INTO bank_transactions"));
  assert.ok(insert);
  assert.equal(insert.values[1], 77);
  assert.equal(insert.values[5], "Steve");
  assert.equal(insert.values[6], 40);
  assert.equal(insert.values[7], "debit");
  const balanceInit = h.calls.sql.find(call => call.sql.includes("INSERT OR IGNORE INTO user_currency"));
  assert.ok(balanceInit.sql.includes("NOT EXISTS(SELECT 1 FROM account_deletion_locks"));
  assert.equal(h.calls.batches.length, 1);
  assert.ok(h.calls.batches[0][0].sql.includes("NOT EXISTS(SELECT 1 FROM account_deletion_locks"));
  assert.equal(h.calls.telegram.length, 2);
  assert.equal(h.calls.telegram[0].payload.chat_id, 9001);
  assert.match(h.calls.telegram[0].payload.text, /списано 40 сц/);
  assert.equal(h.calls.telegram[1].payload.chat_id, 2002);
  assert.match(h.calls.telegram[1].payload.text, /списано 40 сц/);
});

test("a completed bank update is not applied or notified twice", async () => {
  const h = createHarness({ insertChanges: 0, existingStatus: "success" });
  const result = await h.handler(h.env, h.update, h.message("Steve +20"));

  assert.deepEqual(result.body, { ok: true, handled: "bank_duplicate" });
  assert.equal(h.calls.batches.length, 0);
  assert.equal(h.calls.telegram.length, 0);
});

test("territory treasury debit notifies only opted-in managers and excludes the banker", async () => {
  const h = createHarness({
    territories: [{ id: "city-1", name: "North City" }],
    userIds: [],
    balanceAfter: 35,
  });
  const result = await h.handler(h.env, h.update, h.message("North City -15"));

  assert.deepEqual(result.body, { ok: true, handled: "bank_treasury_debit" });
  assert.equal(h.calls.managerNotices.length, 1);
  assert.equal(h.calls.managerNotices[0][1], "city-1");
  assert.equal(h.calls.managerNotices[0][3], 9001);
  assert.deepEqual(h.calls.managerNotices[0][4], { managersOnly: true });
  assert.match(h.calls.managerNotices[0][2], /15/);
  assert.equal(h.calls.telegram.length, 1);
  assert.match(h.calls.telegram[0].payload.text, /снято с казны/);
});

test("the bank handler still delegates discount commands without moving their implementation", async () => {
  const h = createHarness({ discountCommand: { percent: 15, mode: "set" } });
  const result = await h.handler(h.env, h.update, h.message("All 15% 2h"));

  assert.deepEqual(result.body, { ok: true, handled: "discount-forwarded" });
  assert.deepEqual(h.calls.discounts, [{ percent: 15, mode: "set" }]);
  assert.equal(h.calls.batches.length, 0);
});

test("insufficient treasury funds finish with a rejected ledger entry and no expense notification", async () => {
  const h = createHarness({
    territories: [{ id: "city-1", name: "North City" }],
    userIds: [],
    resultStatus: "rejected",
    balanceAfter: 5,
  });
  const result = await h.handler(h.env, h.update, h.message("North City -15"));

  assert.deepEqual(result.body, { ok: true, handled: "bank_treasury_insufficient_funds" });
  assert.equal(h.calls.managerNotices.length, 0);
  assert.equal(h.calls.telegram.length, 1);
});
