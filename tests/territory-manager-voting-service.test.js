import test from "node:test";
import assert from "node:assert/strict";
import { createManagerChangeVotingService } from "../bot/src/features/territories/manager-change-voting-service.js";

function createHarness({
  request = {
    id: "request-1",
    status: "pending",
    territory_id: "territory-1",
    target_telegram_id: 42,
    initiator_telegram_id: 7,
    action: "promote",
    voter_count: 2,
    expires_at: Date.now() + 60_000,
  },
  votes = { yes: 1, total: 1 },
  applyResult = true,
  manager = true,
  callbackRequest = null,
  expiredRows = [],
} = {}) {
  const calls = {
    sql: [], batches: [], telegram: [], ensureTables: 0,
    apply: [], managerChecks: [], cors: 0,
  };
  let current = request ? { ...request } : null;
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const query = { sql: String(sql), values };
          calls.sql.push(query);
          return {
            async first() {
              if (query.sql.includes("FROM manager_change_requests")
                && query.sql.includes("status='finalizing'")
                && query.sql.includes("finalizing_at=?")) {
                return current
                  && current.status === "finalizing"
                  && Number(current.finalizing_at) === Number(query.values[1])
                  ? { ...current }
                  : null;
              }
              if (query.sql.includes("SELECT * FROM manager_change_requests WHERE id=?")) {
                return callbackRequest ? { ...callbackRequest } : current ? { ...current } : null;
              }
              if (query.sql.includes("FROM manager_change_votes")) return votes;
              if (query.sql.includes("SELECT mc_nickname FROM users")) return { mc_nickname: "TargetUser" };
              if (query.sql.includes("SELECT name FROM territories")) return { name: "Test City" };
              throw new Error("Unexpected first() SQL: " + query.sql);
            },
            async all() {
              if (query.sql.includes("FROM manager_change_requests")) return { results: expiredRows };
              throw new Error("Unexpected all() SQL: " + query.sql);
            },
            async run() {
              if (query.sql.includes("SET status='finalizing'")) {
                if (!current || current.status !== "pending") return { meta: { changes: 0 } };
                current.status = "finalizing";
                current.finalizing_at = query.values[0];
                return { meta: { changes: 1 } };
              }
              if (query.sql.includes("SET finalizing_at=?")) {
                if (!current || current.status !== "finalizing"
                  || Number(current.finalizing_at || 0) > Number(query.values[2])) {
                  return { meta: { changes: 0 } };
                }
                current.finalizing_at = query.values[0];
                return { meta: { changes: 1 } };
              }
              if (query.sql.includes("SET status='pending'")) {
                if (!current || current.status !== "finalizing") return { meta: { changes: 0 } };
                current.status = "pending";
                current.finalizing_at = null;
                return { meta: { changes: 1 } };
              }
              if (query.sql.includes("SET status=?,decided_at=?")) {
                if (!current || current.status !== "finalizing"
                  || Number(current.finalizing_at) !== Number(query.values[3])) {
                  return { meta: { changes: 0 } };
                }
                current.status = query.values[0];
                current.decided_at = query.values[1];
                current.finalizing_at = null;
                return { meta: { changes: 1 } };
              }
              throw new Error("Unexpected run() SQL: " + query.sql);
            },
          };
        },
      };
    },
  };
  const service = createManagerChangeVotingService({
    ensureManagerChangeTables: async () => { calls.ensureTables += 1; },
    applyManagerChange: async (...args) => {
      calls.apply.push(args);
      return applyResult;
    },
    telegram: async (...args) => { calls.telegram.push(args); },
    escapeHtml: value => String(value ?? ""),
    formatTelegramNickname: value => String(value ?? ""),
    isTerritoryManager: async (...args) => {
      calls.managerChecks.push(args);
      return manager;
    },
    json: (body, status = 200) => ({ body, status }),
  });
  return { ...service, DB, calls, env: { DB }, get requestState() { return current; } };
}

