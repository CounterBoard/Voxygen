# Customization achievement service extraction

**Date:** 2026-11-27

## What changed

- Moved achievement requirement parsing/validation, territory achievement evaluation, distinct territory visual counting and the main-inspector recheck endpoint into `bot/src/features/customization/achievements.js`.
- Added `createAchievementService` with injected territory score calculation, first-marker setup, founder notification, main-inspector authorization, world-table initialization, escaping and JSON response dependencies.
- Kept the customization create/edit API validation behavior by importing `achievementPayload` and `achievementRequirementError` into Worker from the new module.
- Preserved the `POST /api/achievements/recheck` route, per-territory error isolation, multi-pass chained reward evaluation, idempotent `city_items`/`achievement_awards` inserts and best-effort notifications.
- Added tests for requirement validation, founder gating, chained unlock passes, missing-inventory repair, recheck authorization/aggregation and notification failures.
- Updated customization and architecture documentation.

## Compatibility

No API route, payload field, requirement bound, achievement threshold, D1 schema, grant source, owner notification template or territory score calculation was intentionally changed.

## Scope intentionally left unchanged

Customization catalog routes, visual purchase/payment logic, discount operations, territory equipment rules and the score calculation itself remain in Worker or their existing modules.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run