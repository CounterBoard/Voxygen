# Theme Token Reference

Complete index of the theme-specific custom properties currently declared in `src/theme/theme-tokens.css`. **The CSS token pack is authoritative**; this index is navigational and should be updated when roles are added or renamed.

Values shown below are the current Vox defaults. A theme overrides these values inside its own `.atlas-root[data-theme="<id>"]` scope. Prefer semantic roles over raw values; preserve protected content semantics and compatibility aliases.

## Component recipes

Button and IconButton variant recipes are intentionally separate from semantic color roles. The active theme may tune each recipe's background, foreground and border while preserving action/status meaning:

| Family | Roles | Vox mapping |
|---|---|---|
| Button | `--theme-recipe-button-{primary,neutral,success,danger,ghost}-{bg,fg,border}` | Semantic action/status colors or neutral surface/text/border |
| IconButton | `--theme-recipe-icon-{neutral,primary,success,danger,ghost}-{bg,fg,border}` | Same semantic mapping, compact icon control |
| Segmented | `--theme-recipe-segmented-{active,idle}-{bg,fg}` | Primary action/contrast for active; transparent/muted for idle |
| Field controls | `--theme-recipe-field-{bg,fg,border,focus-border,inspector-border,inspector-focus-border,transition,radius,padding}` | Shared input surface, typography, border and geometry for text/select/textarea |
| SurfaceCard | `--theme-recipe-surface-{base-bg,raised-bg,elevated-bg,border,fg,shadow,radius,padding}` | Shared surface tones, border, text, elevation and default geometry |
| ScoreBadge | `--theme-recipe-badge-{neutral,primary,success,warning,danger}-{bg,fg,border}` | Semantic status/identity badge colors; current community/curator scoring uses primary/success |
| ToggleField | `--theme-recipe-toggle-{track-on,track-off}-{bg,border}`, `--theme-recipe-toggle-thumb-{on,off}-bg` | Independent checked/unchecked switch track and thumb colors |

Recipes are component-level visual decisions; semantic tokens remain the color source of truth. Add new recipe roles only when a reusable component variant needs independent tuning.

## Color roles

| Token | Vox default | Role / guidance |
|---|---|---|
| `--theme-color-canvas` | `#0A0B10` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-surface` | `#12151D` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-surface-raised` | `#171B24` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-surface-elevated` | `#1D2230` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-surface-overlay` | `rgba(5, 7, 12, .78)` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-overlay-scrim` | `rgba(0, 0, 0, .82)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-navigation-surface` | `rgba(10, 11, 16, .94)` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-image-control-surface` | `rgba(11, 13, 16, .58)` | Surface hierarchy; keep elevation levels distinct. |
| `--theme-color-text-primary` | `#F7F8FC` | Text hierarchy; preserve readable contrast. |
| `--theme-color-text-secondary` | `#B5BBCB` | Text hierarchy; preserve readable contrast. |
| `--theme-color-text-muted` | `#7F879A` | Text hierarchy; preserve readable contrast. |
| `--theme-color-text-subtle` | `#636B7E` | Text hierarchy; preserve readable contrast. |
| `--theme-color-border` | `rgba(181, 187, 203, .12)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-border-strong` | `rgba(181, 187, 203, .22)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-action-primary` | `#8B5CF6` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-action-primary-contrast` | `#FFFFFF` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-action-primary-soft` | `rgba(139, 92, 246, .14)` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-action-primary-strong` | `rgba(139, 92, 246, .30)` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-action-primary-border` | `rgba(139, 92, 246, .28)` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-action-primary-focus` | `rgba(139, 92, 246, .13)` | Primary action/selection; contrast token is paired foreground. |
| `--theme-color-status-success` | `#41FFA7` | Positive state (not warning or danger). |
| `--theme-color-status-success-contrast` | `#06120D` | Positive state (not warning or danger). |
| `--theme-color-status-success-soft` | `rgba(65, 255, 167, .11)` | Positive state (not warning or danger). |
| `--theme-color-status-success-border` | `rgba(65, 255, 167, .28)` | Positive state (not warning or danger). |
| `--theme-color-status-warning` | `#B69CFF` | Violet caution state; distinct from mint success. |
| `--theme-color-status-warning-contrast` | `#130D24` | Foreground paired with the violet warning surface. |
| `--theme-glow-warning` | `0 14px 34px rgba(182, 156, 255, .12)` | Violet warning depth/effect role. |
| `--theme-color-status-warning-soft` | `rgba(182, 156, 255, .12)` | Violet caution surface; distinct from success. |
| `--theme-color-status-warning-border` | `rgba(182, 156, 255, .28)` | Violet caution border. |
| `--theme-color-status-danger` | `#FF5D73` | Error/destructive state. |
| `--theme-color-status-danger-soft` | `rgba(255, 93, 115, .12)` | Error/destructive state. |
| `--theme-color-status-danger-border` | `rgba(255, 93, 115, .28)` | Error/destructive state. |
| `--theme-color-status-info` | `#67B7FF` | Theme value; tune only when the corresponding component contract is understood. |

