import test from "node:test";
import assert from "node:assert/strict";
import { createTerritoryMembershipService } from "../bot/src/features/territories/membership-service.js";

function createHarness({
  auth = { user: { id: 7, username: "manager" } },
  manager = true,
  first = () => null,
  all = () => ({ results: [] }),
  run = () => ({ meta: { changes: 1 } }),
  telegramResult = { response: { ok: true, status: 200 }, data: { ok: true } },
} = {}) {
  const calls = {
    prepared: [], first: [], all: [], runs: [], telegram: [],
    ensureWorld: 0, managerChecks: [], managerNotifications: [],
    recruitmentCleanup: [], equipmentReconciliation: [], achievements: [],
    firstMarker: [], userInviteNotifications: [],
  };

  function statement(sql, values = []) {
    const query = { sql: String(sql), values };
    calls.prepared.push(query);
    return {
      async first() { calls.first.push(query); return first(query); },
      async all() { calls.all.push(query); return all(query); },
      async run() { calls.runs.push(query); return run(query); },
    };
  }

  const DB = {
    prepare(sql) {
      const base = statement(sql);
      return {
        ...base,
        bind(...values) { return statement(sql, values); },
      };
    },
  };
  const env = { DB };
  const service = createTerritoryMembershipService({
    requireUser: async () => auth,
    ensureWorldTables: async () => { calls.ensureWorld += 1; },
    json: (body, status = 200) => ({ body, status }),
    normalizeMcNickname: value => String(value ?? "").trim(),
    isTerritoryManager: async (...args) => {
      calls.managerChecks.push(args);
      return manager;
    },
    telegram: async (...args) => {
      calls.telegram.push(args);
      return telegramResult;
    },
    escapeHtml: value => String(value ?? "").replace(/[&<>"]/g, ""),
    getTerritoryManagerRows: async () => [{ telegram_id: 7, role: "founder" }],
    skinUrlFromTexture: texture => texture ? `skin:${texture}` : null,
    notifyTerritoryManagersDirect: async (...args) => { calls.managerNotifications.push(args); },
    formatTelegramNickname: value => String(value ?? ""),
    hideRecruitmentIfContactLost: async (...args) => { calls.recruitmentCleanup.push(args); },
    reconcileTerritoryVisualEquipment: async (...args) => { calls.equipmentReconciliation.push(args); },
    evaluateAchievementsForTerritory: async (...args) => { calls.achievements.push(args); },
    ensureFirstCityMarker: async (...args) => { calls.firstMarker.push(args); },
  });
  const request = body => new Request("https://voxygen.test/api/city", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { ...service, calls, env, request };
}

test("resident invitation returns the auth error before initializing D1", async () => {
  const authError = { status: 401, body: "unauthorized" };
  const h = createHarness({ auth: { error: authError } });

  const result = await h.inviteResident(h.request({ territoryId: "city-1", nickname: "Player" }), h.env);

  assert.equal(result, authError);
  assert.equal(h.calls.ensureWorld, 0);
  assert.equal(h.calls.prepared.length, 0);
});

test("an invitation for an unregistered nickname is saved without premature Telegram delivery", async () => {
  const h = createHarness({
    first: query => {
      if (query.sql.includes("account_deletion_locks")) return null;
      if (query.sql.includes("FROM territories")) return { id: "city-1", name: "Test City" };
      if (query.sql.includes("lower(mc_nickname)")) return null;
      return null;
    },
  });

  const result = await h.inviteResident(h.request({ territoryId: "city-1", nickname: "  Player  " }), h.env);

  assert.deepEqual(result.body, {
    ok: true,
    pendingNickname: true,
    inviteId: result.body.inviteId,
    message: "Приглашение сохранено. Оно будет отправлено после подтверждения этого никнейма.",
  });
  assert.equal(typeof result.body.inviteId, "string");
  assert.ok(h.calls.runs.some(query => query.sql.includes("INSERT INTO city_invites")));
  assert.equal(h.calls.telegram.length, 0);
});

test("a verified user's invitation is delivered once and marked sent only after Telegram accepts it", async () => {
  const h = createHarness({
    first: query => {
      if (query.sql.includes("account_deletion_locks")) return null;
      if (query.sql.includes("FROM territories")) return { id: "city-1", name: "Test City" };
      if (query.sql.includes("lower(mc_nickname)")) return { telegram_id: 99, status: "verified" };
      if (query.sql.includes("FROM city_memberships")) return null;
      return null;
    },
  });

  const result = await h.inviteResident(h.request({ territoryId: "city-1", nickname: "Player" }), h.env);

  assert.equal(result.body.ok, true);
  assert.equal(result.body.pendingNickname, false);
  assert.equal(h.calls.telegram.length, 1);
  assert.equal(h.calls.telegram[0][1], "sendMessage");
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET notification_claimed_at")));
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET notification_sent_at")));
});

test("accepting a resident invitation creates membership, seeds the marker and checks achievements", async () => {
  const h = createHarness({
    manager: false,
    first: query => {
      if (query.sql.includes("account_deletion_locks")) return null;
      if (query.sql.includes("FROM city_invites")) return {
        id: "invite-1", territory_id: "city-1", target_telegram_id: 99, status: "pending",
      };
      if (query.sql.includes("SELECT status FROM users")) return { status: "verified" };
      if (query.sql.includes("FROM city_memberships")) return null;
      return null;
    },
  });

  const result = await h.handleResidentInviteCallback(h.env, {
    id: "callback-1",
    data: "resident_accept:invite-1",
    from: { id: 99 },
    message: { chat: { id: 99 }, message_id: 55 },
  });

  assert.deepEqual(result, { body: { ok: true }, status: 200 });
  assert.ok(h.calls.runs.some(query => query.sql.includes("INSERT OR IGNORE INTO city_memberships")));
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET status='accepted'")));
  assert.deepEqual(h.calls.firstMarker, [[h.env, "city-1"]]);
  assert.equal(h.calls.telegram.filter(([, method]) => method === "answerCallbackQuery").length, 1);
  assert.equal(h.calls.telegram.filter(([, method]) => method === "editMessageReplyMarkup").length, 1);
  assert.deepEqual(h.calls.achievements, [[h.env, "city-1"]]);
});

test("removing a resident keeps the successful membership change even when optional cleanup fails", async () => {
  const h = createHarness({
    first: query => {
      if (query.sql.includes("SELECT name FROM territories")) return { name: "Test City" };
      if (query.sql.includes("SELECT mc_nickname,telegram_username FROM users")) {
        return { mc_nickname: "Player", telegram_username: "player" };
      }
      return null;
    },
    all: () => ({ results: [] }),
  });

  const result = await h.removeResident(h.request({ territoryId: "city-1", telegramId: 99 }), h.env);

  assert.deepEqual(result.body, { ok: true });
  assert.ok(h.calls.runs.some(query => query.sql.includes("DELETE FROM city_memberships")));
  assert.equal(h.calls.managerNotifications.length, 1);
  assert.equal(h.calls.recruitmentCleanup.length, 1);
  assert.equal(h.calls.equipmentReconciliation.length, 1);
  assert.equal(h.calls.achievements.length, 1);
  assert.ok(h.calls.telegram.some(([, method]) => method === "sendMessage"));
});

test("a territory manager cannot leave the territory through the resident leave route", async () => {
  const h = createHarness({
    manager: true,
    first: query => query.sql.includes("FROM territories")
      ? { id: "city-1", name: "Test City" }
      : null,
  });

  const result = await h.leaveTerritory(h.request({ territoryId: "city-1" }), h.env);

  assert.equal(result.status, 403);
  assert.equal(h.calls.runs.some(query => query.sql.includes("DELETE FROM city_memberships")), false);
});

test("a user who is neither a manager nor a member cannot read city management data", async () => {
  const h = createHarness({
    manager: false,
    first: query => query.sql.includes("FROM territories")
      ? { id: "city-1", name: "Test City", owner_telegram_id: 7 }
      : null,
  });

  const result = await h.getCityManagement(
    h.request({}),
    h.env,
    new URL("https://voxygen.test/api/city/management?territoryId=city-1")
  );

  assert.equal(result.status, 403);
  assert.equal(h.calls.managerChecks.length, 1);
});

test("scheduled invite delivery respects the notification claim and returns delivery counts", async () => {
  const h = createHarness({
    all: query => query.sql.includes("FROM city_invites")
      ? { results: [{
        id: "invite-2", territory_id: "city-1", target_telegram_id: 99,
        target_nickname: "Player", invite_type: "join", city_name: "Test City",
      }] }
      : { results: [] },
  });

  const result = await h.deliverPendingInviteNotifications(h.env);

  assert.deepEqual(result, { scanned: 1, delivered: 1 });
  assert.equal(h.calls.telegram.length, 1);
  const scan = h.calls.all.find(query => query.sql.includes("FROM city_invites"));
  assert.match(scan.sql, /LIMIT 50/);
  assert.match(scan.sql, /account_deletion_locks/);
});


test("a manager can cancel only a still-pending resident invitation", async () => {
  const h = createHarness({
    first: query => query.sql.includes("FROM city_invites")
      ? { id: "invite-3", territory_id: "city-1" }
      : null,
  });

  const result = await h.cancelResidentInvite(h.request({ inviteId: "invite-3" }), h.env);

  assert.deepEqual(result.body, { ok: true });
  assert.equal(h.calls.managerChecks.length, 1);
  const update = h.calls.runs.find(query => query.sql.includes("SET status='cancelled'"));
  assert.ok(update);
  assert.deepEqual(update.values.slice(1), ["invite-3"]);
});

test("rejecting an invitation changes its status without creating membership", async () => {
  const h = createHarness({
    manager: false,
    first: query => {
      if (query.sql.includes("account_deletion_locks")) return null;
      if (query.sql.includes("FROM city_invites")) {
        return { id: "invite-4", territory_id: "city-1", target_telegram_id: 99, status: "pending" };
      }
      if (query.sql.includes("SELECT status FROM users")) return { status: "verified" };
      return null;
    },
  });

  const result = await h.handleResidentInviteCallback(h.env, {
    id: "callback-2",
    data: "resident_reject:invite-4",
    from: { id: 99 },
    message: { chat: { id: 99 }, message_id: 56 },
  });

  assert.deepEqual(result, { body: { ok: true }, status: 200 });
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET status='rejected'")));
  assert.equal(h.calls.runs.some(query => query.sql.includes("INSERT OR IGNORE INTO city_memberships")), false);
  assert.equal(h.calls.firstMarker.length, 0);
  assert.ok(h.calls.telegram.some(([, method, payload]) => method === "answerCallbackQuery" && payload.text === "Приглашение отклонено"));
});

test("a resident can leave a territory and triggers the existing departure maintenance", async () => {
  const h = createHarness({
    manager: false,
    first: query => {
      if (query.sql.includes("FROM territories")) return { id: "city-1", name: "Test City" };
      if (query.sql.includes("FROM city_memberships")) return { telegram_id: 99 };
      if (query.sql.includes("SELECT mc_nickname,telegram_username FROM users")) {
        return { mc_nickname: "Player", telegram_username: "player" };
      }
      return null;
    },
  });

  const result = await h.leaveTerritory(h.request({ territoryId: "city-1" }), h.env);

  assert.deepEqual(result.body, { ok: true });
  assert.ok(h.calls.runs.some(query => query.sql.includes("DELETE FROM city_memberships")));
  assert.equal(h.calls.managerNotifications.length, 1);
  assert.equal(h.calls.recruitmentCleanup.length, 1);
  assert.equal(h.calls.equipmentReconciliation.length, 1);
  assert.equal(h.calls.achievements.length, 1);
});

test("a newly verified nickname receives its stored invitation exactly once", async () => {
  const h = createHarness({
    first: query => {
      if (query.sql.includes("account_deletion_locks")) return null;
      if (query.sql.includes("FROM users")) {
        return { telegram_id: 99, mc_nickname: "Player", status: "verified" };
      }
      return null;
    },
    all: query => query.sql.includes("FROM city_invites")
      ? { results: [{
        id: "invite-5", territory_id: "city-1", target_telegram_id: 99,
        target_nickname: "Player", invite_type: "join", city_name: "Test City",
      }] }
      : { results: [] },
  });

  await h.notifyPendingInvitesForUser(h.env, 99);

  const binding = h.calls.runs.find(query => query.sql.includes("SET target_telegram_id = ?"));
  assert.ok(binding);
  assert.deepEqual(binding.values, [99, "Player"]);
  assert.equal(h.calls.telegram.length, 1);
  assert.equal(h.calls.telegram[0][1], "sendMessage");
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET notification_claimed_at")));
  assert.ok(h.calls.runs.some(query => query.sql.includes("SET notification_sent_at")));
});
