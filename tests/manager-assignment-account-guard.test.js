import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manager assignment INSERT rechecks verified account and nickname", async () => {
  const source = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const normalized = source.replace(/\\s+/g, " ");
  assert.match(normalized, /INSERT OR IGNORE INTO territory_managers\\(territory_id,telegram_id,granted_by,granted_at\\) SELECT \\?,\\?,?,\\? WHERE EXISTS\\(SELECT 1 FROM users WHERE telegram_id=\\? AND status='verified' AND trim\\(COALESCE\\(mc_nickname,''\\)\\)<>''\\)/);
  assert.ok(assignment, "manager assignment must guard the target user in the INSERT itself");
});

test("manager owner handoff UPDATE rechecks target account", async () => {
  const source = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const guardedUpdates = source.match(/UPDATE territories SET owner_telegram_id=\?,owner_telegram_username=\?,owner_input=\? WHERE id=\? AND status='approved' AND owner_telegram_id=\? AND EXISTS\(SELECT 1 FROM users WHERE telegram_id=\? AND status='verified' AND trim\(COALESCE\(mc_nickname,''\)\)<>''\)/g) || [];
  assert.equal(guardedUpdates.length, 1, "manager replacement owner update must include verified/nickname guard");
  const managerHandoff = source.match(/UPDATE territories SET owner_telegram_id=\?,owner_telegram_username=\?,owner_input=\? WHERE id=\? AND status='approved' AND owner_telegram_id=\? AND EXISTS\(SELECT 1 FROM territory_managers[\s\S]*?AND EXISTS\(SELECT 1 FROM users WHERE telegram_id=\? AND status='verified'/);
  assert.ok(managerHandoff, "owner handoff to another manager must recheck target account");
});
