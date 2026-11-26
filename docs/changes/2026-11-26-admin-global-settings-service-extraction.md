# Admin global settings service extraction — 2026-11-26

## Scope

Moved `getAdminGlobalSettings` and `saveAdminGlobalSetting` from `bot/src/worker.js` into `bot/src/features/admin-tools/global-settings.js`.

The shared `GLOBAL_SETTING_KEYS` Set is exported by the service and imported by the Worker so `readGlobalSettingOverrides` and the admin handlers continue to share the same allowed keys.

## Preserved behavior

- Same GET/POST routes and main-inspector authorization before D1 initialization/access.
- Same `theme` and `map_zoom` keys, theme catalogue validation and 1–100 map zoom range.
- Same theme access username normalization, visibility behavior and audit metadata.
- Same permanent, explicit expiry and duration semantics (up to 10 years), including clearing one or both override keys.
- Same D1 queries, upsert/delete batches and post-save refresh response.
- `ensureGlobalSettingsTable` including DDL and WeakMap cache remains in Worker.
- `readGlobalSettingOverrides` remains in Worker for use by personal `GET /api/user-settings`.

No table creation, migration, schema, route path, authorization rule or settings response contract was moved or intentionally changed.

## Tests and documentation

- Added `tests/admin-global-settings-service.test.js` for key allowlist, auth-before-DB, GET normalization, theme access, upsert and clear operations, expiry/duration, zoom bounds and unsupported themes.
- Existing route-auth tests continue to protect both admin global-settings methods.
- Added `docs/features/ADMIN_GLOBAL_SETTINGS.md`.
- Updated `docs/ARCHITECTURE.md` and section 12.3 of `Functional_System.txt`.

## CI findings

The initial unit-test run exposed an incorrect relative import depth for the shared theme and map-zoom modules. The paths were corrected from the new `bot/src/features/admin-tools` directory to the repository-root `shared/` directory. The failing tests were module-load failures before handler execution; the implementation logic was unchanged. The full test, app build, Worker syntax and Wrangler dry-run suite must pass on the corrected commit before merge.