## Typography

| Token | Vox default | Role / guidance |
|---|---|---|
| `--theme-font-display` | `'Manrope', ui-sans-serif, system-ui, sans-serif` | Font role; verify Cyrillic and fallback. |
| `--theme-font-body` | `'Inter', ui-sans-serif, system-ui, sans-serif` | Font role; verify Cyrillic and fallback. |
| `--theme-font-technical` | `'IBM Plex Mono', ui-monospace, monospace` | Font role; verify Cyrillic and fallback. |
| `--theme-type-display-size` | `30px` | Typography scale/rhythm. |
| `--theme-type-compact-display-size` | `27px` | Typography scale/rhythm. |
| `--theme-type-compact-headline-size` | `22px` | Typography scale/rhythm. |
| `--theme-type-compact-title-size` | `17px` | Typography scale/rhythm. |
| `--theme-type-compact-body-size` | `14px` | Typography scale/rhythm. |
| `--theme-type-display-weight` | `800` | Typography scale/rhythm. |
| `--theme-type-display-line-height` | `1.08` | Typography scale/rhythm. |
| `--theme-type-headline-size` | `24px` | Typography scale/rhythm. |
| `--theme-type-headline-weight` | `700` | Typography scale/rhythm. |
| `--theme-type-title-size` | `18px` | Typography scale/rhythm. |
| `--theme-type-title-weight` | `700` | Typography scale/rhythm. |
| `--theme-type-body-size` | `15px` | Typography scale/rhythm. |
| `--theme-type-body-line-height` | `1.55` | Typography scale/rhythm. |
| `--theme-type-label-size` | `12px` | Typography scale/rhythm. |
| `--theme-type-label-weight` | `600` | Typography scale/rhythm. |
| `--theme-type-control-size` | `13px` | Typography scale/rhythm. |
| `--theme-type-technical-size` | `12px` | Typography scale/rhythm. |
| `--theme-type-control-line-height` | `1.4` | Typography scale/rhythm. |
| `--theme-type-headline-line-height` | `1.14` | Typography scale/rhythm. |
| `--theme-type-title-line-height` | `1.2` | Typography scale/rhythm. |
| `--theme-type-small-line-height` | `1.45` | Typography scale/rhythm. |
| `--theme-type-label-line-height` | `1.35` | Typography scale/rhythm. |
| `--theme-type-field-size` | `14px` | Typography scale/rhythm. |
| `--theme-type-field-line-height` | `1.45` | Typography scale/rhythm. |
| `--theme-type-button-line-height` | `1.2` | Typography scale/rhythm. |
| `--theme-type-inline-line-height` | `1.35` | Typography scale/rhythm. |
| `--theme-type-display-letter-spacing` | `-.028em` | Typography scale/rhythm. |
| `--theme-type-h1-letter-spacing` | `-.035em` | Typography scale/rhythm. |
| `--theme-type-h2-letter-spacing` | `-.028em` | Typography scale/rhythm. |
| `--theme-type-h3-letter-spacing` | `-.018em` | Typography scale/rhythm. |
| `--theme-type-paragraph-margin-bottom` | `14px` | Typography scale/rhythm. |
| `--theme-type-button-weight` | `650` | Typography scale/rhythm. |
| `--theme-type-button-letter-spacing` | `-.01em` | Typography scale/rhythm. |
| `--theme-type-textarea-line-height` | `1.5` | Typography scale/rhythm. |

