# Customization admin service extraction

**Date:** 2026-11-27

## What changed

- Moved main-inspector visual catalog create/edit, visibility, soft deletion and visual/tag ordering handlers into `bot/src/features/customization/admin-service.js`.
- Moved tag normalization, category upsert, marker-tag recognition and government-visual marker synchronization with their exclusive CRUD callers.
- Added `createCustomizationAdminService` with injected authorization, D1 initialization, achievement validation/evaluation, category cleanup, equipment reconciliation, JSON response and ID-generation dependencies.
- Preserved all existing HTTP routes, payload fields, validation errors, sort-order semantics, government marker rules, category cleanup, equipment reconciliation, achievement evaluation and soft-deletion batch order.
- Kept `cleanupCustomizationCategories`, purchase transactions, discount calculation and all money/ledger logic in their existing Worker/feature boundaries.
- Added focused tests for authorization, create validation/persistence, government marker validation, update reconciliation, visibility, soft deletion and item/tag ordering.
- Updated customization and architecture documentation.

## Compatibility

No public route, method, request/response field, validation boundary, D1 schema, achievement history policy or purchase behavior was intentionally changed.

## Scope intentionally left unchanged

`getCustomization`, `purchaseCustomizationItem`, territory equipment, and visual discount/Telegram operations remain in their current modules.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run