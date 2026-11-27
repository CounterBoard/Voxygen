import test from "node:test";
import assert from "node:assert/strict";
import { createVisualDiscountHandler } from "../bot/src/features/customization/telegram-discounts.js";

function createHarness({
  items = [],
  operationStatus = "completed",
  claimed = true,
  activeDiscountCount = 1,
  telegramFailure = false,
} = {}) {
  const calls = { sql: [], batches: [], telegram: [], ensured: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql),
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM customization_items i LEFT JOIN customization_categories")) return { results: items };
          return { results: [] };
        },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("SELECT status FROM visual_discount_operations")) return { status: operationStatus };
          if (this.sql.includes("SELECT COUNT(*) AS count FROM customization_discounts")) return { count: activeDiscountCount };
          return null;
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.batches.push(statements);
      const changes = claimed ? [1, 1, 1, 1, 1] : [0, 0, 0, 0, 0];
      return statements.map((_, index) => ({ meta: { changes: changes[index] || 0 } }));
    },
  };
  const handler = createVisualDiscountHandler({
    ensureWorldTables: async () => { calls.ensured += 1; },
    normalizeVisualCommandText: value => String(value || "").trim().toLocaleLowerCase("ru-RU"),
    stripMinecraftFormatting: value => String(value || "").replace(/§[0-9a-fk-or]/gi, ""),
    visualHasTag: (item, target) => String(item.categories_text || "")
      .split(",").some(tag => tag.trim().toLocaleLowerCase("ru-RU") === target),
    telegram: async (_env, method, payload) => {
      if (telegramFailure) throw new Error("Telegram unavailable");
      calls.telegram.push({ method, payload });
    },
    json: (body, status = 200) => ({ body, status }),
  });
  const env = { DB };
  const update = { update_id: 7301 };
  const message = {
    text: "Все 15% 2ч",
    message_id: 91,
    chat: { id: 9001, type: "private" },
    from: { id: 9001 },
  };
  return { calls, DB, env, handler, update, message };
}

const allDiscount = {
  targets: ["Все"],
  all: true,
  percent: 15,
  mode: "set",
  durationMs: 7_200_000,
  durationLabel: "2ч",
};

test("setting a discount creates an idempotency reservation and batches the active visual changes", async () => {
  const h = createHarness({
    items: [
      { id: "visual-1", name: "Blue Banner", categories_text: "banner, rare" },
      { id: "visual-2", name: "Gold Frame", categories_text: "frame" },
    ],
  });
  const result = await h.handler(h.env, h.update, h.message, allDiscount);

  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_set", count: 2 });
  assert.equal(h.calls.ensured, 1);
  assert.equal(h.calls.batches.length, 1);
  const batch = h.calls.batches[0];
  assert.match(batch[0].sql, /INSERT OR IGNORE INTO visual_discount_operations/);
  assert.match(batch[1].sql, /status='applying'/);
  assert.match(batch[2].sql, /INSERT INTO customization_discounts/);
  assert.match(batch.at(-1).sql, /status='completed'/);
  assert.equal(batch[2].values[0], 15);
  assert.equal(batch[2].values[3], 9001);
  assert.deepEqual(batch[2].values.slice(4, 6), ["visual-1", "visual-2"]);
  assert.equal(h.calls.telegram.length, 1);
  assert.match(h.calls.telegram[0].payload.text, /Скидка 15% установлена для 2 визуалов на 2ч/);
});

test("a named target can select a visual by category tag", async () => {
  const h = createHarness({
    items: [
      { id: "visual-1", name: "Blue Banner", categories_text: "banner, rare" },
      { id: "visual-2", name: "Gold Frame", categories_text: "frame" },
    ],
  });
  const command = {
    targets: ["rare"],
    all: false,
    percent: 20,
    mode: "set",
    durationMs: 60_000,
    durationLabel: "1м",
  };
  const result = await h.handler(h.env, h.update, h.message, command);
  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_set", count: 1 });
  const statement = h.calls.batches[0][2];
  assert.match(statement.sql, /INSERT INTO customization_discounts/);
  assert.deepEqual(statement.values.slice(4, 5), ["visual-1"]);
});

test("decreasing an existing discount updates and removes zero-value rows in the same batch", async () => {
  const h = createHarness({ items: [
    { id: "visual-1", name: "Blue Banner", categories_text: "banner" },
    { id: "visual-2", name: "Gold Frame", categories_text: "frame" },
  ], activeDiscountCount: 1 });
  const command = {
    targets: ["Все"], all: true, percent: 15, mode: "decrease",
    durationMs: 2_700_000, durationLabel: "45м",
  };
  const result = await h.handler(h.env, h.update, h.message, command);
  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_decrease", count: 2 });
  const batch = h.calls.batches[0];
  assert.match(batch[2].sql, /UPDATE customization_discounts SET percent=MAX\(0,percent-\?\)/);
  assert.match(batch[3].sql, /DELETE FROM customization_discounts WHERE item_id IN/);
  assert.match(batch[4].sql, /status='completed'/);
  assert.match(h.calls.telegram[0].payload.text, /Скидка уменьшена на 15 п\.п\./);
  assert.match(h.calls.telegram[0].payload.text, /осталась у 1, удалено: 1/);
});

test("a repeated update does not apply a discount twice", async () => {
  const h = createHarness({ items: [{ id: "visual-1", name: "Blue Banner" }], claimed: false });
  const result = await h.handler(h.env, h.update, h.message, allDiscount);
  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_duplicate" });
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.telegram.length, 1);
  assert.match(h.calls.telegram[0].payload.text, /Эта команда уже обработана/);
});

test("a discount command with no active visual matches records the operation but changes no discount rows", async () => {
  const h = createHarness({ items: [] });
  const result = await h.handler(h.env, h.update, h.message, allDiscount);
  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_no_matches" });
  assert.equal(h.calls.batches[0].length, 3);
  assert.equal(h.calls.sql.some(call => call.sql.includes("FROM customization_discounts WHERE item_id IN")), false);
  assert.match(h.calls.telegram[0].payload.text, /Не найдено ни одного активного визуала/);
});

test("an invalid Telegram update ID is rejected before D1 initialization", async () => {
  const h = createHarness();
  const result = await h.handler(h.env, { update_id: "invalid" }, h.message, allDiscount);
  assert.deepEqual(result.body, { ok: true, handled: "bank_discount_invalid_update" });
  assert.equal(h.calls.ensured, 0);
  assert.equal(h.calls.sql.length, 0);
});

test("Telegram receipt failures do not undo a completed discount operation", async () => {
  const h = createHarness({ items: [{ id: "visual-1", name: "Blue Banner" }], telegramFailure: true });
  const result = await h.handler(h.env, h.update, h.message, allDiscount);
  assert.deepEqual(result.body, { ok: true, handled: "bank_visual_discount_set", count: 1 });
  assert.equal(h.calls.batches.length, 1);
});
