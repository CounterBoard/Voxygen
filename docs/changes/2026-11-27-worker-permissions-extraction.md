# Worker authorization and permission extraction

**Date:** 2026-11-27

## What changed

- Moved role resolution and the `requireUser`, `requireVerifiedUser`, `requireMainInspector`, `isInspector` and `isTerritoryManager` checks into `bot/src/auth/permissions.js`.
- Added a small `createPermissions` composition function. The Worker injects Telegram identity lookup, safe JSON responses and D1 schema initialization; the returned authorization functions keep their original call signatures.
- Kept the Worker export of `isTerritoryManager` intact for existing tests and consumers.
- Added focused permission tests; existing route-auth matrix and territory RBAC tests continue to exercise route integration and manager checks.
- Updated `docs/ARCHITECTURE.md`.

## Responsibility boundary

Telegram signature verification remains in `auth/telegram.js`. This module decides what an authenticated user may do; it does not verify Telegram signatures or dispatch HTTP routes.

## Compatibility

No route, role naming, main-inspector matching rule, SQL authorization condition, response body or status was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
