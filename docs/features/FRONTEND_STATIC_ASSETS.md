# Frontend static assets and global shell styles

**Status:** current implementation  
**Updated:** 2026-11-26

## Ownership

| Resource | Location | Consumer / purpose |
| --- | --- | --- |
| Global application stylesheet | `src/theme/app-shell.css` | Global layout, shared controls, component states, overlays, motion and responsive rules |
| Theme tokens | `src/theme/theme-tokens.css` | Theme-specific CSS custom properties |
| Gem icon | `src/assets/gem-icon.png` | Small shared gem image rendered by the `GemHex` component |

The app shell stylesheet is imported by `src/main.jsx` after the theme token stylesheet. It contains the static CSS that was previously emitted by the `FontsAndTheme` React component. The component retains the Google Fonts preconnect and stylesheet links; font loading therefore remains part of the rendered app shell.

## Asset handling

Static image files belong in `src/assets/` and are imported by the component that renders them. Vite resolves these imports as build assets, rather than embedding a large base64 data URL in application source.

The gem icon was moved byte-for-byte from its previous PNG data URL into `src/assets/gem-icon.png`. `GemHex` uses the imported asset URL; its rendered dimensions, object fit, alignment and accessibility attributes are unchanged.

## Invariants

- CSS declarations were moved without intentional selector, value, order or media-query changes.
- The theme token stylesheet remains loaded before the application shell stylesheet.
- The Google Fonts URLs and their preconnect remain unchanged.
- The gem icon remains a PNG and continues to render at the same 18-by-18 CSS pixel size.
- No API, application state, user data, backend, database or route behavior is changed.

## Regression coverage

`tests/frontend-static-assets.test.js` checks the stylesheet entry import, the retained font links, removal of inline static CSS and base64 image data from `App.jsx`, the gem asset import, and the PNG signature/dimensions.
