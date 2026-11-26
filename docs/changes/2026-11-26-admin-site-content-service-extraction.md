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

- Added `tests/admin-site-content-service.test.js` for default fallback, authorization order, validation, successful FAQ and home-button writes, normalization, hidden-content redaction and route dependency wiring.
- Added `GET /api/home-feature-button` to `tests/route-auth-matrix.test.js`.
- Added `docs/features/ADMIN_SITE_CONTENT.md`.
- Updated `docs/ARCHITECTURE.md` and `Functional_System.txt`.

## CI findings

The first CI run exposed a malformed boundary in the adjacent founder-claim handler after the content block was removed. The handler's original success path was restored verbatim before continuing; the issue was unrelated to FAQ or home-button behavior. The full Worker syntax check and unit suite must pass on the corrected commit before merge.
