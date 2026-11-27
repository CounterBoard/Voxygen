# Worker Telegram Web App authentication extraction

**Date:** 2026-11-27

## What changed

- Moved `verifyInitData` and `getCurrentUser` from `bot/src/worker.js` into `bot/src/auth/telegram.js`.
- Worker imports both helpers under the same names. Its existing permission checks, route handlers and exported `verifyInitData` test hook remain compatible.
- Added tests using signed Telegram initData fixtures for HMAC verification, payload tampering, auth-date freshness, and all three existing request input locations (JSON body, header and query string).
- Updated `docs/ARCHITECTURE.md`.

## Responsibility boundary

This module verifies the Telegram Web App signature and extracts the user identity. Role lookup, inspector permissions, territory permissions and database-backed authorization remain in the Worker for a separate extraction.

## Compatibility

No signature algorithm, validity window, credential precedence, request format, route, response or database behavior was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
