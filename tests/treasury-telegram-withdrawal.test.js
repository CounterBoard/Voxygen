import test from "node:test";
import assert from "node:assert/strict";
import { createGemWithdrawalHandler } from "../bot/src/features/treasury/telegram-withdrawal.js";

function createHarness({
  territories = [],
  manager = false,
  transferResult = { status: "completed", replayed: false },
  personalBalance = 75,
  treasuryBalance = 125,
  bankerId = "9001",
} = {}) {
  const calls = { sql: [], telegram: [], transfers: [], notifications: [], worldInit: 0, eventsInit: 0, managerChecks: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          return { meta: { changes: 1 } };
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT id,name FROM territories WHERE status='approved'")) return { results: territories };
          return { results: [] };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT balance FROM user_currency")) return { balance: personalBalance };
          if (this.sql.includes("SELECT balance FROM city_treasury")) return { balance: treasuryBalance };
          if (this.sql.includes("SELECT mc_nickname,telegram_username FROM users")) return { mc_nickname: "PlayerMC", telegram_username: "player" };
          return null;
        },
      };
      return statement;
    },
  };
  const handler = createGemWithdrawalHandler({
    ensureWorldTables: async () => { calls.worldInit += 1; },
    ensureEventsTables: async () => { calls.eventsInit += 1; },
    isTerritoryManager: async (_env, territoryId, userId) => { calls.managerChecks.push({ territoryId, userId }); return manager; },
    executeIdempotentFinancialTransfer: async (_env, args) => { calls.transfers.push(args); return transferResult; },
    telegram: async (_env, method, payload) => { calls.telegram.push({ method, payload }); },
    json: (body, status = 200) => ({ body, status }),
    stripMinecraftFormatting: value => String(value ?? "")
      .replace(/§x(?:§[0-9a-fA-F]){6}/gi, "")
      .replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fA-Fk-oK-OrR])/g, ""),
    notifyTerritoryManagers: async (_env, territoryId, text, excludeId, options) => calls.notifications.push({ territoryId, text, excludeId, options }),
  });
  return { handler, calls, env: { DB, BANKER_TELEGRAM_ID: bankerId } };
}

function message(text, { userId = 1001, chatId = 1001 } = {}) {
  return { text, message_id: 55, chat: { id: chatId, type: "private" }, from: { id: userId, first_name: "Player", username: "player" } };
}

