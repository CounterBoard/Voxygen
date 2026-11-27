import test from "node:test";
import assert from "node:assert/strict";
import { cleanupCustomizationCategories } from "../bot/src/features/customization/category-maintenance.js";

function createHarness({
  categories = [],
  items = [],
  failAt = null,
} = {}) {
  const calls = { prepared: [], deletes: [], sortUpdates: [] };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          const query = { sql: String(sql), values };
          calls.prepared.push(query);
          return {
            async all() {
              if (failAt === "categories") throw new Error("category read failed");
              if (query.sql === "SELECT id,name FROM customization_categories") {
                return { results: categories.map(row => ({ ...row })) };
              }
              if (query.sql.includes("SELECT id FROM customization_categories ORDER BY sort_order ASC")) {
                return {
                  results: categories
                    .slice()
                    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
                      || Number(a.created_at || 0) - Number(b.created_at || 0)
                      || String(a.name).localeCompare(String(b.name)))
                    .map(row => ({ id: row.id })),
                };
              }
              throw new Error("Unexpected all() SQL: " + query.sql);
            },
            async first() {
              if (failAt === "usage") throw new Error("usage lookup failed");
              if (!query.sql.includes("FROM customization_items")) {
                throw new Error("Unexpected first() SQL: " + query.sql);
              }
              const [name, categoryId] = query.values;
              const normalizedName = String(name).toLocaleLowerCase("en").replace(/\s/g, "");
              const found = items.some(item => Number(item.active || 0) === 1 && (
                String(item.categories_text || "")
                  .split(",")
                  .some(tag => tag.toLocaleLowerCase("en").replace(/\s/g, "") === normalizedName)
                || String(item.category_id || "") === String(categoryId)
              ));
              return found ? { exists: 1 } : null;
            },
            async run() {
              if (query.sql.startsWith("DELETE FROM customization_categories")) {
                calls.deletes.push(query.values[0]);
                const index = categories.findIndex(row => String(row.id) === String(query.values[0]));
                if (index >= 0) categories.splice(index, 1);
                return { meta: { changes: index >= 0 ? 1 : 0 } };
              }
              if (query.sql.startsWith("UPDATE customization_categories SET sort_order")) {
                calls.sortUpdates.push(query.values.slice());
                const row = categories.find(item => String(item.id) === String(query.values[1]));
                if (row) row.sort_order = query.values[0];
                return { meta: { changes: row ? 1 : 0 } };
              }
              throw new Error("Unexpected run() SQL: " + query.sql);
            },
          };
        },
      };
    },
  };
  return { env: { DB }, calls, categories };
}

test("category cleanup deletes only tags without active visual usage", async () => {
  const h = createHarness({
    categories: [
      { id: "orphan", name: "Orphan", sort_order: 5, created_at: 1 },
      { id: "tag-used", name: "City Style", sort_order: 8, created_at: 2 },
      { id: "id-used", name: "Fallback", sort_order: 10, created_at: 3 },
    ],
    items: [
      { active: 0, categories_text: "Orphan", category_id: null },
      { active: 1, categories_text: "FRAME, city style", category_id: null },
      { active: 1, categories_text: "OTHER", category_id: "id-used" },
    ],
  });

  await cleanupCustomizationCategories(h.env);

  assert.deepEqual(h.calls.deletes, ["orphan"]);
  assert.deepEqual(h.categories.map(row => row.id), ["tag-used", "id-used"]);
  const usageQueries = h.calls.prepared.filter(query => query.sql.includes("FROM customization_items"));
  assert.deepEqual(usageQueries.map(query => query.values), [
    ["Orphan", "orphan"],
    ["City Style", "tag-used"],
    ["Fallback", "id-used"],
  ]);
});

test("category cleanup compacts remaining sort order without changing relative order", async () => {
  const h = createHarness({
    categories: [
      { id: "third", name: "Third", sort_order: 30, created_at: 3 },
      { id: "first", name: "First", sort_order: 10, created_at: 1 },
      { id: "second", name: "Second", sort_order: 20, created_at: 2 },
    ],
    items: [
      { active: 1, categories_text: "First", category_id: null },
      { active: 1, categories_text: "Second", category_id: null },
      { active: 1, categories_text: "Third", category_id: null },
    ],
  });

  await cleanupCustomizationCategories(h.env);

  assert.deepEqual(h.calls.deletes, []);
  assert.deepEqual(h.calls.sortUpdates, [[0, "first"], [1, "second"], [2, "third"]]);
  assert.deepEqual(h.categories.map(row => row.sort_order), [2, 0, 1]);
});

test("category cleanup handles an empty category table without writes", async () => {
  const h = createHarness({ categories: [], items: [] });

  await cleanupCustomizationCategories(h.env);

  assert.deepEqual(h.calls.deletes, []);
  assert.deepEqual(h.calls.sortUpdates, []);
  assert.equal(h.calls.prepared.length, 2);
});

test("category cleanup ignores inactive visuals even when their old tags still match", async () => {
  const h = createHarness({
    categories: [{ id: "tag", name: "Old Tag", sort_order: 7, created_at: 1 }],
    items: [{ active: 0, categories_text: "Old Tag", category_id: null }],
  });

  await cleanupCustomizationCategories(h.env);

  assert.deepEqual(h.calls.deletes, ["tag"]);
  assert.deepEqual(h.calls.sortUpdates, []);
});

test("category cleanup propagates database failures instead of reporting a false success", async () => {
  const h = createHarness({
    categories: [{ id: "tag", name: "Tag", sort_order: 0, created_at: 1 }],
    failAt: "usage",
  });

  await assert.rejects(() => cleanupCustomizationCategories(h.env), /usage lookup failed/);
});
