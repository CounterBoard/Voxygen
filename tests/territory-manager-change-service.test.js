import test from "node:test";
import assert from "node:assert/strict";
import { createManagerChangeService } from "../bot/src/features/territories/manager-change-service.js";

function createHarness({
  territory = { id: "t-1", name: "Test City", owner_telegram_id: 100 },
  targetId = 42,
  state = { manager: false, member: true, ownerId: 100 },
  nextOwner = { telegram_id: 7, telegram_username: "next", mc_nickname: "NextOwner" },
  nextOwnerManager = true,
  nextManager = null,
  batchTransition = null,
} = {}) {
  const calls = {
    prepared: [], batches: [], telegram: [], managerNotifications: [],
    recruitmentCleanup: [], achievementEvaluations: [],
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const statement = { sql: String(sql), values };
          calls.prepared.push(statement);
          return {
            statement,
            async first() {
              if (statement.sql.includes("SELECT id,name,owner_telegram_id FROM territories")) return territory;
              if (statement.sql.includes("SELECT telegram_id FROM territory_managers WHERE territory_id=? AND telegram_id<>?")) {
                return nextManager ? { telegram_id: nextManager } : null;
              }
              if (statement.sql.includes("SELECT telegram_id,telegram_username,mc_nickname FROM users")) return nextOwner;
              if (statement.sql.includes("SELECT owner_telegram_id FROM territories")) return { owner_telegram_id: state.ownerId };
              if (statement.sql.includes("SELECT 1 FROM territory_managers")) {
                const queriedId = Number(statement.values[1]);
                if (queriedId === Number(targetId)) return state.manager ? { 1: 1 } : null;
                return nextOwnerManager ? { 1: 1 } : null;
              }
              if (statement.sql.includes("SELECT 1 FROM city_memberships")) return state.member ? { 1: 1 } : null;
              throw new Error("Unexpected first() SQL: " + statement.sql);
            },
          };
        },
      };
    },
    async batch(statements) {
      calls.batches.push(statements.map(item => item.statement));
      if (batchTransition === "promote") {
        state.manager = true;
        state.member = false;
      } else if (batchTransition === "demote" || batchTransition === "owner-demote") {
        state.manager = false;
        state.member = true;
        if (batchTransition === "owner-demote") state.ownerId = Number(nextOwner?.telegram_id || 0);
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const service = createManagerChangeService({
    telegram: async (...args) => { calls.telegram.push(args); },
    escapeHtml: value => String(value ?? ""),
    hideRecruitmentIfContactLost: async (...args) => { calls.recruitmentCleanup.push(args); },
    notifyTerritoryManagers: async (...args) => { calls.managerNotifications.push(args); },
    evaluateAchievementsForTerritory: async (...args) => { calls.achievementEvaluations.push(args); },
  });
  return { ...service, DB, calls, env: { DB }, targetId };
}

test("manager change rejects missing approved territories and unsupported actions", async () => {
  const missing = createHarness({ territory: null });
  assert.equal(await missing.applyManagerChange(missing.env, {
    territoryId: "t-1", targetId: 42, action: "promote",
  }), false);
  assert.equal(missing.calls.batches.length, 0);

  const invalidAction = createHarness();
  assert.equal(await invalidAction.applyManagerChange(invalidAction.env, {
    territoryId: "t-1", targetId: 42, action: "transfer",
  }), false);
  assert.equal(invalidAction.calls.batches.length, 0);
});

test("promotion retries are idempotent when the target is already a manager", async () => {
  const h = createHarness({ state: { manager: true, member: false, ownerId: 100 } });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "promote", initiatorId: 9,
  });

  assert.equal(changed, true);
  assert.equal(h.calls.batches.length, 0);
  assert.equal(h.calls.telegram.length, 0);
  assert.equal(h.calls.managerNotifications.length, 0);
  assert.equal(h.calls.achievementEvaluations.length, 0);
});

test("promotion uses guarded batch statements and verifies the resulting manager/member state", async () => {
  const h = createHarness({ batchTransition: "promote" });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "promote", initiatorId: 9,
  });

  assert.equal(changed, true);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].length, 2);
  const insert = h.calls.batches[0].find(statement => statement.sql.includes("INSERT OR IGNORE INTO territory_managers"));
  assert.match(insert.sql, /EXISTS\(SELECT 1 FROM city_memberships/);
  assert.match(insert.sql, /EXISTS\(SELECT 1 FROM users WHERE telegram_id=\? AND status='verified'/);
  assert.match(insert.sql, /trim\(COALESCE\(mc_nickname,''\)\)<>''/);
  assert.equal(insert.values.at(-1), 42);
  assert.equal(h.calls.telegram.length, 1);
  assert.equal(h.calls.managerNotifications.length, 1);
  assert.equal(h.calls.achievementEvaluations.length, 1);
  assert.equal(h.calls.recruitmentCleanup.length, 0);
});

test("promotion does not create a manager when the target is no longer a member", async () => {
  const h = createHarness({ state: { manager: false, member: false, ownerId: 100 } });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "promote", initiatorId: 9,
  });

  assert.equal(changed, false);
  assert.equal(h.calls.batches.length, 0);
  assert.equal(h.calls.managerNotifications.length, 0);
});

test("demotion restores membership and performs recruitment and achievement follow-up", async () => {
  const h = createHarness({
    state: { manager: true, member: false, ownerId: 100 },
    batchTransition: "demote",
  });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "demote", initiatorId: 9,
  });

  assert.equal(changed, true);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].length, 2);
  assert.match(h.calls.batches[0][0].sql, /INSERT OR IGNORE INTO city_memberships/);
  assert.match(h.calls.batches[0][1].sql, /DELETE FROM territory_managers/);
  assert.deepEqual(h.calls.recruitmentCleanup, [[h.env, "t-1", 42]]);
  assert.equal(h.calls.managerNotifications.length, 1);
  assert.equal(h.calls.achievementEvaluations.length, 1);
});

test("demoting the owner atomically hands ownership to a verified manager", async () => {
  const h = createHarness({
    state: { manager: true, member: false, ownerId: 42 },
    nextOwner: { telegram_id: 7, telegram_username: "next", mc_nickname: "NextOwner" },
    nextOwnerManager: true,
    batchTransition: "owner-demote",
  });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "demote", initiatorId: 7,
  });

  assert.equal(changed, true);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].length, 3);
  const ownerUpdate = h.calls.batches[0][0];
  assert.match(ownerUpdate.sql, /UPDATE territories SET owner_telegram_id=/);
  assert.match(ownerUpdate.sql, /owner_telegram_id=\?/);
  assert.match(ownerUpdate.sql, /EXISTS\(SELECT 1 FROM territory_managers/);
  assert.deepEqual(ownerUpdate.values.slice(0, 3), [7, "next", "NextOwner"]);
  assert.equal(h.calls.recruitmentCleanup.length, 1);
  assert.equal(h.calls.managerNotifications.length, 1);
  assert.equal(h.calls.achievementEvaluations.length, 1);
});

test("a concurrent role change that fails post-write verification returns false without side effects", async () => {
  const h = createHarness({ batchTransition: null });

  const changed = await h.applyManagerChange(h.env, {
    territoryId: "t-1", targetId: 42, action: "promote", initiatorId: 9,
  });

  assert.equal(changed, false);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.telegram.length, 0);
  assert.equal(h.calls.managerNotifications.length, 0);
  assert.equal(h.calls.achievementEvaluations.length, 0);
});
