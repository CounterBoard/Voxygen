# Territory summary data lifecycle

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI/data hook:** `src/features/territories/useTerritories.js`  
**API source:** `bot/src/worker.js` — `GET /api/territories?view=summary`

## Purpose and ownership

`useTerritories` owns the frontend's shared territory summary list and its refresh lifecycle. It loads the records used by the city map/list, recruitment screen, profile and territory detail entry point.

`App.jsx` continues to own navigation, the selected territory ID and refresh scheduling. It uses the returned list to select the current territory, triggers `loadTerritories` when the city list becomes active / visible and every 60 seconds while visible, and passes the callback to screens that need to refresh the list after a successful mutation.

The selected territory detail screen has a separate enriched-data request, documented in `TERRITORY_DETAILS.md`. The summary loader must not become the owner of detail-only UI state or detail overlays.

## Request contract

The hook sends `GET /api/territories?view=summary` with `X-Telegram-Init-Data` and `cache: no-store`. It accepts both supported response envelopes:
- a bare array of summary rows;
- an object with a `territories` array.

Failed HTTP or response-envelope validation keeps the last successfully loaded list and exposes a user-facing error. Network errors use the same shared safe-error formatter. A response marked `degraded` is surfaced as a partial-data warning.

## Normalization and partial-data preservation

Every summary row is normalized into the common fields consumed by the frontend: identity/name/owner/coordinates, rating totals, residents/reviews/screenshots, territory marker/banner/awards, owner and manager identifiers, recruitment fields, government status and the current user's rating state.

Coordinates are validated through the shared `finiteCoordinate` helper. Missing map positions use the existing deterministic fallback based on row index. Relative screenshot URLs are resolved against `API_BASE`; absolute URLs are left unchanged.

When the API reports `degradedAreas`, the hook preserves the previous value only for fields owned by those unavailable areas and only when a previous row for the same territory exists. Other fields continue to use the new response. Keep this per-area mapping aligned with Worker response metadata: it prevents partial backend failures from erasing valid client-side data.

## Refresh lifecycle

- A request is skipped while the document is hidden.
- If another refresh is requested while one is in flight, it is coalesced into a queued refresh. The queued request starts after the current request completes, provided the document is visible.
- The root app's existing effect triggers an initial load when the city list is active, refreshes on `visibilitychange`, and polls every 60 seconds while visible.
- Successful normalization updates the list and its previous-value ref, clears or updates the error state, and marks map markers ready on the next animation frame.
- A confirmed Telegram identity change clears the visible list and current error, resets the loaded indicator, then requests data for the new identity.

The hook deliberately keeps the existing request and queue semantics, while the root app keeps the original scheduling effect in its previous position so startup effect ordering remains unchanged. Do not add overlapping parallel requests or clear the previous-value ref as an incidental refactor.

## Dependency boundary

The hook imports `API_BASE` directly and receives the API error formatters and coordinate validator through its `ui` adapter. It does not import `App.jsx` or own screen navigation. The current selected territory remains derived by the root app from `territories` and `selectedId`.

## Regression coverage

`tests/territories-loading-ui.test.js` protects the request/auth/cache contract, normalized summary fields, degraded-area preservation, request coalescing, visibility/polling and marker readiness. `tests/profile-loading-ui.test.js` verifies that a confirmed Telegram identity change is forwarded to the territory hook's reset callback.

This extraction does not change Worker routes, response shape, authorization, persistence, territory ranking or map interaction behavior.
