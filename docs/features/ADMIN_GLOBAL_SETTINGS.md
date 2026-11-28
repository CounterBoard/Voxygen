# Administrative global settings service

**Status:** current implementation  
**Updated:** 2026-11-28  
**Backend service:** `bot/src/features/admin-tools/global-settings.js`  
**HTTP routes:** `bot/src/worker.js` — `GET/POST /api/admin/global-settings`  
**D1 tables:** `global_setting_overrides`, `theme_access_settings`

## Purpose and access

The service implements the main-inspector-only global settings API. It returns active and expired overrides, exposes per-theme access rules, and saves or clears theme and map-zoom overrides.

Both route handlers call the injected `requireMainInspector` before table initialization or D1 access. The route-auth matrix independently protects both GET and POST methods.

Supported override keys are intentionally limited to:
- `theme` — a theme ID from the shared theme catalogue;
- `map_zoom` — an integer percentage from 1 through 100, normalized through the shared map-zoom helper.

Theme access metadata is saved separately from active overrides. Usernames are stripped of leading `@`, trimmed, lower-cased, filtered to Telegram username characters and length, deduplicated, and capped at 200 entries. Visibility is either `private` or `public`.

## Override lifecycle

A global override can be permanent, have an explicit expiry timestamp, or use a duration in minutes. Explicit timestamps must be in the future and no more than 10 years ahead. Duration is limited to 1 minute through 10 years. Clearing can remove one supported key or both keys.

GET responses keep the current contract:
- normalized `settings` entries with `key`, `value`, `expiresAt`, `active`, `updatedAt` and `updatedBy`;
- a `themeAccess` object with visibility, normalized usernames and audit metadata.

Save handlers continue to refresh and return the complete current GET response after a successful write.

## D1 ownership and migration boundary

`ensureGlobalSettingsTable` deliberately remains in `bot/src/worker.js`. It owns the existing WeakMap initialization cache and the two `CREATE TABLE IF NOT EXISTS` statements for `global_setting_overrides` and `theme_access_settings`.

`readGlobalSettingOverrides` is owned by `bot/src/features/settings/service.js`, alongside the personal GET/POST handlers. Both settings services share the exported `GLOBAL_SETTING_KEYS` Set, keeping the allowed key list in one place.

The service contains only request handlers and DML queries. It does not define, create, alter or migrate tables.

## Dependency boundary

The Worker injects:
- `requireMainInspector` for the existing server-side authorization;
- `ensureGlobalSettingsTable` for table readiness;
- `json` for the existing response contract.

Theme and zoom normalization are imported from the canonical shared modules. The service does not import `worker.js` and does not own route dispatch or user preference table migrations.

## Regression coverage

`tests/admin-global-settings-service.test.js` protects the allowed keys, authorization-before-DB behavior, GET response normalization, theme visibility metadata, username normalization, successful override upserts, clearing behavior, date/duration boundaries, zoom range and unsupported theme rejection. `tests/route-auth-matrix.test.js` continues to cover unauthenticated GET and POST access.
