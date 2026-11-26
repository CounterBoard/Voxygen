# Main inspector user management modularization — 2026-11-26

## Scope

Extracted the confirmed-user administration section from `MainInspectorPanel` into `src/features/admin-tools/ManagedUsersPanel.jsx`.

The new feature module owns:
- initial loading of the confirmed-user list;
- adding a user using Minecraft nickname and Telegram ID;
- editing those values;
- confirmed deletion and refresh of the list;
- loading/saving state and all user-specific form state.

## Contracts preserved

- The list remains `GET /api/admin/users` with `X-Telegram-Init-Data` and `cache: no-store`.
- Create, update and delete remain the same POST routes with the same JSON fields and numeric Telegram ID handling.
- Existing validation, confirmation text, loading labels, success notices, error handling and empty-state text remain in place.
- The panel remains between world-map upload and FAQ editing and forwards errors/notices to the parent inspector so the shared feedback UI is unchanged.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/ADMIN_USER_MANAGEMENT.md`.
- Updated `docs/ARCHITECTURE.md` to describe the expanded admin-tools module.
- Added `tests/managed-users-ui.test.js` for module ownership and the existing request/UI contracts.
