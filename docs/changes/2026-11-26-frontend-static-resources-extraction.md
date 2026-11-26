# Frontend static resources extraction — 2026-11-26

## Scope

Moved two static resources out of `src/App.jsx`:

- The global CSS previously rendered from `FontsAndTheme` is now `src/theme/app-shell.css`, imported from `src/main.jsx` after `theme-tokens.css`.
- The embedded gem PNG is now `src/assets/gem-icon.png`, imported by `App.jsx` and rendered by `GemHex`.

## Contracts preserved

- CSS rules, selector order, media queries and declarations were moved without intentional edits.
- Google Fonts preconnect and stylesheet URLs remain in `FontsAndTheme`.
- `GemHex` keeps its existing 18px dimensions, object fit, alignment and decorative accessibility attributes.
- No runtime state, API request, backend, database or persistence behavior changed.

## Documentation and tests

- Added `docs/features/FRONTEND_STATIC_ASSETS.md`.
- Updated `docs/ARCHITECTURE.md` with stylesheet and static asset ownership.
- Added `tests/frontend-static-assets.test.js` to validate imports, source boundaries and the extracted PNG.
