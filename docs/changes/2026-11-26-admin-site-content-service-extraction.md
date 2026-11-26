# Admin site content service extraction — 2026-11-26

## Scope

Moved FAQ and home feature button backend handlers, their defaults and home button normalization from `bot/src/worker.js` into `bot/src/features/admin-tools/site-content.js`.

The Worker retains route dispatch and injects its existing `json`, `requireMainInspector`, `requireUser`, `getRoleByTelegramId`, `ensureMapSettingsTable` and `ensureWorldTables` functions.

## Preserved behavior

- Public `GET /api/faq` and main-inspector-only `POST /api/faq`.
- Authenticated-user `GET /api/home-feature-button`, including redaction of hidden content for non-main-inspectors.
- Main-inspector-only `POST /api/home-feature-button`.
- Existing `app_settings` keys, defaults, legacy FAQ fallback, field limits, data-image types and size limit.
- Existing D1 initialization order, including `ensureWorldTables` for the home-button GET path.
- No schema/table definitions, migration helpers, authorization rules or API response shapes were moved or intentionally changed.

## Tests and documentation

- Added `tests/admin-site-content-service.test.js` for default fallback, authorization order, validation, normalization, hidden-content redaction and route dependency wiring.
- Added `GET /api/home-feature-button` to `tests/route-auth-matrix.test.js`.
- Added `docs/features/ADMIN_SITE_CONTENT.md`.
- Updated `docs/ARCHITECTURE.md` and `Functional_System.txt`.