## Geometry, spacing and controls

| Token | Vox default | Role / guidance |
|---|---|---|
| `--theme-space-1` | `4px` | Shared spacing scale. |
| `--theme-space-2` | `8px` | Shared spacing scale. |
| `--theme-space-3` | `12px` | Shared spacing scale. |
| `--theme-space-4` | `15px` | Shared spacing scale. |
| `--theme-space-5` | `20px` | Shared spacing scale. |
| `--theme-space-6` | `24px` | Shared spacing scale. |
| `--theme-space-8` | `32px` | Shared spacing scale. |
| `--theme-layout-section-gap` | `8px` | Gap between independent peer cards/sections. |
| `--theme-recipe-surface-padding` | `10px` | Default inner padding for ordinary SurfaceCard panels. |
| `--theme-radius-xs` | `8px` | Shared shape scale. |
| `--theme-radius-sm` | `10px` | Shared shape scale. |
| `--theme-radius-control` | `12px` | Shared shape scale. |
| `--theme-radius-card` | `16px` | Shared shape scale. |
| `--theme-radius-large` | `20px` | Shared shape scale. |
| `--theme-radius-modal` | `22px` | Shared shape scale. |
| `--theme-radius-pill` | `999px` | Shared shape scale. |
| `--theme-control-height` | `44px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-control-height-compact` | `36px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-field-label-gap` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-field-message-gap` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-icon-button-size` | `40px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-padding-block-start` | `10px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-padding-inline` | `6px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-padding-block-end` | `calc(14px + env(safe-area-inset-bottom))` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-item-min-height` | `44px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-item-gap` | `3px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-icon-size` | `19px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-navigation-label-size` | `10.5px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-avatar-radius` | `var(--theme-radius-control)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-avatar-fallback-background` | `var(--theme-color-action-primary-soft)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-avatar-fallback-foreground` | `var(--theme-color-action-primary)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-radius` | `var(--theme-radius-pill)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-weight` | `800` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-line-height` | `1` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-icon-stroke` | `2.5` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-shadow` | `var(--theme-shadow-low)` | Depth/effect role. |
| `--theme-score-badge-gap-sm` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-gap-default` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-gap-lg` | `var(--theme-space-2)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-gap-recruitment` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-padding-sm` | `6px 11px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-padding-default` | `8px 12px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-padding-lg` | `11px 17px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-padding-recruitment` | `8px 12px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-size-sm` | `13px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-size-default` | `15px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-size-lg` | `20px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-size-recruitment` | `16px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-icon-sm` | `14px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-icon-default` | `15px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-icon-lg` | `20px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-icon-recruitment` | `17px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-height-sm` | `36px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-height-default` | `36px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-height-lg` | `48px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-score-badge-height-recruitment` | `42px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-icon-button-glyph-size` | `18px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-icon-button-glyph-stroke` | `2` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-button-font-weight` | `700` | Font role; verify Cyrillic and fallback. |
| `--theme-button-line-height` | `1.2` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-button-radius` | `var(--theme-radius-control)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-button-gap` | `var(--theme-space-2)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-react-action-gap` | `var(--theme-space-1)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-react-action-size` | `var(--theme-type-technical-size)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-react-action-weight-active` | `700` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-react-action-weight-idle` | `500` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-section-title-gap` | `var(--theme-space-2)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-section-title-bottom-gap` | `var(--theme-space-2)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-section-title-size` | `var(--theme-type-control-size)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-section-title-weight` | `600` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-section-count-size` | `var(--theme-type-technical-size)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-slider-track-height` | `4px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-slider-thumb-size` | `18px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-track-width` | `48px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-track-height` | `28px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-thumb-size` | `20px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-track-inset` | `3px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-row-gap` | `12px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-row-padding` | `11px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-label-size` | `13.5px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-label-weight` | `650` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-label-line-height` | `1.3` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-description-size` | `11.5px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-description-line-height` | `1.4` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toggle-description-gap` | `4px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-content-max-width` | `448px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-modal-max-width` | `448px` | Dialog/viewport geometry. |
| `--theme-modal-overlay-padding` | `var(--theme-space-4)` | Dialog/viewport geometry. |
| `--theme-modal-content-padding` | `15px` | Dialog/viewport geometry. |
| `--theme-modal-viewport-inset-total` | `48px` | Dialog/viewport geometry. |
| `--theme-modal-viewport-safe-height` | `calc(100vh - var(--theme-modal-viewport-inset-total))` | Dialog/viewport geometry. |
| `--theme-modal-max-height-compact` | `70vh` | Dialog/viewport geometry. |
| `--theme-modal-max-height-standard` | `76vh` | Dialog/viewport geometry. |
| `--theme-modal-max-height-form` | `80vh` | Dialog/viewport geometry. |
| `--theme-modal-max-height-settings` | `84vh` | Dialog/viewport geometry. |
| `--theme-modal-max-height-expanded` | `88vh` | Dialog/viewport geometry. |
| `--theme-modal-max-height-editor` | `90vh` | Dialog/viewport geometry. |

## Elevation, effects and overlays

| Token | Vox default | Role / guidance |
|---|---|---|
| `--theme-shadow-low` | `0 8px 22px rgba(0, 0, 0, .18)` | Depth/effect role. |
| `--theme-shadow-medium` | `0 16px 42px rgba(0, 0, 0, .28)` | Depth/effect role. |
| `--theme-shadow-high` | `0 26px 70px rgba(0, 0, 0, .38)` | Depth/effect role. |
| `--theme-shadow-slider-thumb` | `0 1px 4px rgba(0, 0, 0, .35)` | Depth/effect role. |
| `--theme-shadow-toast` | `0 10px 26px rgba(0, 0, 0, .20)` | Depth/effect role. |
| `--theme-shadow-navigation` | `0 -16px 42px rgba(0, 0, 0, .30), inset 0 1px 0 rgba(255, 255, 255, .035)` | Depth/effect role. |
| `--theme-shadow-map-marker-hover` | `0 4px 9px rgba(0, 0, 0, .48)` | Depth/effect role. |
| `--theme-shadow-focus-field` | `0 6px 18px rgba(0, 0, 0, .12)` | Depth/effect role. |
| `--theme-shadow-cover-title` | `0 2px 10px rgba(0, 0, 0, .28)` | Depth/effect role. |
| `--theme-account-switcher-padding` | `14px 16px` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-sheen-soft` | `rgba(255, 255, 255, .012)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-sheen-strong` | `rgba(255, 255, 255, .055)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-highlight-inset-subtle` | `rgba(255, 255, 255, .018)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-color-highlight-inset-soft` | `rgba(255, 255, 255, .02)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-glow-primary` | `0 14px 34px rgba(139, 92, 246, .17)` | Depth/effect role. |
| `--theme-glow-success` | `0 14px 34px rgba(65, 255, 167, .12)` | Depth/effect role. |
| `--theme-backdrop-blur` | `18px` | Depth/effect role. |
| `--theme-toast-bottom-offset` | `calc(69px + env(safe-area-inset-bottom))` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toast-max-width` | `360px` | Maximum toast width; natural text width remains preferred. |
| `--theme-toast-viewport-gutter-total` | `28px` | Total horizontal viewport gutter for toast. |
| `--theme-toast-padding-block` | `7px` | Compact vertical inset around the notification text. |
| `--theme-toast-padding-inline` | `12px` | Horizontal inset around content-sized notification text. |
| `--theme-toast-radius` | `var(--theme-radius-pill)` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-toast-font-size` | `14px` | Font role; verify Cyrillic and fallback. |
| `--theme-toast-font-weight` | `700` | Font role; verify Cyrillic and fallback. |
| `--theme-toast-line-height` | `1.3` | Theme value; tune only when the corresponding component contract is understood. |
| `--theme-modal-backdrop-blur` | `4px` | Depth/effect role. |
| `--theme-app-background` | `` | Theme value; tune only when the corresponding component contract is understood. |

