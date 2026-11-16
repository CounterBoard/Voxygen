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
- `THEME_CATALOG`: registered theme metadata;
- `isSupportedTheme()`: strict catalog membership check;
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

The React application root exposes its active theme through
`data-theme`. The current foundation sets it to `DEFAULT_THEME_ID`.
Later work can connect the resolved per-user preference to this attribute
without changing the token contract.

### 4. Persistence and policy

The Worker already persists `user_preferences.default_theme` and supports
the `theme` global override through the existing user-settings and
admin-global-settings routes.

The Worker validates requested IDs against the shared catalog. The existing
global override expiry and personal opt-out behavior remain independent from
the map zoom setting and are not changed by this foundation.

The catalog currently contains only Vox, so only Vox is accepted today.
Registering a new ID is an explicit release change, not a user-supplied
runtime payload.

## Theme resolution

1. Read a stored or global theme ID.
2. Normalize it using the shared catalog.
3. If the ID is unknown, fall back to `DEFAULT_THEME_ID`.
4. Set the resolved ID on the app root's `data-theme` attribute.
5. CSS applies the matching registered token pack.

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
npm test
npm run build
```

The theme catalog test verifies the default, normalization and fallback.
Future theme additions must add regression tests for catalog membership,
token presence, semantic color separation and reduced-motion behavior.
