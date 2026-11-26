# Territory award manager modularization — 2026-11-26

## Scope

Extracted the main-inspector Telegram emoji-pack catalog and award-grant interface from `src/App.jsx` into `src/features/territory-awards/MainInspectorAwardManager.jsx`.

## Module ownership

- Loads and refreshes the configured Telegram custom-emoji pack catalog.
- Adds and removes source packs.
- Owns the initially collapsed, accessible nine-column sticker gallery and selection state.
- Grants a selected sticker to an approved territory with its name and date.
- Preserves the existing `voxygen:awards-changed` event and `onTerritoriesChanged` callback after a grant.

The module imports `TelegramSticker` and its icon components directly. Shared API error formatters are passed by the app shell through an explicit `ui` adapter, avoiding a circular dependency.

## Unchanged contracts

- Existing API routes, HTTP methods, headers, request payloads, response handling and main-inspector authorization.
- Sticker thumbnail usage, selection styling, collapsed gallery default, date handling and user-visible messages.
- Worker behavior, D1 tables, Telegram sticker snapshots and rendering in issued-award/public territory views.

## Documentation and tests

- Updated `docs/ARCHITECTURE.md` and `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md`.
- Updated `tests/territory-awards-ui.test.js` so the gallery contracts are asserted against the new module, and added module-boundary/API-flow coverage.
