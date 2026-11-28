# Inspector management in the main inspector

**Status:** current implementation  
**Updated:** 2026-11-28  
**UI source:** `src/features/admin-tools/ManagedInspectorsPanel.jsx`  
**API source:** `bot/src/features/admin-tools/inspectors-service.js` (composed by `bot/src/worker.js`)

## Purpose

The main inspector can add and remove Voxygen inspectors. A new inspector is identified either by Telegram username or by Telegram ID. The panel displays the current inspector list, usernames (when available) and Telegram IDs.

## Request contracts

| Action | Request |
| --- | --- |
| List | `POST /api/inspectors/list`, JSON body `{ initData }`, `cache: no-store` |
| Add by username | `POST /api/inspectors`, JSON body with `initData`, `username` and `telegramId: null` |
| Add by Telegram ID | `POST /api/inspectors`, JSON body with `initData`, `telegramId` as the entered digit string and `username: null` |
| Remove | `DELETE /api/inspectors/:telegramId`, JSON body `{ initData }` |

Input is trimmed. A value containing only digits is sent as `telegramId`; any other non-empty value is sent as `username`. The delete action keeps the confirmation prompt before sending the request.

## UI and feedback ownership

`ManagedInspectorsPanel` owns the list, initial loading state, input value and add-button loading state. The app shell supplies `initData`, the shared `Field` component and existing API error helpers through the `ui` adapter.

Errors and notices are forwarded to the shared `MainInspectorPanel` feedback area. Successful add/remove operations refresh the list through the same list endpoint. The section remains at the top of the main-inspector admin panel, before territory administration.

## Invariants

- Existing endpoint paths, HTTP methods, headers, JSON body fields and no-store behavior remain unchanged.
- Main-inspector authorization, inspector lookup and persistence are owned by `inspectors-service.js`; Worker retains only route dispatch.
- Existing copy, count, username display, Telegram ID display, confirmation text and disabled add-button behavior are retained.

## Regression coverage

`tests/managed-inspectors-ui.test.js` covers module ownership, component placement, request contracts, numeric-vs-username routing, deletion confirmation and shared error/notice integration. `tests/admin-inspector-service.test.js` covers authorization, lookup, account-deletion locks, persistence and removal.