test("finalization approves a request after the required majority and applies the manager change", async () => {
  const h = createHarness();

  const result = await h.finalizeManagerChangeRequest(h.env, "request-1");

  assert.deepEqual(result, { status: "approved", yes: 1, total: 1 });
  assert.equal(h.requestState.status, "approved");
  assert.equal(h.calls.apply.length, 1);
  assert.deepEqual(h.calls.apply[0][1], {
    territoryId: "territory-1",
    targetId: 42,
    action: "promote",
    initiatorId: 7,
  });
  assert.equal(h.calls.telegram.length, 1);
});

test("finalization leaves a request pending when the vote is incomplete and unexpired", async () => {
  const h = createHarness({
    request: {
      id: "request-2", status: "pending", territory_id: "territory-1",
      target_telegram_id: 42, initiator_telegram_id: 7, action: "demote",
      voter_count: 3, expires_at: Date.now() + 60_000,
    },
    votes: { yes: 0, total: 1 },
  });

  const result = await h.finalizeManagerChangeRequest(h.env, "request-2");

  assert.equal(result, null);
  assert.equal(h.requestState.status, "pending");
  assert.equal(h.calls.apply.length, 0);
  assert.equal(h.calls.telegram.length, 0);
  assert.equal(h.calls.sql.some(query => query.sql.includes("SET status='finalizing'")), false);
});

test("an expired request without enough approvals is finalized as rejected", async () => {
  const h = createHarness({
    request: {
      id: "request-3", status: "pending", territory_id: "territory-1",
      target_telegram_id: 42, initiator_telegram_id: 7, action: "demote",
      voter_count: 2, expires_at: 0,
    },
    votes: { yes: 0, total: 2 },
  });

  const result = await h.finalizeManagerChangeRequest(h.env, "request-3");

  assert.deepEqual(result, { status: "rejected", yes: 0, total: 2 });
  assert.equal(h.requestState.status, "rejected");
  assert.equal(h.calls.apply.length, 0);
  assert.equal(h.calls.telegram.length, 1);
});

test("an approved vote is rejected when the guarded manager transition does not apply", async () => {
  const h = createHarness({ applyResult: false });

  const result = await h.finalizeManagerChangeRequest(h.env, "request-1");

  assert.deepEqual(result, { status: "rejected", yes: 1, total: 1 });
  assert.equal(h.requestState.status, "rejected");
});

test("the vote callback rejects an initiator without recording a vote", async () => {
  const h = createHarness({
    callbackRequest: {
      id: "request-4", status: "pending", territory_id: "territory-1",
      target_telegram_id: 42, initiator_telegram_id: 7, action: "promote",
      voter_count: 2, expires_at: Date.now() + 60_000,
    },
  });

  const result = await h.handleManagerVoteCallback(h.env, {
    id: "callback-1",
    data: "manager_vote:yes:request-4",
    from: { id: 7 },
  });

  assert.deepEqual(result, { body: { ok: true }, status: 200 });
  assert.equal(h.calls.managerChecks.length, 0);
  assert.equal(h.calls.sql.some(query => query.sql.includes("INSERT INTO manager_change_votes")), false);
  assert.equal(h.calls.telegram.length, 1);
  assert.equal(h.calls.telegram[0][1], "answerCallbackQuery");
});

test("cron expiry initializes its table and scans both expired and abandoned finalization leases", async () => {
  const h = createHarness({ expiredRows: [] });

  const result = await h.expireManagerChangeRequests(h.env, 123_456);

  assert.equal(result, 0);
  assert.equal(h.calls.ensureTables, 1);
  const scan = h.calls.sql.find(query => query.sql.includes("FROM manager_change_requests"));
  assert.match(scan.sql, /status='pending'.*expires_at<=\?/s);
  assert.match(scan.sql, /status='finalizing'.*finalizing_at/s);
  assert.match(scan.sql, /ORDER BY expires_at ASC LIMIT 100/);
  assert.deepEqual(scan.values, [123_456, 63_456]);
});
