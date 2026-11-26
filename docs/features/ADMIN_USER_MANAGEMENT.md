# Main inspector user administration

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/admin-tools/ManagedUsersPanel.jsx`  
**API source:** `bot/src/worker.js` — `/api/admin/users` routes

## Purpose

The main inspector can maintain the list of confirmed Voxygen users. The panel supports listing users, adding a user by Minecraft nickname and Telegram ID, editing those values, and removing a user from the list.

## Request contracts

| Action | Request |
| --- | --- |
| List | `GET /api/admin/users`, `X-Telegram-Init-Data` header and `cache: no-store` |
| Add | `POST /api/admin/users`, JSON body with `initData`, `mcNickname` and numeric `telegramId` |
| Edit | `POST /api/admin/users/update/:id`, JSON body with `initData`, `mcNickname` and numeric `telegramId` |
| Delete | `POST /api/admin/users/delete/:id`, JSON body with `initData` |

IDs in update and delete paths are URI-encoded. The panel keeps the existing client-side validation: nickname is required; a newly added Telegram ID must be a positive safe integer; both edit fields must be non-empty.

## UI and feedback ownership

`ManagedUsersPanel` owns the list, loading and saving flags, create form and edit state. The app shell supplies `initData`, the shared `Field` and `MinecraftText` renderers, and the existing API error helpers through the `ui` adapter.

Errors and success notices are forwarded to the same `MainInspectorPanel` feedback state as the neighboring admin tools. The initial list load runs when Telegram init data becomes available. Delete still requires the existing browser confirmation, and a deleted row exits edit mode.

## Invariants

- The component only calls the existing admin user endpoints; no Worker route, schema, authorization or persistence behavior is changed by this extraction.
- The panel stays in its original position between world-map upload and the FAQ editor.
- The empty state, usernames, Minecraft nickname, Telegram ID, validation messages, operation labels and success/error feedback are retained.

## Regression coverage

`tests/managed-users-ui.test.js` checks the module boundary, placement, list/create/edit/delete request contracts, validation, confirmation and shared feedback wiring.
