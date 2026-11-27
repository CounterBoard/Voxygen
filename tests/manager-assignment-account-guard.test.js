import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [worker, managerChangeService] = await Promise.all([
  readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../bot/src/features/territories/manager-change-service.js", import.meta.url), "utf8"),
]);
const normalized = `${worker}\n${managerChangeService}`.replace(/\\s+/g, " ");

test("manager assignment INSERT rechecks verified account and nickname", () => {
  assert.ok(normalized.includes("INSERT OR IGNORE INTO territory_managers(territory_id,telegram_id,granted_by,granted_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?) AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')"), "manager assignment must guard the target user in the INSERT itself");
});

test("manager owner handoff UPDATE rechecks target account", () => {
  assert.ok(normalized.includes("UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=? WHERE id=? AND status='approved' AND owner_telegram_id=? AND EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?)"), "owner replacement must keep the approved-territory and manager relation guards");
  assert.ok(normalized.includes("SELECT telegram_id,telegram_username,mc_nickname FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>''"), "owner handoff must recheck the next owner account and nickname");
});
