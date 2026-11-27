# Territory manager change service extraction

**Date:** 2026-11-27

## What changed

- Moved applyManagerChange(env, { territoryId, targetId, action, initiatorId }) from bot/src/worker.js into bot/src/features/territories/manager-change-service.js.
- Added createManagerChangeService with injected Telegram delivery, HTML escaping, recruitment-contact cleanup, manager notifications and achievement evaluation.
- Kept the Worker export of applyManagerChange and all existing callers/route payloads unchanged.
- Preserved guarded promotion and demotion D1 batches, verified-account/nickname checks, owner handoff, idempotent retries and post-write state verification.
- Kept vote creation, vote recording, finalization leases, stale-lease recovery and callback/request handlers in Worker.
- Added behavioral tests for invalid requests, idempotent promotion, guarded promotion, membership checks, demotion side effects, owner handoff and concurrent state changes. Updated source-structure tests to read the new module.

## Compatibility

No route, request/response contract, permission rule, D1 schema, vote policy, lease policy, notification text or membership/manager persistence contract is intentionally changed. applyManagerChange remains exported from Worker.

## Validation

- npm test
- npm run build
- node --check bot/src/worker.js
- Wrangler Worker dry-run
