# Voxygen Theme Architecture

## Purpose

Provide one stable contract for selecting and rendering interface themes
across the React Mini App and Cloudflare Worker. Vox is the default theme;
additional themes can be introduced without treating Vox as the system itself.

## Current layers

### 1. Shared catalog

`shared/theme-catalog.js` is the shared registry and allowlist.

It exports:

- `DEFAULT_THEME_ID`: the fallback and initial theme (`vox`);
- `THEME_CATALOG`: registered theme metadata (active and draft);
- `VOXYGEN_THEME_IDS`: IDs of active/published themes only;
- `isSupportedTheme()`: accepts active catalog entries only;
- `normalizeThemeId()`: safe normalization with a registered fallback.

The Mini App and Worker import the same module. This avoids maintaining
separate frontend and backend lists of accepted theme IDs.

### 2. Theme token packs

`src/theme/theme-tokens.css` contains the visual values for each registered
theme, scoped to the app root using `data-theme`.

A pack may provide values for:

- semantic colors and backgrounds;
- font families and type scale;
- spacing, component geometry and control dimensions;
- shadows, blur, gradients and other effects;
- animation durations and easing curves.

The current `vox` pack is the first complete token contract. A compatibility
bridge maps common legacy CSS variables to the new semantic token names.

### 3. Theme host

The React application root exposes its effective theme through
`data-theme={activeTheme}`. The value is initialized from the shared default
and then updated from the authenticated `/api/user-settings` response.
The client normalizes the effective value through `normalizeThemeId` before
applying it, so unknown or malformed server values cannot select an
unregistered token pack.

### 4. Persistence and policy

The Worker persists the user's personal theme preference in
`user_preferences.default_theme` and resolves the effective `theme` value
through the existing user-settings contract. The main-inspector global
settings route can apply a global theme override; the profile settings route
continues to save the personal preference and the existing opt-out marker.

The global override expiry and personal opt-out behavior remain independent
from the map zoom setting. The global choice does not overwrite the stored
personal selection. All accepted IDs are validated against the shared
catalog on the Worker and normalized again by the client.

The catalog currently contains only Vox, so only Vox is accepted today.
Draft entries are intentionally excluded from `VOXYGEN_THEME_IDS`,
`isSupportedTheme()`, settings selectors and API validation. The generator
creates a complete draft token pack; only the explicit publish command makes
it selectable. Draft and active packs are both covered by completeness checks.

## Theme resolution

1. The authenticated user-settings response supplies the effective theme (`settings.theme`), with `settings.defaultTheme` as a compatibility fallback.
2. The client normalizes the value using the shared catalog.
3. If the ID is unknown or malformed, fall back to `DEFAULT_THEME_ID`.
4. React applies the resolved ID to the app root's `data-theme` attribute.
5. CSS applies the matching registered token pack; refreshed settings can update the active theme without changing the token contract.

The server remains authoritative for accepted IDs. The client fallback
prevents a missing, stale or malformed preference from breaking rendering.

## Trust and security boundaries

Themes are trusted application assets. Never evaluate user-provided CSS or
JavaScript. Never load arbitrary remote font URLs from a theme record.
Theme metadata and IDs are data; visual implementations ship with the app.

A future downloadable theme marketplace would require a separate signed,
versioned, constrained asset format and review process. It is not part of
this foundation.

## Compatibility and migration

- Keep `vox` as the stable persisted ID and default.
- Preserve `default_theme`, `theme_global_updated_at` and
  `global_setting_overrides` semantics.
- Do not couple theme expiry or opt-out to map zoom.
- Keep the legacy CSS variable bridge until all consumers are migrated.
- Migrate UI components incrementally; do not replace the large application
  stylesheet wholesale.
- A removed theme ID must normalize to Vox until a deliberate data migration
  is shipped.

## Verification

Run:

```sh
npm run theme:check
npm test
npm run build
```

The theme catalog test verifies the default, normalization and fallback.
Future theme additions must add regression tests for catalog membership,
token presence, semantic color separation and reduced-motion behavior.


## UI primitives and migration

