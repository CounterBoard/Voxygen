# User settings lifecycle extraction — 2026-11-26

## Scope

Moved effective user settings state and the `GET /api/user-settings` refresh lifecycle from `src/App.jsx` into `src/features/settings/useUserSettings.js`.

The hook owns effective theme, map zoom, timezone, readiness/error state, request cancellation/versioning, timeout, periodic refresh, global zoom expiry refresh and the retry trigger. It exposes a shared apply method so profile saves and global settings use the same normalization and viewport-reset path.

## Preserved behavior

- Kept `GET /api/user-settings`, Telegram init data header, `cache: no-store` and the 15-second abort timeout.
- Kept stale-response protection, cancellation on document hide, refresh on return to visible state and 15-second polling.
- Kept the global map-zoom override expiry timer and all timer/listener cleanup.
- Kept theme, timezone and zoom normalization, default values, readiness/error behavior and the guarded map viewport reset.
- Kept profile-save retry behavior and the global settings callback behavior.
- Registered the hook at the original settings-effect location, after profile refresh, preserving startup effect order.

No Worker routes, response payloads, authorization, database schema or UI presentation were intentionally changed.

## Tests and documentation

- Added `tests/user-settings-loading-ui.test.js` for the lifecycle and integration contracts.
- Added `docs/features/USER_SETTINGS.md`.
- Updated `docs/ARCHITECTURE.md`.
