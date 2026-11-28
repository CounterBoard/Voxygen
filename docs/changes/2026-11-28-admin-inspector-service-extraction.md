# Inspector management service extraction

**Date:** 2026-11-28

## Scope

Moved the three main-inspector inspector-management handlers from `bot/src/worker.js` into `bot/src/features/admin-tools/inspectors-service.js`:

- list current inspectors;
- add an inspector by Telegram ID or resolve an existing Telegram username;
- remove an inspector by Telegram ID.

The Worker composes the service with its existing authorization, world-table initialization and JSON response dependencies. HTTP route declarations remain in the Worker.

## Compatibility and invariants

- No route paths, methods, request fields, response shapes or status codes changed.
- Main-inspector authorization remains first in each operation.
- Username lookup still resolves only users already present in `users`.
- The configured main inspector cannot be added as an ordinary inspector.
- Account-deletion lock checks and the conditional insert guard remain in place.
- Inspector ordering and the existing deletion behavior are unchanged.
- No schema, frontend, finance, territory ownership or account-transfer logic changed.

## Verification

Focused service tests cover authorization, list shape/order, username resolution, invalid input, main-inspector protection, deletion locks, and removal. Full CI is required before merge.
