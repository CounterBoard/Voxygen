# Event database initialization extraction

**Date:** 2026-11-27

## What changed

- Moved `initializeEventsTables` and the cached `ensureEventsTables` wrapper from `bot/src/worker.js` into `bot/src/db/initialization.js`.
- Event initialization continues to call `ensureWorldTables` first; only after the world schema promise resolves does it create/upgrade events, reminders, create-request idempotency and bank transaction tables.
- Preserved the dedicated per-environment promise cache, concurrent request sharing and cache reset after a failed initialization.
- Removed the now-redundant Worker-level event table cache.
- Added tests for initialization ordering, single execution under concurrent callers and retry after a failed event-table statement.
- Updated deletion-lock source contract tests to include the database initialization module and kept webhook slicing scoped to Worker handlers.
- Updated `docs/ARCHITECTURE.md`.

## Compatibility

No DDL, trigger, index, column migration, event endpoint, scheduled reminder or Telegram webhook behavior was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
