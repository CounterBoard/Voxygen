# App shell styles and static assets

**Status:** current implementation  
**Updated:** 2026-11-26  
**Bootstrap source:** `src/main.jsx`  
**Global styles:** `src/theme/theme-tokens.css`, `src/theme/app-shell.css`  
**Static gem icon:** `src/assets/gem-icon.png`

## Ownership

The Vite entry point, `src/main.jsx`, imports the theme token stylesheet and then the global app-shell stylesheet before importing `App.jsx`. This keeps global CSS outside the React component tree and loads it once for the application.

- `theme-tokens.css` owns semantic theme values and theme-specific design tokens.
- `app-shell.css` owns global layout defaults, application shell styling, shared states, responsive rules and motion preferences.
- `App.jsx` owns React composition and dynamic component behavior; it must not contain a duplicated static `<style>` block.
- `FontsAndTheme` remains responsible only for font preconnect and stylesheet links. It is not the owner of local application CSS.
- `gem-icon.png` is imported as a normal Vite asset and consumed by `GemHex` through the imported URL.

## Invariants

- Keep the stylesheet imports in `src/main.jsx`; do not inject the global stylesheet from a component or append duplicate style tags at runtime.
- Keep `theme-tokens.css` before `app-shell.css` in the entry point.
- Keep the gem icon as a binary asset under `src/assets/`; do not restore a Base64 data URL or a large image literal in `App.jsx`.
- Reference the icon through the module import so Vite can include and fingerprint the resource during production builds.
- Preserve responsive styling and the reduced-motion rules in `app-shell.css`.
- Changes to theme values belong in the token layer, not in duplicated global CSS declarations.

## Regression coverage

`tests/app-shell-assets.test.js` guards the entry-point import order, the static PNG import and its file signature, the absence of an embedded PNG data URL in `App.jsx`, and the separation of global CSS from runtime style tags.

The existing `tests/theme-ui-contract.test.js` also reads `app-shell.css` together with the UI modules when checking theme-related contracts.
