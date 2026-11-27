# Event backend service extraction

**Date:** 2026-11-27

## What changed

- Moved event HTTP handlers, body validation, event date/price helpers, new-event notifications, reminder persistence and scheduled reminder delivery from `bot/src/worker.js` into `bot/src/features/events/service.js`.
- Added `createEventsService` with explicit dependencies for auth, D1 initialization, Telegram API and formatting utilities.
- Worker creates the service once and keeps the same handler names for its routes and scheduled lifecycle.
- Updated account-deletion-lock source checks to inspect the event service while retaining manager/invitation checks against the Worker.
- Added backend event tests for calendar month behavior, date/time validation, discount bounds and atomic expiry cleanup.
- Updated `docs/ARCHITECTURE.md`.

## Compatibility and invariants

No event endpoint, HTTP method, authorization condition, schema/table, payload, idempotency key behavior, reminder retry/claim behavior or scheduled cron ordering was intentionally changed. Reminder delivery and expiry cleanup are still called from the same Worker `scheduled()` lifecycle.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
