# Global settings overlay

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/settings/GlobalSettingsPanel.jsx`  
**API source:** `bot/src/worker.js` — `/api/admin/global-settings` and `/api/user-settings`

## Purpose

The main inspector can temporarily or permanently override the app-wide theme and map zoom, remove existing overrides, and control which users can access each active theme.

The panel is mounted from the root app only while the global-settings overlay is open and the current role is `main_inspector`.

## Request contracts

| Action | Request |
| --- | --- |
| Load admin values | `GET /api/admin/global-settings` with `X-Telegram-Init-Data` and `cache: no-store` |
| Apply theme or map zoom | `POST /api/admin/global-settings` with `{ initData, settings: { [key]: value }, permanent` or `expiresAt }` |
| Change theme access | `POST /api/admin/global-settings` with `{ initData, themeAccess: { themeId, visibility, usernames } }` |
| Clear an override | `POST /api/admin/global-settings` with `{ initData, clear: true, key }` |
| Refresh effective viewer settings | `GET /api/user-settings` with `X-Telegram-Init-Data` and `cache: no-store` |

Theme access usernames are normalized by trimming whitespace, removing leading `@`, converting to lowercase and splitting the comma/newline/semicolon input. Theme visibility remains either `public` or `private`.

A temporary override requires a valid future expiry timestamp in the profile timezone. A permanent override sends `permanent: true` and omits `expiresAt`.

## Ownership and state flow

`GlobalSettingsPanel` owns its loaded settings, selected draft theme/map zoom, expiry input, per-theme access drafts, loading/saving states and local success/error feedback.

The root app supplies Telegram init data, timezone offset and shared UI/error primitives through the `ui` adapter. When an apply/clear/access operation changes effective user settings, the panel calls `onSettingsChanged`; the root remains responsible for updating the live app theme, map zoom and timezone. The root also remains responsible for opening and closing the overlay.

## Invariants

- Only the main inspector can mount the overlay; this gate remains in the root app.
- API methods, URLs, headers, payload shapes, expiry calculations and theme-access normalization are unchanged.
- The existing overlay close animation, controls, labels, status text, retry state and modal layout remain unchanged.
- This extraction does not change Worker authorization, D1 settings persistence or theme catalog definitions.

## Regression coverage

`tests/global-settings-ui.test.js` checks component ownership/mounting, API methods and payloads, access normalization, expiry handling and the root callback boundary.
