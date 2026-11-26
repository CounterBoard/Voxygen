# Territory summary data hook extraction — 2026-11-26

## Scope

Moved the territory summary state and refresh lifecycle out of `src/App.jsx` into `src/features/territories/useTerritories.js`.

The hook now owns the summary list, request/queue refs, normalization, partial-data preservation, error/loading/readiness state and identity reset. The root app keeps navigation, selected-territory state and the original active-screen/visibility refresh effect, and passes the hook's refresh callback to existing consumers.

## Preserved behavior

- Kept `GET /api/territories?view=summary`, Telegram authentication and `cache: no-store`.
- Kept both supported response envelopes and the existing row normalization/fallback rules.
- Kept `degradedAreas`-based per-field preservation from the previous row.
- Kept in-flight request coalescing, queued follow-up refresh, hidden-document suppression, visibility refresh and 60-second polling.
- Kept marker readiness on the next animation frame.
- Kept the screen/visibility/60-second scheduling effect in its original location in `App.jsx`, preserving startup effect order; Telegram identity reset still runs through the profile hook callback.

No Worker routes, API payloads, database schema, permissions or screen UI behavior were intentionally changed.

## Tests and documentation

- Added `tests/territories-loading-ui.test.js` for list loading and normalization invariants.
- Updated `tests/profile-loading-ui.test.js` to follow the explicit identity-reset callback.
- Added `docs/features/TERRITORY_DATA.md`, updated the architecture map and clarified the summary/detail ownership split in `docs/features/TERRITORY_DETAILS.md`.
