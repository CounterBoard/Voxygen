# Territory detail screen

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/territory-details/TerritoryDetail.jsx`  
**Child features:** `TerritoryScreenshotsPanel.jsx`, `TerritoryFeedbackPanel.jsx`  
**API source:** `bot/src/worker.js` — territory detail, ratings, comments and screenshot routes

## Purpose

The territory detail screen composes the selected territory's cover, score badges, award display, resident list, screenshots, ratings and reviews. It also coordinates detail loading and local overlays such as the resident list, award detail, screenshot lightbox and donation flow.

## Ownership and state flow

- `App.jsx` owns page navigation, the selected territory ID, profile/role state and global notifications. It uses `useTerritories` for the shared summary list, selects `TerritoryDetail` and passes the selected summary record plus callbacks.
- `TerritoryDetail` owns the selected territory's enriched detail state, authenticated detail request, retry/error state, screenshot lightbox selection, resident and award overlays, and local feedback toast. Repeated identical feedback events increment a toast revision, restarting the shared auto-hide timer without leaving stale parent timeouts.
- `TerritoryScreenshotsPanel` owns screenshot upload, compression and deletion behavior. It reports territory updates and opens/closes the parent-owned lightbox through callbacks.
- `TerritoryFeedbackPanel` owns ratings, review creation/moderation and replies. It updates the shared territory detail state through `setTerritory`.
- Shared application primitives and helpers cross the boundary through the explicit `ui` adapter. The feature module does not import `App.jsx`, preventing a reverse dependency and keeping navigation outside the screen.

## Detail loading contract

The screen loads the selected record from `GET /api/territories?detail=:territoryId` using the `X-Telegram-Init-Data` header and `cache: no-store`.

The returned row is normalized before it is merged into the selected summary record. The detail payload includes awards, reviews, screenshots, residents, resident rows and Telegram IDs, managers and manager Telegram IDs, manager count/state, and resident count. Relative screenshot paths are resolved against `API_BASE`; absolute URLs are kept unchanged.

The request is cancelled on cleanup so an old selected territory cannot update the screen after navigation. A retry increments the detail-attempt state and runs the same request again. The last successfully loaded payload is kept in a ref keyed by territory ID so a refreshed summary record does not discard already loaded detail data for the same territory.

## Permission and presentation invariants

- Rating remains available only to users with a verified nickname, and the existing inspector/owner distinction is preserved.
- Government territories continue to hide donation and resident-list actions.
- Main-inspector screenshot deletion and owner screenshot actions remain governed by the existing child-panel rules.
- Award slots keep their existing ordering and modal details.
- Child panels keep their existing API routes, Telegram authentication headers, payloads, confirmations and toast callbacks.
- The root app remains responsible for returning to the previous route, including the existing return-to-events flow.

## Regression coverage

- `tests/territory-detail-ui.test.js` protects the root/feature boundary, detail request, stale-request cancellation, payload shape, role checks and adapter contract.
- `tests/territory-screenshots-ui.test.js` protects screenshot upload/delete behavior and confirms the extracted detail screen owns the lightbox.
- `tests/territory-feedback-ui.test.js` protects rating and review behavior and confirms the extracted detail screen composes the feedback panel.

This is a structural extraction. It does not change Worker routes, authorization, database schema, rating rules, screenshot policy, territory data shape or the screen's intended visual behavior.
