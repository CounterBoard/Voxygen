# Customization city appearance service extraction

**Date:** 2026-11-27

## What changed

- Moved the authenticated `GET /api/customization/city` and `POST /api/customization/city` handlers out of `bot/src/worker.js` into `bot/src/features/customization/city-appearance-service.js`.
- Added `createCityAppearanceService` with injected user authorization, world-schema initialization, territory-manager checks, visual-tag matching, manager rows and JSON response creation.
- Kept the Worker route paths and handler signatures intact.
- Preserved territory/manager authorization, government-territory restrictions, marker eligibility and inventory ownership checks, banner color/gradient allowlists, optional recruitment lookup behavior and award ordering.
- Added behavioral tests for read permissions, marker inventory aggregation, award ordering, recruitment fallback, marker validation, banner validation, marker clearing and successful upserts.

## Compatibility

No endpoint, request/response field, permission rule, marker selection rule, banner option, database schema or `city_customization` persistence contract was intentionally changed. Cross-feature marker reconciliation and territory-award placement remain outside this service.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run
