# Remaining database initializer extraction

**Date:** 2026-11-27

## What changed

Moved the remaining database bootstrap helpers out of `bot/src/worker.js` and into `bot/src/db/initialization.js`:

- User preferences and territory notification preferences, including additive column migrations and deletion-lock triggers.
- Global theme-access and global-setting override tables.
- Manager-change requests/votes and account-deletion locks, including the `finalizing_at` compatibility migration and triggers.
- Territory approval sessions, including duplicate-session cleanup and the unique inspector-chat index.
- User directory table and its legacy `hidden` column migration.

The Worker receives the helpers from one database initializer instance and continues using the same names at existing callsites. The world migration now obtains manager-change and user-directory helpers from the DB initializer; only customization-category cleanup remains injected from the Worker.

## Cache semantics preserved

- User preferences and global settings retain their per-environment WeakMap promise caches and retry-after-failure behavior.
- Manager-change, approval-session and user-directory setup remain intentionally uncached. Approval-session duplicate cleanup continues to run on every call.
- Existing world, recruitment, map settings and event caches remain separate.

## Compatibility

No endpoint, permission rule, SQL condition, table definition or response contract was intentionally changed. Notification delivery and global override reading remain in the Worker.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
