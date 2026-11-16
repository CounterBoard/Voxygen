# Voxygen Design System

**Status:** current implementation baseline and theme-authoring contract  
**Default theme:** `vox` (Vox)  
**Source of truth:** `shared/theme-catalog.js` and `src/theme/theme-tokens.css`

This document supersedes the older design-system draft on the
`docs/voxygen-design-system` branch wherever that draft describes themes as
color-only or treats typography and geometry as immutable.

## 1. Design principles

Voxygen is a mobile-first territorial community interface. The map and
community data lead; the interface organizes them with clear hierarchy,
compact controls and restrained visual emphasis.

The theme system is an extensibility layer, not a second application design.
A theme may change the complete visual language while preserving the
meaning and behavior of the product.

- **Themes are peers.** Vox is the first theme and the default, not a special
  hard-coded visual mode.
- **Theme scope is broad.** A theme may change colors, surfaces, typography,
  geometry, spacing, component shapes, elevation, effects and motion.
- **Semantic roles remain stable.** A primary action remains a primary action
  even when its color changes.
- **Content is not chrome.** Game data, user-created visuals and economy
  semantics are not recolored as a side effect of changing the interface.
- **Progressive migration.** New and migrated UI must consume tokens. Legacy
  inline styling is replaced in focused steps, not with a risky rewrite of
  the large application component.

## 2. Themeable design dimensions

| Dimension | Theme controls |
|---|---|
| Color | canvas, surfaces, text, borders, primary/secondary accents, semantic status colors |
| Backgrounds | app backdrop, panels, cards, overlays, gradients, texture |
| Typography | font families, weights, sizes, line heights, letter spacing, text treatments |
| Geometry | spacing scale, content widths, control heights, radii, border widths |
| Components | buttons, inputs, sliders, segmented controls, chips, cards, tabs, navigation |
| Dialogs | modal shape, backdrop, elevation, sheet behavior and visual treatment |
| Effects | shadows, glows, blur, opacity, gradients and decorative layers |
| Motion | durations, easing curves, transitions, entrance/exit and interaction animations |

A theme may define alternate component treatments, but must preserve the
component's semantic role, accessibility, interaction contract and usable
touch target. A theme must not hide required controls or change product
permissions and business behavior.

## 3. Vox baseline

Vox is the first active theme. It uses a dark neutral foundation, purple
primary action, mint positive/curator accent, Manrope display typography and
Inter reading/control typography.

The current token pack is implemented in
`src/theme/theme-tokens.css`. Its token families cover:

- `--theme-color-*`: neutral surfaces, text, borders and semantic actions;
- `--theme-font-*` and `--theme-type-*`: font families and type scale;
- `--theme-space-*`, `--theme-radius-*`, `--theme-control-*`: geometry;
- `--theme-shadow-*`, `--theme-glow-*`, `--theme-backdrop-*`: elevation;
- `--theme-motion-*` and `--theme-ease-*`: motion system.

The same file includes a compatibility bridge for legacy variables
(`--bg`, `--surface`, `--purple`, `--mint`, etc.). This bridge allows
incremental migration of existing screens. It does not mean every legacy
style is token-driven yet.

## 4. Semantic color contract

Theme packs may change the actual values assigned to interface roles, but
must retain their meaning:

- primary: primary actions, selection and active navigation;
- success: successful completion and positive confirmation;
- warning: caution and attention, distinct from success;
- danger: destructive actions and errors;
- info: neutral informational emphasis.

Gem currency is a protected content/economy color, not a theme accent.
Minecraft formatting codes, user-selected territory colors, user-created
visual items and map/content colors are also protected. They must retain
their authored values when a theme changes.

Never use one color token for two conflicting semantic states merely
because the current palette makes that convenient.

## 5. Typography and geometry

Typography and geometry are first-class theme dimensions. A future theme may
use a different font family, type scale, line height, letter spacing, control
height, spacing rhythm, radius system or slider geometry.

The theme must still meet these product constraints:

- text remains readable at narrow Telegram WebView widths;
- controls retain clear focus, active, disabled and error states;
- interactive targets remain comfortably touchable;
- content does not overflow or become clipped;
- dialogs respect the viewport and safe-area insets.

The current Vox values are a baseline, not immutable rules for every future
theme. Accessibility and usability constraints remain mandatory.

## 6. Motion and reduced motion

Motion is themeable: themes may define timing, easing and animation style.
Motion must communicate state and hierarchy rather than obstruct tasks.
All themes must respect `prefers-reduced-motion`; the base token layer
provides a reduced-motion override.

## 7. Component migration policy

The current application still contains many inline styles and legacy
selectors that inspect inline-style strings. These are migration debt.

When touching a component:

1. identify its semantic role and states;
2. replace hard-coded theme values with semantic tokens;
3. use a semantic class or reusable primitive instead of style-string
   selectors;
4. preserve existing behavior and screen-specific layout;
5. verify narrow mobile, desktop, focus, disabled and reduced-motion states.

Do not attempt to convert the entire application in one change. The
application entry component is large; migrate by component families and
validate each step.

## 8. Adding a theme

A theme is not available merely because a CSS selector exists. Registration
and rendering must agree.

1. Add the theme metadata to `THEME_CATALOG` in
   `shared/theme-catalog.js`.
2. Add a complete token pack under
   `[data-theme="<id>"]` in `src/theme/theme-tokens.css`.
3. Keep the token contract and protected content colors intact.
4. Add or update catalog and token regression tests.
5. Document the theme's intended appearance and any font assets.
6. Verify that the Worker accepts the registered ID and that unknown IDs
   still fall back safely.
7. Run the full test suite and production build.

Theme IDs are stable lowercase identifiers. Do not use display names as
persisted IDs. Removing or renaming a published ID requires a compatibility
migration for saved user preferences and active global overrides.

## 9. Current implementation boundary

The foundation centralizes the theme catalog, introduces the Vox token
pack, and connects the frontend and backend to the same allowlist. The first
migration slices now route the global app background, typography scale,
slider geometry, focus treatment, content width, icon-button sizing,
segmented controls, shared fields and the simple modal primitive through
theme tokens. Many screen-specific inline styles and legacy style-string
selectors remain to be migrated. It does not yet add a theme
picker, download remote theme packs, or introduce third-party theme
execution.

Theme packs remain trusted, versioned code shipped with the application.
Do not accept arbitrary CSS, JavaScript, font URLs or executable theme
payloads from users or the database.
