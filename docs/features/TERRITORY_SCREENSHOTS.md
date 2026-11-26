# Territory screenshot gallery

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/territory-details/TerritoryScreenshotsPanel.jsx`  
**API source:** `bot/src/worker.js` — `/api/screenshots` routes

## Purpose

The territory detail page uses a dedicated panel for approved screenshot thumbnails, opening screenshots in the page lightbox, adding new screenshots and deleting screenshots when permitted.

## Request contracts

| Action | Request |
| --- | --- |
| Upload | `POST /api/screenshots` multipart form data: `territoryId`, compressed `photo`, `initData`; `X-Telegram-Init-Data` header |
| Delete | `DELETE /api/screenshots/:id`, JSON body `{ initData }` |

Before upload, the selected image is scaled so its largest edge is at most 1280px and converted to JPEG at quality 0.70. The upload result message remains different for government territories and regular territories.

## Permissions and ownership

- Any verified-nickname user can add a screenshot when they are not the territory owner, or when the territory is a government territory.
- The main inspector can delete any screenshot.
- The territory owner/manager can delete screenshots only for non-government territories.
- The app shell still owns the Lightbox component; the panel notifies it when a screenshot is opened and closes it after a successful delete.

The parent screen remains the source of truth for screenshot records. The panel receives the approved list and uses the existing territory state setter to remove a successfully deleted row.

## Invariants

- Upload compression dimensions, JPEG quality, filename normalization, form-data names and Telegram header remain unchanged.
- Upload success/error messages and deletion permissions remain unchanged.
- The upload flow does not optimistically add a screenshot to the visible list.
- No API routes, Worker logic, authorization, database schema or persistence behavior changed.

## Regression coverage

`tests/territory-screenshots-ui.test.js` covers the module boundary, request methods/headers/body, image compression settings, upload permissions, delete permissions and parent-owned lightbox/state callbacks.
