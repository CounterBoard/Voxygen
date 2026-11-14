import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrphanedOwnerRepairStatement,
  buildUnclaimedOwnerRepairStatement,
} from "../bot/src/worker.js";

function captureBuilder(builder, args) {
  let captured;
  const env = { DB: { prepare(sql) { return { bind(...values) { captured = { sql, values }; return captured; } }; } } };
  builder(env, args);
  return captured;
}

test("orphaned owner repair rechecks the stale owner, verified identity and unique nickname at write time", () => {
  const q = captureBuilder(buildOrphanedOwnerRepairStatement, {
    territoryId: "city-1", staleOwnerId: 10, telegramId: 20,
    nickname: "Player", fallbackUsername: "@player_tg",
  });
  assert.match(q.sql, /owner_telegram_id=\?/);
  assert.match(q.sql, /owner_telegram_id=\?/);
  assert.match(q.sql, /NOT EXISTS\(SELECT 1 FROM users current_owner/);
  assert.match(q.sql, /u\.telegram_id=\? AND u\.status='verified'/);
  assert.match(q.sql, /SELECT COUNT\(\*\) FROM users eligible WHERE eligible\.status='verified'/);
  assert.deepEqual(q.values, [20, "player_tg", 20, 20, "city-1", 10, 20, "Player", "Player"]);
});

test("unclaimed owner repair checks current verified identity and uniqueness for nickname or username", () => {
  const q = captureBuilder(buildUnclaimedOwnerRepairStatement, {
    territoryId: "city-2", telegramId: 30, nickname: "Builder",
    fallbackUsername: "builder_tg", ownerInput: "@builder_tg",
  });
  assert.match(q.sql, /owner_telegram_id IS NULL/);
  assert.match(q.sql, /u\.telegram_id=\? AND u\.status='verified'/);
  assert.match(q.sql, /lower\(trim\(u\.mc_nickname\)\)=lower\(trim\(\?\)\)/);
  assert.match(q.sql, /SELECT COUNT\(\*\) FROM users eligible/);
  assert.deepEqual(q.values, [30, "builder_tg", 30, 30, "city-2", 30, "@builder_tg", "builder_tg", "builder_tg", "@builder_tg", "builder_tg"]);
});
