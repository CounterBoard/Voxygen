import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manager assignment INSERT rechecks verified account and nickname", async () => {
  const source = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const normalized = source.replace(/\s+/g, " ");
  assert.ok(normalized.includes("INSERT OR IGNORE INTO territory_managers(territory_id,telegram_id,granted_by,granted_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')"), "manager assignment must guard the target user in the INSERT itself");
});

test("manager owner handoff UPDATE rechecks target account", async () => {
  const source = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
  const normalized = source.replace(/\s+/g, " ");
  assert.ok(normalized.includes("UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=? WHERE id=? AND status='approved' AND owner_telegram_id=? AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')"), "owner replacement must include verified/nickname guard");
  assert.ok(normalized.includes("AND EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?) AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified'"), "handoff to another manager must recheck the manager relation and account");
});
