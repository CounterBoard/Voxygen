# Treasury backend service extraction

**Date:** 2026-11-27

## What changed

- Moved `getTreasury`, `normalizeFinancialOperationId`, `executeIdempotentFinancialTransfer`, `treasuryDeposit`, `treasuryDonate` and `treasuryWithdraw` from `bot/src/worker.js` into `bot/src/features/treasury/service.js`.
- Added `createTreasuryService` with explicit authentication, world-schema, territory permission, manager-row, notification and response dependencies.
- Worker instantiates the service once and keeps the existing HTTP route handler names.
- Worker continues exposing `executeIdempotentFinancialTransfer` from its legacy test/export surface, now bound to the service implementation.
- Updated financial atomicity source contracts to inspect both Worker and the extracted treasury service.
- Added treasury service tests for D1 batch composition, idempotent replay, operation-ID mismatch, deletion-lock failure and ID validation.
- Updated `docs/ARCHITECTURE.md`.

## Scope intentionally left in Worker

Telegram banker commands, personal gem withdrawal chat commands, banker visual-discount commands and customization purchases remain in Worker. They continue to call the same idempotent financial helper through the Worker binding; these will be considered as separate treasury/banking or customization steps.

## Compatibility

No HTTP route, permission rule, SQL predicate, transaction order, operation ID format, ledger status mapping, response payload or notification behavior was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
