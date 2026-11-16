# Theme Authoring Guide

This is the practical workflow for creating and maintaining Voxygen themes.
The design contract lives in [DESIGN.md](./DESIGN.md); architecture and runtime
resolution are described in [THEME_ARCHITECTURE.md](./THEME_ARCHITECTURE.md).

## The central rule

**A theme changes values, not product meaning or behavior.** Components use
semantic roles (primary action, success, warning, destructive, surface,
secondary text); a theme supplies the visual values behind those roles.
Do not style a component by checking whether the active theme is Vox.

## Where to work

| Concern | Source |
|---|---|
| Stable theme ID, display name, description, status | `shared/theme-catalog.js` |
| Theme values and CSS pack | `src/theme/theme-tokens.css` |
| Shared component primitives and migration slices | `src/App.jsx` |
| Token/catalog regression tests | `tests/theme-catalog.test.js`, `tests/theme-ui-contract.test.js` |
| Functional behavior and screen inventory | `Functional_System.txt` |
| Visual QA | `docs/design-system/QA_CHECKLIST.md` |

## Create and publish a theme

Use the generator instead of manually copying the baseline pack:

```sh
npm run theme:create -- midnight --name "Midnight" --description "A cool blue dark theme."
```

The command validates the stable ID, clones the complete Vox token pack,
registers the metadata with `status: 'draft'`, and leaves the new theme out of
user-facing selectors and API validation. Edit only the new scoped block in
`src/theme/theme-tokens.css`; do not change product semantics or protected
content colors.

Then run the complete validation gate:

```sh
npm test
npm run build
```

Review contrast, typography, states, responsive layouts and Telegram WebView
using [QA_CHECKLIST.md](./QA_CHECKLIST.md). Once visual QA is signed off,
publish explicitly:

```sh
npm run theme:publish -- midnight
```

Before publishing, the command reruns the full catalog/token-pack consistency
check; an incomplete or inconsistent registered pack blocks publication.
Publishing then changes the catalog status to `active`, which makes the theme
available to settings selectors and API validation. Keep `vox` as the default
unless a separate product decision changes it. Draft themes are still checked
for complete token coverage by `npm run theme:check`.

## Token authoring rules

- **Colors:** use separate canvas, surface, raised/elevated, overlay, text,
  border, action and status roles. Do not collapse success/warning/danger.
- **Protected content:** gem currency, user-picked territory colors, map data,
  Minecraft formatting and user-created visuals are not theme accents.
- **Typography:** tune display/body/technical families and the complete type
  scale together; check Cyrillic glyph coverage, fallback fonts and line
  wrapping.
- **Geometry:** use the spacing and radius scales; tune control sizes without
  reducing touch targets. Keep compact and regular density roles distinct.
- **Elevation/effects:** use shadow, glow, blur and highlight roles instead of
  embedding palette-specific effects in component styles.
- **Motion:** tune duration/easing roles; never bypass reduced-motion support.
- **States:** inspect default, hover, pressed, selected, focus-visible,
  disabled, loading, validation error and destructive confirmation.
- **Responsive:** check narrow phone widths, safe areas, keyboard-open forms,
  scrolling dialogs and desktop preview.

## Component implementation checklist

When adding or migrating a component:

- [ ] Define its semantic role and state contract before choosing visuals.
- [ ] For reusable variants and shared controls, add component recipe roles that map back to semantic theme tokens; keep React primitive behavior/variant API theme-neutral.
- [ ] Prefer an existing primitive (`Button`, `IconButton`, `SurfaceCard`,
  `Field`, `TextAreaField`, `SelectField`, `ToggleField`, `Segmented`,
  `Slider`) over one-off style objects.
- [ ] Add a token only when it represents a reusable design decision—not
  merely to name a single arbitrary pixel value.
- [ ] Keep layout-specific spacing separate from component geometry.
- [ ] Avoid selectors that inspect inline-style text; use semantic classes.
- [ ] Add a focused regression test for token consumption and state semantics.
- [ ] Update the design docs and functional inventory for meaningful changes.

## Release gate

A successful unit test/build is necessary but not a visual sign-off. Complete
[`QA_CHECKLIST.md`](./QA_CHECKLIST.md) on real mobile dimensions and in
Telegram WebView; check contrast, clipping, focus, touch targets, reduced
motion and safe-area behavior. Themes are trusted bundled assets: never
evaluate user-supplied CSS/JS or load arbitrary remote font URLs.


## Token index

Before adding a role, consult [THEME_TOKEN_REFERENCE.md](./THEME_TOKEN_REFERENCE.md) to reuse an existing token and avoid duplicate or one-off variables.
