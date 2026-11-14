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
  assert.ok(managed.indexOf("DELETE FROM users WHERE telegram_id=?") < managed.indexOf("DELETE FROM user_directory WHERE id=?") && managed.indexOf("DELETE FROM user_directory WHERE id=?") < managed.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?"), "the deletion lock must remain active until directory cleanup finishes");
  assert.ok(managed.includes("lock retained"), "failed cleanup must preserve the lock for retry");
  const purge = source.slice(source.indexOf("async function purgeLegacyRemovedUsers"), source.indexOf("async function deleteManagedUser"));
  assert.ok(purge.indexOf("INSERT OR IGNORE INTO account_deletion_locks") < purge.indexOf("await removeManagedUserRelations(env,tid)"));
  assert.ok(purge.indexOf("DELETE FROM users WHERE telegram_id=?") < purge.indexOf("DELETE FROM user_directory WHERE telegram_id=?") && purge.indexOf("DELETE FROM user_directory WHERE telegram_id=?") < purge.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?"), "legacy purge must release the lock only after directory cleanup");
});

test("deletion lock also blocks personal balance, inventory and ledger mutations", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
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
  assert.ok(source.includes("2026-11-v34"),"schema version must advance for the new triggers");
});


test("inspector personal inventory grants use a non-throwing atomic deletion-lock predicate", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  assert.ok(source.includes("INSERT OR IGNORE INTO user_items(telegram_id,item_id,acquired_at,source) SELECT ?,?,?, 'main_inspector' WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)"), "admin grant must reject locked accounts inside INSERT");
  assert.ok(source.includes("не выдан: аккаунт находится в процессе удаления"), "admin should report a clean rejection instead of surfacing a trigger exception");
});

test("managed Telegram ID rekey rejects either side of an active deletion lock", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const rekey = source.slice(source.indexOf("async function rekeyManagedUserId"), source.indexOf("function buildOrphanedOwnerRepairStatement"));
  assert.ok(rekey.includes("SELECT telegram_id FROM account_deletion_locks WHERE telegram_id IN (?,?)"));
  assert.ok(rekey.includes(".bind(oldTid,newTid)"));
  assert.ok(rekey.includes("Нельзя изменить Telegram ID: один из аккаунтов находится в процессе удаления"));
  assert.ok(rekey.indexOf("deletionLocks") < rekey.indexOf("await env.DB.batch(statements)"));
  assert.ok(rekey.includes("await env.DB.batch(statements)"), "all identity and relation mutations must remain one atomic batch");
});


test("registration, pre-registration claims and profile edits reject deletion-locked accounts atomically", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const managed = source.slice(source.indexOf("async function addManagedUser"), source.indexOf("function buildStaleDestinationOwnerTransferStatements"));
  assert.ok(managed.includes("SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1"));
  assert.ok(managed.includes("await env.DB.batch(statements)"), "verified user and directory changes must share one atomic batch");
  assert.ok(managed.includes("Аккаунт находится в процессе удаления"));
  const update = source.slice(source.indexOf("async function updateManagedUser"), source.indexOf("async function completeRequiredAccountCleanup"));
  assert.ok(update.includes("UPDATE pre_registered_users SET hidden=1"));
  assert.ok(update.includes("await env.DB.batch(statements)"), "pre-registration claim must atomically create user/directory and hide the source row");
  assert.ok(update.includes("targetId===currentId") && update.includes("await env.DB.batch(["));
  assert.ok(update.includes("return json({ok:false,error:'Аккаунт находится в процессе удаления'},409)"));
  const claim = source.slice(source.indexOf("async function claimNickname"), source.indexOf("function buildFounderClaimStatement"));
  assert.ok(claim.includes("account_deletion_locks WHERE telegram_id=? LIMIT 1"));
  assert.ok(claim.includes("Аккаунт находится в процессе удаления"));
});

test("directory rebuild and Telegram nickname moderation cannot resurrect locked accounts", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const directorySync = source.slice(source.indexOf("async function syncUserDirectory"), source.indexOf("async function listManagedUsers"));
  assert.ok(directorySync.includes("NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=u.telegram_id)"), "directory sync must skip locked users");
  const moderation = source.slice(source.indexOf("async function handleNicknameCallback"), source.indexOf("async function startTerritoryApproval"));
  assert.ok(moderation.includes("account deletion in progress"));
  assert.ok(moderation.includes("Аккаунт находится в процессе удаления"));
});


