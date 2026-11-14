import test from "node:test";
import assert from "node:assert/strict";
import { isTerritoryManager, isEligibleManagerChangeVoter } from "../bot/src/worker.js";

const territories = [
  { id: "A", status: "approved", owner_telegram_id: 100 },
  { id: "B", status: "approved", owner_telegram_id: 200 },
  { id: "P", status: "pending", owner_telegram_id: 300 },
];
const managers = [
  { territory_id: "A", telegram_id: 101 },
  { territory_id: "B", telegram_id: 102 },
  { territory_id: "P", telegram_id: 103 },
];

class AuthorizationD1 {
  prepare(sql) {
    return {
      bind: (...values) => ({
        first: async () => {
          if (sql.includes("FROM territories")) {
            const [territoryId, ownerId] = values;
            const row = territories.find((item) =>
              item.id === territoryId && item.status === "approved" &&
              Number(item.owner_telegram_id) === Number(ownerId));
            return row ? { 1: 1 } : null;
          }
          if (sql.includes("FROM territory_managers")) {
            const [territoryId, telegramId] = values;
            const row = managers.find((item) =>
              item.territory_id === territoryId &&
              Number(item.telegram_id) === Number(telegramId));
            return row ? { 1: 1 } : null;
          }
          throw new Error(`Unexpected authorization SQL: ${sql}`);
        },
      }),
    };
  }
}

const env = { DB: new AuthorizationD1() };

test("territory owner is authorized only for their own approved territory", async () => {
  assert.equal(await isTerritoryManager(env, "A", 100), true);
  assert.equal(await isTerritoryManager(env, "B", 100), false);
  assert.equal(await isTerritoryManager(env, "P", 300), false);
});

test("territory manager permission is scoped to the exact territory", async () => {
  assert.equal(await isTerritoryManager(env, "A", 101), true);
  assert.equal(await isTerritoryManager(env, "B", 101), false);
  assert.equal(await isTerritoryManager(env, "A", 102), false);
  assert.equal(await isTerritoryManager(env, "B", 102), true);
  assert.equal(await isTerritoryManager(env, "P", 103), false);
});

test("empty territory or user identifiers never grant manager access", async () => {
  assert.equal(await isTerritoryManager(env, "", 101), false);
  assert.equal(await isTerritoryManager(env, "A", 0), false);
  assert.equal(await isTerritoryManager(env, null, null), false);
});


test("manager change initiator and target cannot vote", () => {
  const request = { initiator_telegram_id: 101, target_telegram_id: 102 };
  assert.equal(isEligibleManagerChangeVoter(101, request), false);
  assert.equal(isEligibleManagerChangeVoter(102, request), false);
  assert.equal(isEligibleManagerChangeVoter(103, request), true);
  assert.equal(isEligibleManagerChangeVoter(0, request), false);
  assert.equal(isEligibleManagerChangeVoter("not-a-number", request), false);
});
