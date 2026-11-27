# Diagnostics feature folder alignment

**Date:** 2026-11-27

## What changed

- Moved the read-only D1 diagnostics service from `bot/src/features/admin-tools/d1-diagnostics.js` to `bot/src/features/diagnostics/d1-diagnostics.js`, matching the backend feature layout.
- Updated the Worker import and the service tests to use the new path.
- Updated `docs/ARCHITECTURE.md` and its last-updated date.

## Compatibility

No diagnostics logic, route, permission checks, SQL, response payload or read-only guarantee changed. This is a file ownership/path adjustment only.
