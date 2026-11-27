# Territory resident membership service extraction

**Date:** 2026-11-27

## What changed

- Moved resident invitation creation, Telegram delivery and delivery-claim handling into `bot/src/features/territories/membership-service.js`.
- Moved the territory management read handler, invitation cancellation, resident removal and voluntary leave handlers into the same service.
- Moved Telegram resident-invite callback processing, pending nickname binding/notification and scheduled retry scanning into the service.
- Added `createTerritoryMembershipService()` with explicit dependencies for authentication, D1 initialization, authorization, Telegram/JSON helpers, manager lookup, skin URLs and cross-feature cleanup.
- Kept the shared `getTerritoryManagerRows` and `hideRecruitmentIfContactLost` helpers in Worker because they are also used by unrelated treasury, account and territory workflows.
- Kept manager promotion/demotion initiation in Worker. Approved role transitions and voting/finalization remain in the existing manager-change services.
- Kept HTTP route dispatch in Worker, Telegram webhook composition in Worker and scheduled pending-invite delivery dispatch in Worker.
- Added focused behavioral tests in `tests/territory-membership-service.test.js`.
- Updated `docs/ARCHITECTURE.md`, `docs/features/TERRITORY_MANAGEMENT.md` and `Functional_System.txt`.

## Compatibility

No public HTTP path, request/response payload, Telegram callback payload, account-deletion lock, permission rule, D1 schema, invitation status, notification claim policy, role-transition policy or scheduled retry limit is intentionally changed.

Invitation delivery still claims each pending invite before sending, records `notification_sent_at` only after a successful Telegram response, and leaves failed delivery claims to expire after the existing five-minute lease. Accepting an invite still initializes the first territory marker and evaluates achievements. Removing/leaving a territory still triggers manager notifications, recruitment-contact cleanup, visual-equipment reconciliation and achievement evaluation.

## Scope intentionally left in Worker

- Shared manager lookup and territory notification helpers.
- Recruitment-contact cleanup, because it is used by identity changes, owner changes, manager changes and resident workflows.
- Manager promotion/demotion initiation, including eligible-voter counting and creation of pending requests.
- HTTP route matching, Telegram webhook wiring and scheduled event/vote/invite orchestration.

## Validation

- Focused behavioral tests: `tests/territory-membership-service.test.js`.
- CI validation: `npm test`, `npm run build`, `node --check bot/src/worker.js` and Wrangler Worker dry-run.
- Production/manual verification is still required for Telegram delivery, invite callbacks, D1 membership updates and the scheduled retry path.
