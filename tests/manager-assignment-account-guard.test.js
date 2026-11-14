import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manager assignment INSERT rechecks verified account and nickname", async () => {
  const source = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const assignment = source.match(/INSERT OR IGNORE INTO territory_managers\(territory_id,telegram_id,granted_by,granted_at\) SELECT \?,\?,?,\? WHERE EXISTS\(SELECT 1 FROM users WHERE telegram_id=\? AND status='verified' AND trim\(COALESCE\(mc_nickname,''\)\)<>''\)/);
  assert.ok(assignment, "manager assignment must guard the target user in the INSERT itself");
});
