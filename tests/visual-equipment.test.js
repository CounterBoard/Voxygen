import test from "node:test";
import assert from "node:assert/strict";
import { territoryCanUseVisual } from "../bot/src/worker.js";

class VisualEligibilityD1 {
  constructor({ government, visualGovernment, status = "approved", tag = "Метка", inventory = true }) {
    this.territory = { is_government: government ? 1 : 0, status };
    this.visual = { id: "visual-1", active: 1, government_marker: visualGovernment ? 1 : 0, categories_text: tag, category_name: null };
    this.inventory = inventory;
  }

  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          first: async () => {
            if (sql.includes("FROM territories")) return db.territory;
            if (sql.includes("FROM customization_items")) return db.visual;
            if (sql.includes("SELECT 1 FROM city_items")) return db.inventory ? { 1: 1 } : null;
            throw new Error(`Unexpected SQL: ${sql}`);
          },
        };
      },
    };
  }
}

test("ordinary territories can equip ordinary visuals, but not government-only visuals", async () => {
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: false, visualGovernment: false }) }, "city-1", "visual-1", "метка"), true);
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: false, visualGovernment: true }) }, "city-1", "visual-1", "метка"), false);
});

test("government territories can equip government visuals, but not ordinary visuals", async () => {
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: true, visualGovernment: true }) }, "gov-1", "visual-1", "метка"), true);
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: true, visualGovernment: false }) }, "gov-1", "visual-1", "метка"), false);
});

test("visual equipment requires an approved territory, active visual, matching tag and inventory ownership", async () => {
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: false, visualGovernment: false, status: "pending" }) }, "city-1", "visual-1", "метка"), false);
  const inactive = new VisualEligibilityD1({ government: false, visualGovernment: false });
  inactive.visual.active = 0;
  assert.equal(await territoryCanUseVisual({ DB: inactive }, "city-1", "visual-1", "метка"), false);
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: false, visualGovernment: false, tag: "Обложка" }) }, "city-1", "visual-1", "метка"), false);
  assert.equal(await territoryCanUseVisual({ DB: new VisualEligibilityD1({ government: false, visualGovernment: false, inventory: false }) }, "city-1", "visual-1", "метка"), false);
});
