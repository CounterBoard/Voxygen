# D1 diagnostics service extraction — 2026-11-26

## Scope

Moved the read-only D1 report and its SQL identifier quoting helper from `bot/src/worker.js` into `bot/src/features/admin-tools/d1-diagnostics.js`.

The Worker retains `GET /api/admin/diagnostics/d1` route dispatch and passes the existing `requireMainInspector` and `json` helpers to the service. The service has no schema bootstrap dependency and deliberately does not call `ensureWorldTables`.

## Preserved safety and behavior

- Main-inspector authorization remains enforced before any D1 access.
- Missing D1 binding returns the existing 503 response.
- Table counts, territory orphan checks, relation checks, FK checks, data-volume checks, status counts and retained-history reporting remain unchanged.
- Dynamic table/column identifiers remain quoted through `sqlIdentifier`.
- The service issues only read-only `SELECT` / `PRAGMA` statements. It performs no schema creation, migrations, repair, cleanup or other writes.

## Tests and documentation

- Added `tests/d1-diagnostics-service.test.js` for identifier escaping, auth-before-DB, missing binding and read-only SQL behavior.
- Existing `tests/route-auth-matrix.test.js` continues to cover unauthenticated access to the route.
- Updated `docs/features/ADMIN_DIAGNOSTICS.md`, `docs/ARCHITECTURE.md` and section 27.3 of `Functional_System.txt`.