## Motion

| Token | Vox default | Role / guidance |
|---|---|---|
| `--theme-motion-instant` | `100ms` | Motion; must respect reduced-motion. |
| `--theme-motion-tap` | `160ms` | Motion; must respect reduced-motion. |
| `--theme-motion-standard` | `190ms` | Motion; must respect reduced-motion. |
| `--theme-motion-modal` | `245ms` | Motion; must respect reduced-motion. |
| `--theme-ease-standard` | `cubic-bezier(.22, .72, .22, 1)` | Motion; must respect reduced-motion. |
| `--theme-ease-interactive` | `cubic-bezier(.2, .85, .25, 1)` | Motion; must respect reduced-motion. |
| `--theme-ease-enter` | `cubic-bezier(.16, 1, .3, 1)` | Motion; must respect reduced-motion. |

## Protected and compatibility values

- `--content-color-gem` is defined on `:root`, not in theme packs; do not override it.
- Legacy aliases (`--bg`, `--surface`, `--purple`, `--mint`, etc.) are a migration bridge. New component code should consume semantic `--theme-*` roles.
- Theme packs are trusted bundled CSS. Never accept or evaluate user-provided CSS/JavaScript or remote font URLs.

## Practical workflow

See [THEME_AUTHORING_GUIDE.md](./THEME_AUTHORING_GUIDE.md) for adding a registered theme, tests, component migration and QA.



