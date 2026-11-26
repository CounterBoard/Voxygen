# Global settings panel extraction — 2026-11-26

## Scope

Moved the 14k-character `GlobalSettingsPanel` from `src/App.jsx` into `src/features/settings/GlobalSettingsPanel.jsx`.

The feature module owns its global-settings data, theme/zoom drafts, expiry input, per-theme visibility drafts, request/loading state and local feedback.

## Contracts preserved

- The root still mounts the overlay only when `globalSettingsOpen` is true and the role is `main_inspector`.
- GET/POST requests to `/api/admin/global-settings` and the follow-up GET to `/api/user-settings` keep their existing methods, headers, cache mode and payload shapes.
- Theme visibility username normalization, expiry timezone conversion, temporary/permanent apply, clear actions and all user-facing labels remain unchanged.
- `onSettingsChanged` remains the boundary through which effective settings update root app state.
- No Worker route, authorization, database schema or persistence behavior changed.

## Documentation and tests

- Added `docs/features/GLOBAL_SETTINGS.md`.
- Updated `docs/ARCHITECTURE.md` with the settings feature boundary.
- Added `tests/global-settings-ui.test.js` for mounting, API and state contracts.
