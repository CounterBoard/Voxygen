import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("account deletion lock is durable and guards account resurrection writes", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  assert.ok(source.includes("CREATE TABLE IF NOT EXISTS account_deletion_locks ( telegram_id INTEGER PRIMARY KEY, locked_at INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT 'managed_delete' )"));
  for (const trigger of [
    "guard_users_deletion_lock_insert",
    "guard_users_deletion_lock_update",
    "guard_city_memberships_deletion_lock_insert",
    "guard_city_memberships_deletion_lock_update",
    "guard_territory_managers_deletion_lock_insert",
    "guard_territory_managers_deletion_lock_update",
    "guard_territories_deletion_lock_owner",
  ]) assert.ok(source.includes("CREATE TRIGGER IF NOT EXISTS "+trigger), "missing deletion barrier: "+trigger);
  assert.ok(source.includes("BEFORE UPDATE ON users WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)"), "all users updates must be blocked, including nickname re-registration");
});

test("managed and legacy deletion hold the barrier across relation cleanup", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const managed = source.slice(source.indexOf("async function deleteManagedUser"), source.indexOf("async function listInspectors"));
  assert.ok(managed.indexOf("INSERT OR IGNORE INTO account_deletion_locks") < managed.indexOf("await removeManagedUserRelations(env,tid)"));
  assert.ok(managed.indexOf("await removeManagedUserRelations(env,tid)") < managed.indexOf("DELETE FROM users WHERE telegram_id=?"));
  assert.ok(managed.indexOf("DELETE FROM users WHERE telegram_id=?") < managed.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?") && managed.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?") < managed.indexOf("DELETE FROM user_directory WHERE id=?"));
  assert.ok(managed.includes("lock retained"), "failed cleanup must preserve the lock for retry");
  const purge = source.slice(source.indexOf("async function purgeLegacyRemovedUsers"), source.indexOf("async function deleteManagedUser"));
  assert.ok(purge.indexOf("INSERT OR IGNORE INTO account_deletion_locks") < purge.indexOf("await removeManagedUserRelations(env,tid)"));
  assert.ok(purge.indexOf("DELETE FROM users WHERE telegram_id=?") < purge.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?") && purge.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?") < purge.indexOf("DELETE FROM user_directory WHERE telegram_id=?"));
});

test("deletion lock also blocks personal balance, inventory and ledger mutations", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\\s+/g, " ");
  for (const trigger of [
    "guard_user_currency_deletion_lock_insert",
    "guard_user_currency_deletion_lock_update",
    "guard_user_items_deletion_lock_insert",
    "guard_user_items_deletion_lock_update",
    "guard_financial_operations_deletion_lock_insert",
    "guard_financial_operations_deletion_lock_update",
  ]) assert.ok(source.includes("CREATE TRIGGER IF NOT EXISTS "+trigger), "missing financial deletion guard: "+trigger);
  assert.ok(source.includes("BEFORE UPDATE ON user_currency WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)"));
  assert.ok(source.includes("BEFORE INSERT ON user_items WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)"));
  assert.ok(source.includes("BEFORE INSERT ON financial_operations WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=NEW.telegram_id)"));
  assert.ok(source.includes("NOT EXISTS (SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)"),"city treasury purchase must reject locked buyer");
  assert.ok(source.includes("guard_city_memberships_deletion_lock_update_all_v31"));
  assert.ok(source.includes("guard_territory_managers_deletion_lock_update_all_v31"));
  assert.ok(source.includes("BEFORE UPDATE ON city_memberships WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)"));
  assert.ok(source.includes("BEFORE UPDATE ON territory_managers WHEN EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=OLD.telegram_id OR telegram_id=NEW.telegram_id)"));
  assert.ok(source.includes("2026-11-v31"),"schema version must advance for the new triggers");
});
