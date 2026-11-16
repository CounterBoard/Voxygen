import test from "node:test";
import assert from "node:assert/strict";
import { buildFounderClaimStatement } from "../bot/src/worker.js";

test("founder claim rechecks the live verified user and nickname inside the UPDATE", () => {
  let captured;
  const env = { DB: { prepare(sql) { return { bind(...values) { captured = { sql, values }; return captured; } }; } } };
  buildFounderClaimStatement(env, "territory-1", 42, "@current_name");

  assert.match(captured.sql, /^UPDATE territories SET/);
  assert.match(captured.sql, /WHERE id=\? AND status='approved' AND owner_telegram_id IS NULL/);
  assert.match(captured.sql, /EXISTS\(SELECT 1 FROM users u WHERE u\.telegram_id=\? AND u\.status='verified'/);
  assert.match(captured.sql, /trim\(COALESCE\(u\.mc_nickname,''\)\)<>''/);
  assert.match(captured.sql, /lower\(trim\(owner_input\)\)=lower\(trim\(u\.mc_nickname\)\)/);
  assert.match(captured.sql, /COALESCE\(NULLIF\(u\.telegram_username,''\),\?\)/);
  assert.deepEqual(captured.values, [42, "current_name", 42, 42, "territory-1", 42, "current_name"]);
});

test("founder claim writes identity fields from the same live user row it validates", () => {
  let sql = "";
  const env = { DB: { prepare(value) { sql = value; return { bind() { return this; } }; } } };
  buildFounderClaimStatement(env, "territory-2", 77, "fallback");
  assert.match(sql, /owner_telegram_username=\(SELECT COALESCE\(NULLIF\(trim\(u\.telegram_username\),''\),\?\) FROM users u WHERE u\.telegram_id=\?\)/);
  assert.match(sql, /owner_input=\(SELECT u\.mc_nickname FROM users u WHERE u\.telegram_id=\?\)/);
});