## Complete declaration inventory

The current Vox pack contains **307 scoped declarations**. The protected `--content-color-gem` declaration is intentionally defined outside theme packs and is not part of this count. The groups below enumerate every declaration in the pack; the preceding tables explain their values and intended use.

### Compatibility aliases

`--bg`, `--border`, `--danger`, `--ease-interactive`, `--ease-standard`, `--gem`, `--glow-mint`, `--glow-purple`, `--mint`, `--mint-soft`, `--motion-modal`, `--motion-standard`, `--motion-tap`, `--purple`, `--purple-border`, `--purple-soft`, `--purple-strong`, `--radius-lg`, `--radius-md`, `--red`, `--red-border`, `--red-soft`, `--shadow-lg`, `--shadow-md`, `--shadow-sm`, `--success`, `--success-soft`, `--surface`, `--surface-2`, `--surface-3`, `--text`, `--text-dim`, `--text-muted`, `--text-secondary`, `--warning`, `--warning-soft`

### Other theme roles

`--theme-account-switcher-padding`, `--theme-app-background`, `--theme-avatar-fallback-background`, `--theme-avatar-fallback-foreground`, `--theme-avatar-radius`, `--theme-backdrop-blur`, `--theme-button-font-weight`, `--theme-button-gap`, `--theme-button-line-height`, `--theme-button-radius`, `--theme-content-max-width`, `--theme-control-height`, `--theme-control-height-compact`, `--theme-field-label-gap`, `--theme-field-message-gap`, `--theme-icon-button-glyph-size`, `--theme-icon-button-glyph-stroke`, `--theme-icon-button-size`, `--theme-modal-backdrop-blur`, `--theme-modal-content-padding`, `--theme-modal-max-height-compact`, `--theme-modal-max-height-editor`, `--theme-modal-max-height-expanded`, `--theme-modal-max-height-form`, `--theme-modal-max-height-settings`, `--theme-modal-max-height-standard`, `--theme-modal-max-width`, `--theme-modal-overlay-padding`, `--theme-modal-viewport-inset-total`, `--theme-modal-viewport-safe-height`, `--theme-navigation-icon-size`, `--theme-navigation-item-gap`, `--theme-navigation-item-min-height`, `--theme-navigation-label-size`, `--theme-navigation-padding-block-end`, `--theme-navigation-padding-block-start`, `--theme-navigation-padding-inline`, `--theme-react-action-gap`, `--theme-react-action-size`, `--theme-react-action-weight-active`, `--theme-react-action-weight-idle`, `--theme-score-badge-gap-default`, `--theme-score-badge-gap-lg`, `--theme-score-badge-gap-recruitment`, `--theme-score-badge-gap-sm`, `--theme-score-badge-height-default`, `--theme-score-badge-height-lg`, `--theme-score-badge-height-recruitment`, `--theme-score-badge-height-sm`, `--theme-score-badge-icon-default`, `--theme-score-badge-icon-lg`, `--theme-score-badge-icon-recruitment`, `--theme-score-badge-icon-sm`, `--theme-score-badge-icon-stroke`, `--theme-score-badge-line-height`, `--theme-score-badge-padding-default`, `--theme-score-badge-padding-lg`, `--theme-score-badge-padding-recruitment`, `--theme-score-badge-padding-sm`, `--theme-score-badge-radius`, `--theme-score-badge-shadow`, `--theme-score-badge-size-default`, `--theme-score-badge-size-lg`, `--theme-score-badge-size-recruitment`, `--theme-score-badge-size-sm`, `--theme-score-badge-weight`, `--theme-section-count-size`, `--theme-section-title-bottom-gap`, `--theme-section-title-gap`, `--theme-section-title-size`, `--theme-section-title-weight`, `--theme-slider-thumb-size`, `--theme-slider-track-height`, `--theme-toast-bottom-offset`, `--theme-toast-font-size`, `--theme-toast-font-weight`, `--theme-toast-line-height`, `--theme-toast-max-width`, `--theme-toast-padding-block`, `--theme-toast-padding-inline`, `--theme-toast-radius`, `--theme-toast-viewport-gutter-total`, `--theme-toggle-description-gap`, `--theme-toggle-description-line-height`, `--theme-toggle-description-size`, `--theme-toggle-label-line-height`, `--theme-toggle-label-size`, `--theme-toggle-label-weight`, `--theme-toggle-row-gap`, `--theme-toggle-row-padding`, `--theme-toggle-thumb-size`, `--theme-toggle-track-height`, `--theme-toggle-track-inset`, `--theme-toggle-track-width`