The token architecture is now accompanied by shared presentation primitives in `src/App.jsx`: `Button`, `IconButton`, `SurfaceCard`, `Slider`, `Field`, `TextAreaField`, `SelectField`, `ToggleField` and `Segmented`. They consume semantic theme tokens and preserve caller-owned state/actions. Migration is ongoing: only selected screens and fields have been moved; remaining inline styles are not automatically theme-compliant. See [`DESIGN.md`](./DESIGN.md) for contracts and migration status, and `Functional_System.txt` section 15 for the system-wide feature documentation.


## QA contract

Automated regression coverage lives in `tests/theme-catalog.test.js` and `tests/theme-ui-contract.test.js`. Manual browser/device validation is tracked in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md); visual checks in Telegram WebView remain a release gate and cannot be inferred from unit tests or build success.


## Effective theme wiring (15 Nov 2026)

The app now binds its root `data-theme` to React state (`activeTheme`) rather than a constant. The existing authenticated `/api/user-settings` response is the source of the effective theme: `settings.theme` (global override when applicable, otherwise personal preference) with `settings.defaultTheme` as a compatibility fallback. The client normalizes every value through the shared catalog before applying it. The existing settings refresh loop therefore also updates the rendered theme when a global override changes or expires.

The profile settings dialog exposes the personal theme from `settings.personalTheme`/`settings.defaultTheme` as a catalog-driven select. The main-inspector global-settings dialog also builds its theme choices from the same catalog. Saving a personal choice continues to use the existing Worker preference contract and global-override opt-out marker. The global theme does not overwrite the user's stored personal selection. With the current catalog containing only Vox, the selector has one option; registering additional shipped theme packs will automatically populate it.

Regression coverage: `tests/theme-ui-contract.test.js` verifies root binding, effective-theme normalization, catalog-driven personal selection and save propagation. This is a client integration contract; actual visual verification remains in `QA_CHECKLIST.md`.


## Semantic status and contrast roles

The status palette distinguishes success and warning border roles in addition
to their foreground and soft-background roles. Primary action foreground
contrast is defined by `--theme-color-action-primary-contrast`; components
should consume this token rather than assuming white text. The legacy
`--mint-strong` alias was removed after its remaining consumers were assigned
the appropriate success or warning border role.


## Semantic hover and confirmation treatments

Success confirmation borders and pulses, primary-accent hover borders/glows, and neutral hover borders consume semantic tokens (`--theme-color-status-success-border`, `--theme-color-status-success-soft`, `--theme-color-action-primary-border`, `--theme-glow-primary`, `--theme-glow-success`, and `--theme-color-border-strong`). Do not embed the current Vox RGB values in reusable interface treatments. Explicit user-selected visual palette colors remain content-owned and are intentionally preserved.


## Image overlays and persistent navigation

Full-screen modal dimming uses the shared overlay scrim role. The bottom
navigation surface and the circular control displayed over territory cover
images have dedicated theme roles because their opacity and contrast differ
from ordinary cards. Cover-image metadata uses the semantic secondary text
role, and its control border uses the strong border role. This keeps reusable
chrome adaptable without changing user-provided cover imagery or palette data.


## Theme-controlled depth and surface highlights

Reusable depth treatments now have explicit roles for slider thumbs, success
toasts, and navigation. The subtle inset highlights on neutral and raised
surfaces are also tokenized. A theme can tune these treatments independently
without editing component styles; semantic status rings remain separate from
the neutral depth shadows.


## Global typography roles

The global heading hierarchy, small-text rhythm, form-field typography,
button line-height, and inline text line-height are expressed as theme tokens.
This supplements the existing font-family and type-size roles and allows
theme packs to tune vertical rhythm without overriding component markup.


Display tracking, heading-specific letter spacing, paragraph rhythm, and button
weight/tracking are now exposed as typography roles. Keep these values in the
theme token layer rather than adding new global CSS literals.


Decorative recruitment-card sheen and map-marker hover depth also use theme
roles. These are interface effects, not part of the marker image or the
recruitment content, so a theme may tune them without recoloring user assets.


Error and warning toasts share the theme-owned toast depth shadow; focused
form fields use a dedicated focus shadow alongside the semantic focus ring.
The account switcher uses the shared card radius and a theme-controlled padding
role, keeping its footprint adjustable without changing its layout behavior.


