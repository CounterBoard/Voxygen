import test from "node:test";
import assert from "node:assert/strict";
import { createTreasuryService } from "../bot/src/features/treasury/service.js";

function makeTreasuryHarness({ userId = 1001, nickname = "DonorMC", replay = false, action = "deposit" } = {}) {
  const calls = { notifications: [], batches: 0 };
  let financialReads = 0;
  const savedOperation = {
    operation_id: "treasury-op-0001",
    telegram_id: userId,
    operation_type: action === "deposit" ? "treasury_deposit" : "treasury_donate",
    target_id: "city-1",
    amount: 50,
    status: "completed",
  };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (this.sql.includes("SELECT operation_id,telegram_id,operation_type,target_id,amount,status FROM financial_operations")) {
            financialReads += 1;
            return replay ? savedOperation : financialReads === 1 ? null : savedOperation;
          }
          if (this.sql.includes("SELECT id,name,owner_telegram_id,is_government FROM territories")) return { id: "city-1", name: "North Harbor", owner_telegram_id: 9001, is_government: 0 };
          if (this.sql.includes("SELECT id,name FROM territories")) return { id: "city-1", name: "North Harbor" };
          if (this.sql.includes("SELECT 1 FROM city_memberships")) return { telegram_id: userId };
          if (this.sql.includes("SELECT mc_nickname FROM users")) return { mc_nickname: nickname };
          if (this.sql.includes("SELECT balance FROM city_treasury")) return { balance: 125 };
          if (this.sql.includes("SELECT balance FROM user_currency")) return { balance: 75 };
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
    async batch(statements) {
      calls.batches += 1;
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const service = createTreasuryService({
    requireUser: async () => ({ user: { id: userId, username: "telegram_user" } }),
    ensureWorldTables: async () => {},
    isTerritoryManager: async () => false,
    json: (body, status = 200) => ({ body, status }),
    getTerritoryManagerRows: async () => [{ telegram_id: 9001 }],
    notifyTerritoryManagers: async (_env, territoryId, text, excludeId) => calls.notifications.push({ territoryId, text, excludeId }),
    escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char])),
  });
  const env = { DB };
  const request = { json: async () => ({ territoryId: "city-1", amount: 50, operationId: "treasury-op-0001" }) };
  return { service, env, request, calls };
}

test("a resident deposit sends a preference-filtered treasury top-up notification with the MC nickname", async () => {
  const h = makeTreasuryHarness({ action: "deposit" });
  const result = await h.service.treasuryDeposit(h.request, h.env);
  assert.equal(result.body.ok, true);
  assert.equal(h.calls.notifications.length, 1);
  const notice = h.calls.notifications[0];
  assert.equal(notice.territoryId, "city-1");
  assert.equal(notice.excludeId, 1001);
  assert.match(notice.text, /💎 <b>Пополнение казны<\/b>/);
  assert.match(notice.text, /Отправитель: <code>DonorMC<\/code>/);
  assert.match(notice.text, /Сумма: <b>50 сц<\/b>/);
});

test("a treasury donation uses the requested title, MC nickname and gem suffix", async () => {
  const h = makeTreasuryHarness({ action: "donate" });
  const result = await h.service.treasuryDonate(h.request, h.env);
  assert.equal(result.body.ok, true);
  assert.equal(h.calls.notifications.length, 1);
  const notice = h.calls.notifications[0];
  assert.match(notice.text, /💎 <b>Донат в казну<\/b>/);
  assert.doesNotMatch(notice.text, /Новое пожертвование/);
  assert.match(notice.text, /Отправитель: <code>DonorMC<\/code>/);
  assert.match(notice.text, /Сумма: <b>50 сц<\/b>/);
});

test("a replayed deposit does not send a duplicate territory notification", async () => {
  const h = makeTreasuryHarness({ action: "deposit", replay: true });
  const result = await h.service.treasuryDeposit(h.request, h.env);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.replayed, true);
  assert.equal(h.calls.notifications.length, 0);
});