test("account directory and inspector grants remain blocked until deletion lock release", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  for (const trigger of [
    "guard_user_directory_deletion_lock_insert",
    "guard_user_directory_deletion_lock_update",
    "guard_inspectors_deletion_lock_insert",
    "guard_inspectors_deletion_lock_update",
  ]) assert.ok(source.includes("CREATE TRIGGER IF NOT EXISTS "+trigger), "missing account-role/directory guard: "+trigger);
  assert.ok(source.includes("2026-11-v34"), "schema version must advance for directory and inspector triggers");
  assert.ok(source.includes("CREATE TABLE IF NOT EXISTS inspectors ( telegram_id INTEGER PRIMARY KEY, telegram_username TEXT, added_by INTEGER, created_at INTEGER NOT NULL )"), "inspector table must exist before its triggers are installed");
  const addInspector = source.slice(source.indexOf("async function addInspector"), source.indexOf("async function removeInspector"));
  assert.ok(addInspector.includes("INSERT INTO inspectors (telegram_id, telegram_username, added_by, created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)"));
  const managed = source.slice(source.indexOf("async function deleteManagedUser"), source.indexOf("async function listInspectors"));
  assert.ok(managed.indexOf("DELETE FROM user_directory WHERE id=?") < managed.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?"));
  const purge = source.slice(source.indexOf("async function purgeLegacyRemovedUsers"), source.indexOf("async function deleteManagedUser"));
  assert.ok(purge.indexOf("DELETE FROM user_directory WHERE telegram_id=?") < purge.indexOf("DELETE FROM account_deletion_locks WHERE telegram_id=?"));
});


test("deletion lock guards active invitations, manager workflows, preferences and event state", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  for (const trigger of [
    "guard_city_invites_deletion_lock_insert",
    "guard_city_invites_deletion_lock_identity_update",
    "guard_territory_requests_deletion_lock_insert",
    "guard_territory_requests_deletion_lock_update",
    "guard_manager_change_requests_deletion_lock_insert",
    "guard_manager_change_requests_deletion_lock_identity_update",
    "guard_manager_change_votes_deletion_lock_insert",
    "guard_manager_change_votes_deletion_lock_update",
    "guard_user_preferences_deletion_lock_insert",
    "guard_user_preferences_deletion_lock_update",
    "guard_territory_notification_preferences_deletion_lock_insert",
    "guard_territory_notification_preferences_deletion_lock_update",
    "guard_events_deletion_lock_insert",
    "guard_event_reminders_deletion_lock_insert",
    "guard_event_reminders_deletion_lock_update",
    "guard_event_create_requests_deletion_lock_insert",
    "guard_event_create_requests_deletion_lock_update",
    "guard_ratings_deletion_lock_insert",
    "guard_comments_deletion_lock_insert",
    "guard_screenshots_deletion_lock_insert",
    "guard_inspector_ratings_deletion_lock_insert",
    "guard_comment_replies_deletion_lock_insert",
    "guard_territory_manager_granter_deletion_lock_insert",
    "guard_territory_manager_granter_deletion_lock_update",
    "guard_bank_transactions_deletion_lock_insert",
  ]) assert.ok(source.includes("CREATE TRIGGER IF NOT EXISTS "+trigger), "missing user-data deletion guard: "+trigger);
  const cleanup = source.slice(source.indexOf("async function removeManagedUserRelations"), source.indexOf("async function purgeLegacyRemovedUsers"));
  for (const table of ["user_preferences","territory_notification_preferences","event_reminders","event_create_requests"]) {
    assert.ok(cleanup.includes("DELETE FROM "+table+" WHERE telegram_id=?"), "account cleanup must remove active personal state from "+table);
  }
  assert.ok(cleanup.indexOf("await ensureUserPreferenceTables(env)")>=0 && cleanup.indexOf("await ensureEventsTables(env)")>=0);
});


test("event publishing, reminders and manager workflows reject deletion races", async () => {
  const source = (await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8")).replace(/\s+/g, " ");
  const createEvent = source.slice(source.indexOf("async function createEvent"), source.indexOf("async function updateEvent"));
  assert.ok(createEvent.includes("account_deletion_locks WHERE telegram_id=? LIMIT 1"));
  assert.ok(createEvent.includes("await env.DB.batch(["));
  assert.ok(createEvent.includes("Аккаунт находится в процессе удаления"));
  const reminders = source.slice(source.indexOf("async function saveEventReminder"), source.indexOf("function normalizeVisualCommandText"));
  assert.ok(reminders.includes("account_deletion_locks WHERE telegram_id=? LIMIT 1"));
  assert.ok(reminders.includes("NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=r.telegram_id)"));
  const reminderDelivery = source.slice(source.indexOf("async function deliverEventReminders"), source.indexOf("function normalizeVisualCommandText"));
  const reminderUpdates = [...reminderDelivery.matchAll(/UPDATE event_reminders SET[\\s\\S]*?\\.run\\(\\)/g)];
  assert.ok(reminderUpdates.length > 0 && reminderUpdates.every(match => match[0].includes("account_deletion_locks")), "every reminder scheduler update must be race-safe for locked accounts");
  const promotion = source.slice(source.indexOf("async function promoteResident"), source.indexOf("async function demoteManager"));
  const demotion = source.slice(source.indexOf("async function demoteManager"), source.indexOf("async function applyManagerChange"));
  assert.ok(promotion.includes("account_deletion_locks WHERE telegram_id IN (?,?)"));
  assert.ok(demotion.includes("account_deletion_locks WHERE telegram_id IN (?,?)"));
  const invite = source.slice(source.indexOf("async function inviteResident"), source.indexOf("async function sendResidentInvite"));
  assert.ok(invite.includes("account deletion in progress"));
  const callback = source.slice(source.indexOf("async function handleResidentInviteCallback"), source.indexOf("async function notifyPendingInvitesForUser"));
  assert.ok(callback.includes("account_deletion_locks WHERE telegram_id=? LIMIT 1"));
});
