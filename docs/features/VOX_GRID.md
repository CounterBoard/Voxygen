# Vox grid

**Status:** current implementation  
**Updated:** 2026-11-28  
**API source:** `bot/src/features/vox-grid/service.js` (composed by `bot/src/worker.js`)  
**UI source:** `src/` (Vox grid panel and its API client)

## Purpose

The Vox grid is a shared 8 × 9 board. All users can read the board. Only the configured main inspector can change individual cells or reset the board.

## API contract

| Method and path | Behavior |
| --- | --- |
| `GET /api/vox-grid` | Returns `{ ok, cells, canEdit }`; cells are ordered row-major and each cell contains `row`, `col`, and `state` |
| `POST /api/vox-grid` | Main-inspector-only upsert of one cell; accepts `row`, `col`, and `state` |
| `POST /api/vox-grid/reset` | Main-inspector-only reset of all cell states |

The board dimensions remain 8 rows by 9 columns. Valid row indices are 0–7 and column indices are 0–8. The only persisted marked state is `?`; all other submitted state values normalize to an empty string. Reads normalize unknown persisted states to empty as well.

## Persistence and authorization

The service uses the existing `vox_grid` table initialized by `ensureWorldTables`. Cell writes use the existing composite-key upsert and record the acting main inspector and update timestamp. Reset clears every row's state and records the same audit fields.

The read endpoint intentionally loads the board before checking the optional user's role, so the grid remains readable without authentication. `canEdit` is true only when the authenticated user's resolved role is `main_inspector`. Mutation endpoints authorize before initializing tables or touching D1.

## Regression coverage

`tests/vox-grid-service.test.js` covers the 72-cell shape, persisted-state normalization, public read behavior, edit capability, authorization order, reset, coordinate validation and upsert fields.