test("personal withdrawal uses the treasury idempotency helper and sends banker and user notices", async () => {
  const h = createHarness();
  const result = await h.handler(h.env, { update_id: 321 }, message("-25"));
  assert.deepEqual(result.body, { ok: true, handled: "gem_personal_withdraw" });
  assert.equal(h.calls.worldInit, 1);
  assert.equal(h.calls.eventsInit, 1);
  assert.equal(h.calls.transfers.length, 1);
  const transfer = h.calls.transfers[0];
  assert.equal(transfer.operationId, "telegram-withdraw-321");
  assert.equal(transfer.operationType, "telegram_personal_withdraw");
  assert.equal(transfer.targetId, "1001");
  assert.equal(transfer.amount, 25);
  assert.match(transfer.debitStatement.sql, /NOT EXISTS\(SELECT 1 FROM account_deletion_locks/);
  assert.equal(h.calls.telegram.length, 2);
  assert.match(h.calls.telegram[0].payload.text, /Снятие самоцветов/);
  assert.equal(h.calls.telegram[1].payload.chat_id, 1001);
  assert.match(h.calls.telegram[1].payload.text, /Остаток: 75 сц/);
});

test("territory treasury withdrawal is denied to a non-manager before a transfer is attempted", async () => {
  const h = createHarness({ territories: [{ id: "city-1", name: "Северный город" }], manager: false });
  const result = await h.handler(h.env, { update_id: 322 }, message("Северный город -25"));
  assert.deepEqual(result.body, { ok: true, handled: "gem_withdraw_forbidden" });
  assert.deepEqual(h.calls.managerChecks, [{ territoryId: "city-1", userId: 1001 }]);
  assert.equal(h.calls.transfers.length, 0);
  assert.match(h.calls.telegram[0].payload.text, /только основатель или мэр/i);
});

test("territory treasury withdrawal uses the territory ID and treasury-specific transfer type", async () => {
  const h = createHarness({ territories: [{ id: "city-1", name: "Северный город" }], manager: true, treasuryBalance: 80 });
  const result = await h.handler(h.env, { update_id: 323 }, message("-25 Северный город"));
  assert.deepEqual(result.body, { ok: true, handled: "gem_treasury_withdraw" });
  const transfer = h.calls.transfers[0];
  assert.equal(transfer.operationId, "telegram-withdraw-323");
  assert.equal(transfer.operationType, "telegram_treasury_withdraw");
  assert.equal(transfer.targetId, "city-1");
  assert.equal(transfer.amount, 25);
  assert.match(transfer.debitStatement.sql, /UPDATE city_treasury/);
  assert.match(transfer.debitStatement.sql, /account_deletion_locks/);
  assert.equal(h.calls.telegram.at(-1).payload.chat_id, 1001);
  assert.match(h.calls.telegram.at(-1).payload.text, /Остаток: 80 сц/);
});

test("a successful territory withdrawal notifies opted-in managers except the spender", async () => {
  const h = createHarness({ territories: [{ id: "city-1", name: "Северный город" }], manager: true });
  const result = await h.handler(h.env, { update_id: 327 }, message("Северный город -25"));
  assert.deepEqual(result.body, { ok: true, handled: "gem_treasury_withdraw" });
  assert.equal(h.calls.notifications.length, 1);
  const notice = h.calls.notifications[0];
  assert.equal(notice.territoryId, "city-1");
  assert.equal(notice.excludeId, 1001);
  assert.deepEqual(notice.options, { managersOnly: true });
  assert.match(notice.text, /Трата из казны/);
  assert.match(notice.text, /PlayerMC/);
  assert.match(notice.text, /25 сц/);
});

test("a replayed completed withdrawal returns without reading balances or sending duplicate notifications", async () => {
  const h = createHarness({ transferResult: { status: "completed", replayed: true } });
  const result = await h.handler(h.env, { update_id: 324 }, message("-25"));
  assert.deepEqual(result.body, { ok: true, handled: "gem_withdraw_duplicate" });
  assert.equal(h.calls.transfers.length, 1);
  assert.equal(h.calls.telegram.length, 0);
  assert.equal(h.calls.sql.some(call => call.sql.includes("SELECT balance FROM")), false);
  assert.equal(h.calls.notifications.length, 0);
});

test("invalid withdrawal amounts are rejected before database access", async () => {
  for (const command of ["-0", "-1000000001"]) {
    const h = createHarness();
    const result = await h.handler(h.env, { update_id: 325 }, message(command));
    assert.deepEqual(result.body, { ok: true, handled: "gem_withdraw_invalid_amount" });
    assert.equal(h.calls.telegram[0].payload.text, "Укажите положительное целое количество самоцветов");
    assert.equal(h.calls.sql.length, 0);
    assert.equal(h.calls.transfers.length, 0);
  }
});

test("a matching withdrawal command with an invalid Telegram update ID is ignored", async () => {
  const h = createHarness();
  const result = await h.handler(h.env, { update_id: "not-an-id" }, message("-25"));
  assert.deepEqual(result.body, { ok: true, ignored: true });
  assert.equal(h.calls.transfers.length, 0);
  assert.equal(h.calls.sql.length, 0);
});

 
test("territory withdrawal lookup normalizes Unicode spaces, invisible characters and Minecraft formatting", async () => {
  const h = createHarness({
    territories: [{ id: "city-2", name: "North Harbor" }],
    manager: true,
  });
  const result = await h.handler(
    h.env,
    { update_id: 326 },
    message("§aNorth\u00a0Harbor\u200b§r -25"),
  );

  assert.deepEqual(result.body, { ok: true, handled: "gem_treasury_withdraw" });
  assert.equal(h.calls.transfers.length, 1);
  assert.equal(h.calls.transfers[0].targetId, "city-2");
});
