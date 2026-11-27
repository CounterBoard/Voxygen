# Customization purchase service extraction

**Date:** 2026-11-27

## What changed

- Moved the authenticated `POST /api/customization/purchase` handler from `bot/src/worker.js` into `bot/src/features/customization/purchase-service.js`.
- Added `createCustomizationPurchaseService` with explicit dependencies for authorization, D1 initialization, treasury manager scope, role resolution, discounted price calculation, banker/manager notices, marker setup and achievement evaluation.
- Preserved the personal and territory debit SQL, inventory insert, `gem_spend_log` write and their exact order in a single D1 batch.
- Preserved ownership/concurrency checks, government/hidden visual restrictions, deletion-lock predicates and the 409 response on a locked-account batch failure.
- Preserved best-effort purchase notifications, `ctx.waitUntil` behavior, attributed-territory marker setup and achievement evaluation.
- Added behavioral tests for personal and territory purchases, discount pricing, already-owned/racing purchases, insufficient funds, restricted visuals, deletion locks, async notifications and side-effect failures.
- Updated purchase source-contract tests and customization/architecture docs.

## Compatibility

No route, request/response field, price rule, D1 statement ordering, inventory source label, spend-log attribution, notification recipient/template, account-scope permission or purchase side effect was intentionally changed.

## Transaction invariant

For both account types, balance debit, inventory insert and `gem_spend_log` remain three consecutive statements in the same D1 `batch`; inventory insertion and spend journal are conditional on the preceding statement's `changes()` result.

## Scope intentionally left unchanged

Catalog reads, admin writes, Telegram discounts/inventory commands, treasury API transfers and the `gem_spend_log`/inventory schema remain in their current modules.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run