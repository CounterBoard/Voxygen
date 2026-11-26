# Main inspector diagnostics panels modularization — 2026-11-26

## Scope

Separated two independent main-inspector tools from `MainInspectorPanel`:

- `src/features/admin-tools/D1DiagnosticsPanel.jsx` now owns the read-only D1 report, summary counters, JSON inspection and clipboard/manual-export fallback.
- `src/features/territory-awards/IssuedAwardsPanel.jsx` now owns the issued-awards list, event-driven refresh, confirmation and deletion UI.

## Contracts preserved

- D1 diagnostics remains a GET request with the same Telegram init-data header, no-store behavior and `readOnly === true` response guard.
- The issued-awards panel keeps the same `GET /api/admin/awards?view=issued` and `DELETE /api/admin/awards/:id` calls, confirmation prompt, loading/error feedback and `voxygen:awards-changed` refresh event.
- Successful deletion still invokes `onTerritoriesChanged`; award date formatting remains shared with the public award-details modal through the UI adapter.
- No Worker route, SQL, D1 schema, authorization or public award-rendering behavior changed.

## Documentation and tests

- Added `docs/features/ADMIN_DIAGNOSTICS.md`.
- Updated `docs/ARCHITECTURE.md` and `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md`.
- Added read-only and export regression coverage in `tests/admin-diagnostics-ui.test.js`.
- Updated `tests/territory-awards-ui.test.js` to assert the issued-awards module boundary and preserved refresh/delete contract.
