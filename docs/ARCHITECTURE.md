# Voxygen architecture map

**Updated:** 2026-11-26

This document is the entry point for understanding the repository. Feature-level behavior and invariants belong in the corresponding file under `docs/features/`; this page explains where responsibilities live.

## Frontend

| Area | Location | Responsibility |
| --- | --- | --- |
| Application shell and screen composition | `src/App.jsx` | App-wide state, navigation, screen composition, shared UI primitives and cross-feature orchestration |
| World map upload and publication UI | `src/features/world-map/MapUploadPanel.jsx` | Square-image validation, binary upload progress, manifest polling and recoverable publication status |
| World map viewport | `src/features/world-map/VoxMap.jsx` | Pan, pinch and wheel gestures, transform synchronization, visible deep-zoom / URL-grid tile selection, and territory marker rendering |
| Event/calendar feature | `src/features/events/` | Event screens and forms, date/time conversion and calendar controls |
| Territory award rendering and admin manager | `src/features/territory-awards/` | Telegram sticker rendering, award icons, source-pack gallery, award grants and issued-award administration |
| Admin tools | `src/features/admin-tools/` | Read-only D1 health report, orphan/FK counters, JSON export and confirmed-user administration (list/create/edit/delete) |
| Shared frontend utilities | `src/shared/` | Small utilities used by more than one feature |
| API and asset configuration | `src/config/api.js` | Frontend API and map asset base URLs |
| Theme catalogue and visual rules | `shared/theme-catalog.js`, `shared/customization-visuals.js`, `src/theme/` | Theme definitions, visual recipes and CSS tokens |

## Backend and data

| Area | Location | Responsibility |
| --- | --- | --- |
| Cloudflare Worker | `bot/src/worker.js` | HTTP API, Telegram integration, authorization and business rules; world-map upload streaming, GitHub Release storage and publication dispatch |
| Database schema | `bot/schema.sql` | D1 tables and indexes |
| Worker configuration | `bot/wrangler.toml` | Cloudflare deployment configuration |
| Shared world geometry | `shared/world-map-coordinates.js` | Canonical world coordinate bounds and coordinate conversion |

## Tests and documentation

- `tests/` contains API/business-rule tests and frontend contract tests.
- `docs/features/` documents feature boundaries, data flow and behavior that must remain stable.
- `docs/changes/` records implementation changes in chronological order.
- `docs/design-system/` contains design tokens, component rules and QA guidance.

## Safe change workflow

1. Read the relevant feature document and inspect its callers before editing.
2. Keep API payloads, permissions, persistence and UI behavior unchanged unless the task explicitly requires a product change.
3. Add or update focused tests alongside the implementation.
4. Run the full test suite and production build through CI.
5. Update this architecture map when module ownership or dependencies change, and update the feature document and changelog in the same commit.

Feature modules should own cohesive UI/behavior. Shared primitives should be extracted only when there are multiple real consumers; avoid moving app-wide state or backend behavior into a visual component.
