# Customization category maintenance extraction

**Date:** 2026-11-27

## What changed

- Moved `cleanupCustomizationCategories` from `bot/src/worker.js` into `bot/src/features/customization/category-maintenance.js`.
- Exported the standalone D1 helper and imported it into Worker.
- Kept the same function signature and passed the helper to world-schema initialization, customization catalog reads and admin writes.
- Preserved category liveness checks against active visuals through normalized comma-separated `categories_text` tags or `category_id`.
- Preserved deletion of unused tags and deterministic compaction by `sort_order`, `created_at` and name.
- Added behavioral tests for active tag/category references, inactive visuals, deletion of unused categories, stable sort compaction and database error propagation.

## Compatibility

No API path, category schema, item tag format, ordering policy or admin/catalog behavior is intentionally changed. Database errors still propagate to the existing caller.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run
