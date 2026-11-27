# Worker shared response utilities extraction

**Date:** 2026-11-27

## What changed

- Moved the shared `withCors` response wrapper and `json` response helper from `bot/src/worker.js` into `bot/src/shared/responses.js`.
- Kept both exported function names and their behavior unchanged. The Worker imports them under the same local names, so route handlers and injected service dependencies continue using the existing interface.
- Added focused tests for CORS headers, response preservation, removal of internal `details`, HTTP error-code mapping, and explicit application codes.
- Updated `docs/ARCHITECTURE.md` to reflect the new backend shared module.

## Compatibility

This is a structural-only change. It does not change routes, request parsing, authorization, D1 access, Telegram calls, response payloads, or deployment configuration.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