Slider-thumb elevation is shared across WebKit and Firefox implementations.
Territory-cover title readability uses a dedicated theme shadow so themes can
tune text legibility over user imagery without modifying the image itself.


## Safe-area-aware navigation and dynamic viewport

The bottom navigation geometry is controlled by a dedicated token family for
block/inline padding, item height, item gap, icon size and label size. The
bottom inset incorporates the platform safe-area environment variable. The
application root declares `100vh` as a compatibility fallback followed by
`100dvh` so mobile browser chrome and Telegram WebView viewport changes are
handled more accurately. Keep the navigation's interactive target at least
44 px high and verify the result on physical devices; automated tests validate
the CSS contract but do not replace Telegram WebView visual QA.


## Compact typography roles

The 380 px responsive typography overrides consume a dedicated set of
compact display, headline, title and body-size tokens. The breakpoint and
current scale remain unchanged in the Vox baseline, while future theme packs
can tune narrow-screen readability independently from the desktop type scale.


## Modal viewport and spacing contract

All standard modal overlays inherit a theme-owned safe inset unless the
individual overlay deliberately supplies its own padding (for example, the
full-screen image viewer). Dialogs retain their distinct compact, standard,
form, settings, expanded and editor height tiers, but each is additionally
bounded by the available dynamic viewport height minus the shared safety
inset. Shared modal radius and content padding are theme roles. The existing
per-dialog height hierarchy is intentionally preserved.


The shared viewport-safe-height token defaults to `100vh` and is upgraded
to `100dvh` through feature detection. Older WebViews therefore retain a
working maximum-height constraint instead of dropping the modal cap.


Generic surface-card fallback selectors explicitly exclude
`.atlas-modal-shell`. Modal dialogs therefore retain their own theme-driven
radius and high elevation instead of inheriting ordinary card depth.


The generic inline-background rules exclude both `.atlas-modal-shell` and
`.atlas-surface`. Shared primitives retain ownership of their respective
radius and elevation values, including explicit caller overrides on
`SurfaceCard`.


## Fixed toast geometry

The persistent toast uses tokens for its safe-area-aware bottom offset,
viewport gutter, width cap, padding, radius and typography. Its timing,
priority selection, live-region semantics and status color roles remain
component behavior and are not affected by theme changes.


The account switcher uses the shared soft inset-highlight role so its surface
material can be tuned with the rest of the theme instead of carrying a local
white RGBA literal.


## Repeated card geometry

List and recruitment cards share the card radius role and theme spacing scale;
review cards use the control radius role. Their padding is expressed through
space-2/3/4. The migration is deliberately scoped to these recurring variants;
remaining inline card and panel geometry is audited separately to avoid
unreviewed changes to density or content layout.


### Base surface panel geometry

The standard repeated surface panel uses the card radius role and the 16 px spacing role (`--theme-space-4`). This migration is intentionally limited to matching base panels; compact panel variants retain their own density pending review.


### Compact raised panels

Three compact raised panels use `--theme-radius-control` and `--theme-space-3` (preserving the former 14/12 px geometry). Other raised panel variants remain scoped for later review.


## Theme authoring workflow

For the practical step-by-step workflow, component checklist and release gate, see [THEME_AUTHORING_GUIDE.md](./THEME_AUTHORING_GUIDE.md). Keep this architecture/design contract as the source of truth; the guide is its implementation companion.


## Token reference

Use [THEME_TOKEN_REFERENCE.md](./THEME_TOKEN_REFERENCE.md) as the searchable index of the current theme-specific CSS roles and Vox baseline values. The CSS pack remains authoritative.


## Automated token-pack completeness gate

`scripts/check-theme-packs.mjs` validates the shared catalog against the CSS
packs. Every catalog theme (draft or active) must have exactly one scoped selector and must
implement every token declared by the baseline Vox pack. The checker is exposed
as `npm run theme:check` and is chained into `npm test`, so local validation
and CI cannot silently skip token completeness. New themes may add extra
theme-specific tokens, but cannot omit baseline roles.
