# Customization catalog service extraction

**Date:** 2026-11-27

## What changed

- Moved the authenticated `GET /api/customization` full and lite catalog/inventory handler from `bot/src/worker.js` into `bot/src/features/customization/catalog-service.js`.
- Added `createCustomizationCatalogService` with explicit dependencies for user authorization, world-table initialization, treasury manager lookup, category cleanup, role resolution, discount price calculation, territory manager rows, first-marker setup and JSON responses.
- Preserved personal and treasury account scopes, manager-only treasury access, profile-territory membership checks, lite balance shape, full catalog queries, hidden/government visual filtering, discounts, owned inventory, territory inventory deduplication and award/equipped-marker response fields.
- Extended the financial atomicity source test to continue checking the personal balance initialization deletion-lock predicate in the new service module.
- Added focused catalog service tests for authentication, lite personal/treasury reads, invalid treasury scope fallback, full catalog visibility/pricing, territory inventory/awards, main-inspector visibility and unauthorized profile territories.
- Updated customization and architecture documentation.

## Compatibility

No HTTP method/path, query parameter, response field, item visibility rule, discount calculation, treasury permission, SQL table, first-marker behavior or purchase/payment path was intentionally changed.

## Scope intentionally left unchanged

`purchaseCustomizationItem`, treasury debits, `gem_spend_log`, banker purchase notifications, customization admin writes, achievement evaluation, Telegram discount and visual-inventory handlers remain in their current modules.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run