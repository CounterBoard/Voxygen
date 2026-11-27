# Customization visual equipment service extraction

**Date:** 2026-11-27

## What changed

- Moved the shared visual-tag matcher and territory visual-equipment lifecycle helpers out of `bot/src/worker.js` into `bot/src/features/customization/visual-equipment-service.js`.
- Added `createVisualEquipmentService` for first-marker initialization, equipped-visual eligibility and equipment reconciliation.
- Worker composes the service and continues to inject its functions into catalog, purchase, achievement, admin, Telegram inventory and membership/ownership lifecycle handlers.
- Kept the `territoryCanUseVisual` Worker export for compatibility with existing imports/tests.
- Added behavioral tests for tag matching, valid-marker preservation, invalid-marker cleanup and deterministic replacement, government-only marker handling, equipment eligibility and achievement-marker reconciliation.

## Compatibility

No API path, payload, D1 schema, visual-ownership rule, government restriction, marker ordering, notification behavior or inventory mutation was intentionally changed. Government visual synchronization remains in its existing Worker flow.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run
