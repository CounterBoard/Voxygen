# Worker database initialization extraction

**Date:** 2026-11-27

## What changed

- Moved the environment-scoped lazy initializer for `recruitment` and its `2026-10-v25` schema migration into `bot/src/db/initialization.js`.
- Moved the independently cached `app_settings` table initializer into the same database initialization module.
- Worker creates these helpers once through `createDatabaseInitialization()` and keeps injecting/calling them under the existing names.
- Preserved separate per-environment WeakMap caches, in-flight promise reuse and cache deletion after a failed initialization.
- Added focused tests for version skip, migration steps, concurrent calls and retry-after-failure behavior.
- Updated `docs/ARCHITECTURE.md`.

## Scope intentionally left in place

The main world schema migration, user preferences, events, manager-change tables, approval sessions, global settings and user directory initialization are not changed by this extraction. Their lazy initialization order and DDL remain in the Worker until separate dependency-focused steps.

## Compatibility

No request/response, route, authorization or table definition was intentionally changed. Recruitment's foreign key still relies on the existing `territories` table being present as before; this change does not add a new initialization dependency or reorder calls.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
