import test from "node:test";
import assert from "node:assert/strict";
import { createInspectorManagementService } from "../bot/src/features/admin-tools/inspectors-service.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function request(body, url = "https://voxygen.test/api/inspectors") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function service(overrides = {}) {
  return createInspectorManagementService({
    requireMainInspector: async () => ({ user: { id: 700 } }),
    ensureWorldTables: async () => {},
    json,
    ...overrides,
  });
}

test("inspector list requires main-inspector authorization before database access", async () => {
  const denied = json({ ok: false, code: "FORBIDDEN" }, 403);
  let queries = 0;
  const handlers = service({ requireMainInspector: async () => ({ error: denied }) });
  const response = await handlers.listInspectors(new Request("https://voxygen.test/api/inspectors/list"), {
    DB: { prepare() { queries += 1; throw new Error("unexpected query"); } },
  });

  assert.equal(response, denied);
  assert.equal(queries, 0);
});

test("inspector list preserves database ordering and response shape", async () => {
  const inspectors = [
    { telegram_id: 11, telegram_username: "@first", added_by: 700, created_at: 10 },
    { telegram_id: 22, telegram_username: null, added_by: 700, created_at: 20 },
  ];
  let sql = "";
  const handlers = service();
  const response = await handlers.listInspectors(new Request("https://voxygen.test/api/inspectors/list"), {
    DB: {
      prepare(statement) {
        sql = statement;
        return { async all() { return { results: inspectors }; } };
      },
    },
  });

  assert.match(sql, /FROM inspectors\s+ORDER BY created_at ASC/);
  assert.deepEqual(await response.json(), { ok: true, inspectors });
});

test("adding an inspector by username resolves the existing Telegram account and preserves write fields", async () => {
  const calls = [];
  let ensured = 0;
  const handlers = service({ ensureWorldTables: async () => { ensured += 1; } });
  const env = {
    INSPECTOR_CHAT_ID: "999",
    DB: {
      prepare(statement) {
        calls.push({ statement, values: null });
        const call = calls.at(-1);
        return {
          bind(...values) { call.values = values; return this; },
          async first() {
            if (statement.includes("FROM users WHERE lower")) return { telegram_id: 1234, telegram_username: "@alice" };
            if (statement.includes("account_deletion_locks")) return null;
            if (statement.includes("SELECT telegram_username")) return { telegram_username: "@alice" };
            return null;
          },
          async run() { call.ran = true; return { success: true }; },
        };
      },
    },
  };
  const response = await handlers.addInspector(request({ username: "  @alice  ", telegramId: null }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, telegramId: 1234, username: "alice" });
  assert.equal(ensured, 1);
  const insert = calls.find(call => call.statement.includes("INSERT INTO inspectors"));
  assert.deepEqual(insert.values.slice(0, 3), [1234, "alice", 700]);
  assert.equal(typeof insert.values[3], "number");
  assert.equal(insert.values[4], 1234);
  assert.match(insert.statement, /WHERE NOT EXISTS\(SELECT 1 FROM account_deletion_locks/);
  assert.equal(insert.ran, true);
});

test("adding an inspector rejects empty input and malformed JSON without initializing tables", async () => {
  let ensured = 0;
  const handlers = service({ ensureWorldTables: async () => { ensured += 1; } });
  const env = { DB: { prepare() { throw new Error("unexpected query"); } } };
  const empty = await handlers.addInspector(request({ username: " ", telegramId: null }), env);
  const malformed = await handlers.addInspector(new Request("https://voxygen.test/api/inspectors", {
    method: "POST", body: "{",
  }), env);

  assert.equal(empty.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(ensured, 0);
});

test("adding the configured main inspector is rejected", async () => {
  let ensured = 0;
  const handlers = service({ ensureWorldTables: async () => { ensured += 1; } });
  const response = await handlers.addInspector(request({ telegramId: "999" }), {
    INSPECTOR_CHAT_ID: "999",
    DB: { prepare() { throw new Error("unexpected query"); } },
  });

  assert.equal(response.status, 400);
  assert.equal(ensured, 0);
});

test("adding an account under deletion lock is rejected before the inspector write", async () => {
  let writes = 0;
  const handlers = service();
  const response = await handlers.addInspector(request({ telegramId: "1234" }), {
    DB: {
      prepare(statement) {
        return {
          bind() { return this; },
          async first() { return { locked: 1 }; },
          async run() { writes += 1; },
        };
      },
    },
  });

  assert.equal(response.status, 409);
  assert.equal(writes, 0);
});

test("removing an inspector validates the path id and requires main-inspector authorization", async () => {
  const denied = json({ ok: false }, 403);
  let writes = 0;
  const handlers = service({ requireMainInspector: async () => ({ error: denied }) });
  const deniedResponse = await handlers.removeInspector(
    new Request("https://voxygen.test/api/inspectors/123", { method: "DELETE" }),
    { DB: { prepare() { writes += 1; throw new Error("unexpected query"); } } },
    new URL("https://voxygen.test/api/inspectors/123"),
  );
  assert.equal(deniedResponse, denied);
  assert.equal(writes, 0);

  const validHandlers = service();
  const invalid = await validHandlers.removeInspector(
    new Request("https://voxygen.test/api/inspectors/not-a-number", { method: "DELETE" }),
    { DB: { prepare() { writes += 1; throw new Error("unexpected query"); } } },
    new URL("https://voxygen.test/api/inspectors/not-a-number"),
  );
  assert.equal(invalid.status, 400);
  assert.equal(writes, 0);
});

test("removing an inspector deletes only the requested Telegram ID", async () => {
  let sql = "";
  let values = null;
  let writes = 0;
  const handlers = service();
  const response = await handlers.removeInspector(
    new Request("https://voxygen.test/api/inspectors/123", { method: "DELETE" }),
    {
      DB: {
        prepare(statement) {
          sql = statement;
          return {
            bind(...args) { values = args; return this; },
            async run() { writes += 1; return { success: true }; },
          };
        },
      },
    },
    new URL("https://voxygen.test/api/inspectors/123"),
  );

  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(sql, "DELETE FROM inspectors WHERE telegram_id = ?");
  assert.deepEqual(values, [123]);
  assert.equal(writes, 1);
});