### Semantic color roles

`--theme-color-action-primary`, `--theme-color-action-primary-border`, `--theme-color-action-primary-contrast`, `--theme-color-action-primary-focus`, `--theme-color-action-primary-soft`, `--theme-color-action-primary-strong`, `--theme-color-border`, `--theme-color-border-strong`, `--theme-color-canvas`, `--theme-color-highlight-inset-soft`, `--theme-color-highlight-inset-subtle`, `--theme-color-image-control-surface`, `--theme-color-navigation-surface`, `--theme-color-overlay-scrim`, `--theme-color-sheen-soft`, `--theme-color-sheen-strong`, `--theme-color-status-danger`, `--theme-color-status-danger-border`, `--theme-color-status-danger-soft`, `--theme-color-status-info`, `--theme-color-status-success`, `--theme-color-status-success-border`, `--theme-color-status-success-contrast`, `--theme-color-status-success-soft`, `--theme-color-status-warning`, `--theme-color-status-warning-border`, `--theme-color-status-warning-contrast`, `--theme-color-status-warning-soft`, `--theme-color-surface`, `--theme-color-surface-elevated`, `--theme-color-surface-overlay`, `--theme-color-surface-raised`, `--theme-color-text-muted`, `--theme-color-text-primary`, `--theme-color-text-secondary`, `--theme-color-text-subtle`

### Motion

`--theme-ease-enter`, `--theme-ease-interactive`, `--theme-ease-standard`, `--theme-motion-instant`, `--theme-motion-modal`, `--theme-motion-standard`, `--theme-motion-tap`

### Font families

`--theme-font-body`, `--theme-font-display`, `--theme-font-technical`

### Depth and effects

`--theme-glow-primary`, `--theme-glow-success`, `--theme-glow-warning`, `--theme-shadow-cover-title`, `--theme-shadow-focus-field`, `--theme-shadow-high`, `--theme-shadow-low`, `--theme-shadow-map-marker-hover`, `--theme-shadow-medium`, `--theme-shadow-navigation`, `--theme-shadow-slider-thumb`, `--theme-shadow-toast`

### Radii

`--theme-radius-card`, `--theme-radius-control`, `--theme-radius-large`, `--theme-radius-modal`, `--theme-radius-pill`, `--theme-radius-sm`, `--theme-radius-xs`

### Component recipes

