# Territory detail screen extraction — 2026-11-26

## Scope

Moved the selected territory detail screen from `src/App.jsx` into `src/features/territory-details/TerritoryDetail.jsx`.

The root app continues to own route selection, the selected territory ID, profile and role state, summary-list refreshes and global notifications. The extracted feature owns the selected territory's enriched detail request and its local screen composition/overlays.

## Preserved behavior

- Kept the authenticated `GET /api/territories?detail=:territoryId` request, `cache: no-store`, payload normalization and relative screenshot URL handling.
- Kept cancellation of stale detail requests and retry behavior.
- Kept owner/inspector/government role checks and all existing callbacks.
- Kept screenshot and feedback child panels, their adapter props, and the parent-owned lightbox.
- Kept the existing donation, residents and award overlays.

Shared app primitives are injected through an explicit `ui` adapter instead of importing the root module. No Worker, API, database, permission or visual design change was intended.

## Tests and documentation

- Added `tests/territory-detail-ui.test.js` for the extracted screen boundary and invariants.
- Updated screenshot and feedback contract tests to follow the new composition boundary.
- Added `docs/features/TERRITORY_DETAILS.md` and updated `docs/ARCHITECTURE.md`.
