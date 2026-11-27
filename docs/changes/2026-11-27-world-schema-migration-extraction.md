# World schema migration extraction

**Date:** 2026-11-27

## What changed

- Moved the complete `2026-11-v41` world schema migration from `bot/src/worker.js` to `bot/src/db/migrations/world-schema.js`.
- Moved its environment-scoped `ensureWorldTables` promise cache into `bot/src/db/initialization.js`.
- The initializer injects the three Worker-owned steps used by the migration: manager-change table/trigger setup, customization-category cleanup, and user-directory table setup.
- The migration keeps its original DDL order, `PRAGMA` checks, duplicate-column handling, trigger creation and final schema-version write.
- Added tests for current-version short-circuit, per-environment concurrent cache reuse, dependent-step ordering and retry after a rejected initialization.
- Updated `docs/ARCHITECTURE.md`.

## Compatibility boundary

No schema version, SQL statement, data cleanup operation, route or endpoint behavior is intentionally changed. World migration dependencies remain in the Worker and are passed as explicit functions; this avoids circular imports and preserves their current implementation.

## Other schema setup still in Worker

User preferences, global settings, manager-change setup, recruitment-independent approval sessions, events and user-directory implementation remain staged for separate extraction.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