`--theme-recipe-badge-danger-bg`, `--theme-recipe-badge-danger-border`, `--theme-recipe-badge-danger-fg`, `--theme-recipe-badge-neutral-bg`, `--theme-recipe-badge-neutral-border`, `--theme-recipe-badge-neutral-fg`, `--theme-recipe-badge-primary-bg`, `--theme-recipe-badge-primary-border`, `--theme-recipe-badge-primary-fg`, `--theme-recipe-badge-success-bg`, `--theme-recipe-badge-success-border`, `--theme-recipe-badge-success-fg`, `--theme-recipe-badge-warning-bg`, `--theme-recipe-badge-warning-border`, `--theme-recipe-badge-warning-fg`, `--theme-recipe-button-danger-bg`, `--theme-recipe-button-danger-border`, `--theme-recipe-button-danger-fg`, `--theme-recipe-button-ghost-bg`, `--theme-recipe-button-ghost-border`, `--theme-recipe-button-ghost-fg`, `--theme-recipe-button-neutral-bg`, `--theme-recipe-button-neutral-border`, `--theme-recipe-button-neutral-fg`, `--theme-recipe-button-primary-bg`, `--theme-recipe-button-primary-border`, `--theme-recipe-button-primary-fg`, `--theme-recipe-button-success-bg`, `--theme-recipe-button-success-border`, `--theme-recipe-button-success-fg`, `--theme-recipe-field-bg`, `--theme-recipe-field-border`, `--theme-recipe-field-fg`, `--theme-recipe-field-padding`, `--theme-recipe-field-radius`, `--theme-recipe-icon-danger-bg`, `--theme-recipe-icon-danger-border`, `--theme-recipe-icon-danger-fg`, `--theme-recipe-icon-ghost-bg`, `--theme-recipe-icon-ghost-border`, `--theme-recipe-icon-ghost-fg`, `--theme-recipe-icon-neutral-bg`, `--theme-recipe-icon-neutral-border`, `--theme-recipe-icon-neutral-fg`, `--theme-recipe-icon-primary-bg`, `--theme-recipe-icon-primary-border`, `--theme-recipe-icon-primary-fg`, `--theme-recipe-icon-success-bg`, `--theme-recipe-icon-success-border`, `--theme-recipe-icon-success-fg`, `--theme-recipe-segmented-active-bg`, `--theme-recipe-segmented-active-fg`, `--theme-recipe-segmented-idle-bg`, `--theme-recipe-segmented-idle-fg`, `--theme-recipe-surface-base-bg`, `--theme-recipe-surface-border`, `--theme-recipe-surface-elevated-bg`, `--theme-recipe-surface-fg`, `--theme-recipe-surface-padding`, `--theme-recipe-surface-radius`, `--theme-recipe-surface-raised-bg`, `--theme-recipe-surface-shadow`, `--theme-recipe-toggle-thumb-off-bg`, `--theme-recipe-toggle-thumb-on-bg`, `--theme-recipe-toggle-track-off-bg`, `--theme-recipe-toggle-track-off-border`, `--theme-recipe-toggle-track-on-bg`, `--theme-recipe-toggle-track-on-border`

### Spacing

`--theme-space-1`, `--theme-space-2`, `--theme-space-3`, `--theme-space-4`, `--theme-space-5`, `--theme-space-6`, `--theme-space-8`, `--theme-layout-section-gap`

### Typography

`--theme-type-body-line-height`, `--theme-type-body-size`, `--theme-type-button-letter-spacing`, `--theme-type-button-line-height`, `--theme-type-button-weight`, `--theme-type-compact-body-size`, `--theme-type-compact-display-size`, `--theme-type-compact-headline-size`, `--theme-type-compact-title-size`, `--theme-type-control-line-height`, `--theme-type-control-size`, `--theme-type-display-letter-spacing`, `--theme-type-display-line-height`, `--theme-type-display-size`, `--theme-type-display-weight`, `--theme-type-field-line-height`, `--theme-type-field-size`, `--theme-type-h1-letter-spacing`, `--theme-type-h2-letter-spacing`, `--theme-type-h3-letter-spacing`, `--theme-type-headline-line-height`, `--theme-type-headline-size`, `--theme-type-headline-weight`, `--theme-type-inline-line-height`, `--theme-type-label-line-height`, `--theme-type-label-size`, `--theme-type-label-weight`, `--theme-type-paragraph-margin-bottom`, `--theme-type-small-line-height`, `--theme-type-technical-size`, `--theme-type-textarea-line-height`, `--theme-type-title-line-height`, `--theme-type-title-size`, `--theme-type-title-weight`

