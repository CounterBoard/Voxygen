import test from "node:test";
import assert from "node:assert/strict";
import { createVoxGridService } from "../bot/src/features/vox-grid/service.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function request(body, url = "https://voxygen.test/api/vox-grid") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function service(overrides = {}) {
  return createVoxGridService({
    requireMainInspector: async () => ({ user: { id: 700 } }),
    requireUser: async () => ({ user: { id: 700, username: "inspector" } }),
    getRoleByTelegramId: async () => "main_inspector",
    ensureWorldTables: async () => {},
    json,
    ...overrides,
  });
}

test("Vox grid read returns a complete 8-by-9 grid and overlays persisted marked cells", async () => {
  const handlers = service();
  const response = await handlers.getVoxGridResponse(new Request("https://voxygen.test/api/vox-grid"), {
    DB: {
      prepare(sql) {
        assert.match(sql, /SELECT row_index, col_index, state FROM vox_grid ORDER BY row_index, col_index/);
        return { async all() { return { results: [
          { row_index: 0, col_index: 0, state: "?" },
          { row_index: 7, col_index: 8, state: "?" },
          { row_index: 2, col_index: 3, state: "invalid" },
          { row_index: 8, col_index: 0, state: "?" },
        ] }; } };
      },
    },
  });
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.equal(body.canEdit, true);
  assert.equal(body.cells.length, 72);
  assert.deepEqual(body.cells[0], { row: 0, col: 0, state: "?" });
  assert.deepEqual(body.cells.at(-1), { row: 7, col: 8, state: "?" });
  assert.deepEqual(body.cells.find(cell => cell.row === 2 && cell.col === 3), { row: 2, col: 3, state: "" });
});

test("Vox grid read keeps the grid public while exposing edit permission only to the main inspector", async () => {
  const order = [];
  const handlers = service({
    requireUser: async () => { order.push("auth"); return { error: json({ ok: false }, 401) }; },
    getRoleByTelegramId: async () => { throw new Error("role lookup must be skipped"); },
    ensureWorldTables: async () => { order.push("tables"); },
  });
  const response = await handlers.getVoxGridResponse(new Request("https://voxygen.test/api/vox-grid"), {
    DB: { prepare() { order.push("select"); return { async all() { return { results: [] }; } }; } },
  });

  assert.deepEqual(order, ["tables", "select", "auth"]);
  const body = await response.json();
  assert.equal(body.cells.length, 72);
  assert.equal(body.canEdit, false);
});

test("Vox grid read grants edit permission to a main inspector role lookup", async () => {
  let roleArgs;
  const handlers = service({
    getRoleByTelegramId: async (...args) => { roleArgs = args; return "inspector"; },
  });
  const env = { DB: { prepare() { return { async all() { return { results: [] }; } }; } } };
  const response = await handlers.getVoxGridResponse(new Request("https://voxygen.test/api/vox-grid"), env);
  assert.deepEqual(roleArgs, [env, 700, "inspector"]);
  assert.equal((await response.json()).canEdit, false);
});

test("Vox grid reset authorizes before initialization and clears every cell", async () => {
  const calls = [];
  const denied = json({ ok: false, error: "forbidden" }, 403);
  const deniedHandlers = service({
    requireMainInspector: async () => ({ error: denied }),
    ensureWorldTables: async () => { throw new Error("must not initialize"); },
  });
  const deniedResponse = await deniedHandlers.resetVoxGrid(request({}), { DB: {} });
  assert.equal(deniedResponse, denied);

  const handlers = service({ ensureWorldTables: async () => { calls.push("init"); } });
  const response = await handlers.resetVoxGrid(request({}), {
    DB: {
      prepare(sql) {
        calls.push(sql);
        return { bind(...args) { calls.push(args); return this; }, async run() { calls.push("run"); } };
      },
    },
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls[0], "init");
  assert.match(calls[1], /UPDATE vox_grid SET state='', updated_by=\?, updated_at=\?/);
  assert.deepEqual(calls[2].slice(0, 1), [700]);
  assert.equal(typeof calls[2][1], "number");
  assert.equal(calls[3], "run");
});

test("Vox grid cell save validates JSON and coordinates before writing", async () => {
  let writes = 0;
  const handlers = service();
  const env = {
    DB: { prepare() { return { bind() { return this; }, async run() { writes += 1; } }; } },
  };
  const malformed = await handlers.saveVoxCell(new Request("https://voxygen.test/api/vox-grid", { method: "POST", body: "{" }), env);
  const invalid = await handlers.saveVoxCell(request({ row: 8, col: 0 }), env);
  const invalidColumn = await handlers.saveVoxCell(request({ row: 0, col: 9 }), env);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "Invalid JSON");
  assert.equal(invalid.status, 400);
  assert.equal(invalidColumn.status, 400);
  assert.equal(writes, 0);
});

test("Vox grid cell save preserves the upsert contract and normalizes every non-question state to empty", async () => {
  const calls = [];
  const handlers = service();
  const response = await handlers.saveVoxCell(request({ row: 7, col: 8, state: "?" }), {
    DB: {
      prepare(sql) {
        calls.push({ sql, values: null });
        return {
          bind(...values) { calls.at(-1).values = values; return this; },
          async run() { calls.at(-1).ran = true; },
        };
      },
    },
  });
  assert.deepEqual(await response.json(), { ok: true, row: 7, col: 8, state: "?" });
  assert.match(calls[0].sql, /ON CONFLICT\(row_index, col_index\) DO UPDATE/);
  assert.deepEqual(calls[0].values.slice(0, 4), [7, 8, "?", 700]);
  assert.equal(typeof calls[0].values[4], "number");
  assert.equal(calls[0].ran, true);

  const emptyResponse = await handlers.saveVoxCell(request({ row: 0, col: 0, state: "anything" }), {
    DB: { prepare() { return { bind(...values) { calls.push({ values }); return this; }, async run() {} }; } },
  });
  assert.deepEqual(await emptyResponse.json(), { ok: true, row: 0, col: 0, state: "" });
  assert.equal(calls.at(-1).values[2], "");
});
