# Territory award placement service extraction

**Date:** 2026-11-27

## What changed

- Moved `toggleTerritoryAwardPlacement` from `bot/src/worker.js` into `bot/src/features/awards/placement-service.js`.
- Added `createTerritoryAwardPlacementService` with injected user authentication, world-schema initialization, territory-manager authorization and JSON response creation.
- Kept the existing `POST /api/customization/city/award` route and request/response contract in Worker.
- Preserved approved-territory and non-government restrictions, manager-only access, award ownership checks, atomic unequip/slot compaction, the four-equipped-award limit and concurrent same-award recovery.
- Added behavioral tests for authorization, invalid/missing territory and awards, equip/unequip, slot compaction, the four-slot conflict and concurrent placement.

## Compatibility

No API path, permission policy, slot schema or user-visible award order was intentionally changed. Main-inspector pack/grant administration remains in `award-management.js`; sticker delivery remains in `sticker-delivery.js`.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run
