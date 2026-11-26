# Territory award management service extraction — 2026-11-26

## Scope

Moved the main-inspector award catalog and grant/delete handlers from `bot/src/worker.js` into `bot/src/features/territory-awards/award-management.js`:
- issued-award and source-pack listing;
- Telegram custom-emoji pack import and removal;
- award grant with copied Telegram metadata and manager notification;
- issued-award deletion and equipment-slot compaction.

The Worker continues to own route dispatch and passes existing authorization, JSON, D1 initialization, Telegram, notification, formatting and sticker-validation helpers into the service. User-facing award placement remains in the Worker because it is a territory-manager action tied to territory customization.

## Preserved behavior

- Kept all existing HTTP paths, methods, request/response payloads and authorization policy.
- Kept the Telegram pack URL and sticker-type validation, duplicate detection and 500-sticker limit.
- Kept D1 inserts/batches, rollback cleanup on partial pack import failure, issued-award metadata snapshots and unique-name conflict handling.
- Kept manager notifications and equipment-slot compaction after award deletion.
- Did not change D1 schema, idempotent initialization or the public `GET /api/telegram-sticker` delivery service.

## Regression coverage

- Added `tests/territory-award-management-service.test.js` for authorization ordering, pack validation/duplicate handling, grant snapshot persistence, notifications and deletion slot compaction.
- Updated `tests/territory-awards.test.js` to assert grant behavior in the new service module.
- Extended `tests/route-auth-matrix.test.js` to cover all main-inspector award routes and territory award placement.

## Documentation

- Updated `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md`.
- Updated `docs/ARCHITECTURE.md`.
- Updated the current backend source map in `Functional_System.txt`.

No route contract, permission, schema or user-visible presentation change is intended.