## Pack completeness

The baseline Vox pack defines the minimum token contract for every shipped theme. Additional themes may add specialized roles, but must retain all baseline declarations. Run `npm run theme:check` (or `npm test`) after editing the catalog or token packs.

## Field interaction recipe additions

| Token | Vox mapping |
|---|---|
| `--theme-recipe-field-border` | `--theme-color-action-primary` (Purple) |
| `--theme-recipe-field-focus-border` | `--theme-color-status-success` (Mint) |
| `--theme-recipe-field-inspector-border` | `--theme-color-status-success` (Mint) |
| `--theme-recipe-field-inspector-focus-border` | `--theme-color-action-primary` (Purple) |
| `--theme-recipe-field-transition` | `border-color 180ms ease, box-shadow 180ms ease` |

Toast layering and motion contract: FixedToast uses z-index 39 while the persistent bottom navigation uses z-index 40. It uses inline-block/content width, 12 px horizontal padding, 7 px vertical padding and 14 px text. No backdrop filter or blur is used; semantic toast surfaces are darkened directly. The viewport bottom is 69 px plus safe area, aligned to the actual navigation edge; the toast is 4 px above its edge. The viewport clips entry/exit with `overflow:hidden` so motion still appears from behind the navigation. Entry and exit translate by 100% of the toast's own height so the notification emerges from behind the navigation and returns behind it. Error toasts retain the danger/red palette.




Toast/navigation spacing: `--theme-toast-bottom-offset: calc(73px + env(safe-area-inset-bottom))`. The bottom navigation occupies 69 px plus safe area, leaving a 4 px gap above the bar. Insufficient-gems purchase errors are routed to the root app-level `FixedToast` with `type="error"`.


Insufficient-gems failures from visual purchases, treasury deposits and territory donations all use the root app-level `FixedToast` with `type="error"`. Their local inline error text is cleared when this specific response is received.


Toast semantic effect contract (20.11.2026): error notifications use the dedicated `atlas-toast-error-glow` animation with danger-red border/halo tokens, not the default success/Mint glow. Success retains its success/Mint glow; warning retains warning semantics. Success, warning and error surfaces are darkened using `color-mix(in srgb, <semantic-soft> 88%, #000)`. FixedToast must not use `backdrop-filter` or `-webkit-backdrop-filter`; the background behind the plate stays sharp.


Toast contrast update (21.11.2026): success, danger and warning FixedToast surfaces use `color-mix(in srgb, <semantic-soft> 45%, #000)` (55% black) for stronger text contrast. Do not add backdrop blur or filter the page behind the plate.

Segmented selection motion: both the three-item MainTabs control
Profile settings modal viewport rule (21.11.2026): the settings overlay reserves the fixed bottom navigation height (69 px), a 12 px clearance, and top/bottom device safe areas. The modal is centered within the remaining visible region and its maximum height is capped to that region. Existing modal geometry and content padding remain unchanged.
 and the reusable Segmented control use a single absolutely positioned Purple indicator. Its horizontal position is driven by the selected option index and animated with a 280 ms ease curve. The selected option foreground is white; inactive options keep the muted foreground. The indicator transition is disabled under `prefers-reduced-motion: reduce`.


## Territory rating switch — Vox recipe tokens

The “По инспекторам / По игрокам” selector is configured by the Vox token pack in `src/theme/theme-tokens.css`. These tokens keep the dark track and the active purple pill geometrically nested:

- `--theme-recipe-rating-switch-track-bg` — dark raised surface behind the selector.
- `--theme-recipe-rating-switch-inset` — inset between track and active pill (3px).
- `--theme-recipe-rating-switch-indicator-height` — active pill height, linked to `--theme-control-height-compact` (36px).
- `--theme-recipe-rating-switch-track-height` — total track height, indicator height plus the inset on both sides (42px).
- `--theme-recipe-rating-switch-indicator-radius` — active pill radius (18px, half its 36px height).
- `--theme-recipe-rating-switch-track-radius` — outer track radius, calculated as the inner radius plus the inset (21px).

Use `R_outer = R_inner + inset` for this nested pair. Keep the component bound to these tokens rather than duplicating numeric geometry in JSX.
