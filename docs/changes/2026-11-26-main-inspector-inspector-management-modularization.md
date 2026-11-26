# Main inspector management modularization — 2026-11-26

## Scope

Extracted inspector list, add and remove UI from `MainInspectorPanel` into `src/features/admin-tools/ManagedInspectorsPanel.jsx`.

The component now owns the inspector collection, input, initial loading and add-button loading state. It refreshes its list after successful changes and forwards feedback to the parent inspector.

## Contracts preserved

- List remains `POST /api/inspectors/list` with `{ initData }` and `cache: no-store`.
- Add remains `POST /api/inspectors`; digit-only input is sent as `telegramId`, other input as `username`, with the other field set to `null`.
- Remove remains `DELETE /api/inspectors/:telegramId` with `{ initData }` after the existing confirmation.
- Existing messages, displayed username/Telegram ID, list count and add-button disabled state remain unchanged.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/ADMIN_INSPECTOR_MANAGEMENT.md`.
- Updated `docs/ARCHITECTURE.md` to include inspector administration in the admin-tools module.
- Added `tests/managed-inspectors-ui.test.js` for the module boundary and request/UI contracts.
