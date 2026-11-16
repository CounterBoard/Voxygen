---
name: Voxygen
description: A restrained, dark, map-first interface system for a mobile territorial community platform.
colors:
  background: "#0A0B10"
  surface: "#12151D"
  surface-2: "#171B24"
  surface-3: "#1D2230"
  text-primary: "#F7F8FC"
  text-secondary: "#B5BBCB"
  text-muted: "#7F879A"
  text-dim: "#636B7E"
  primary: "#8B5CF6"
  primary-soft: "rgba(139,92,246,.14)"
  primary-strong: "rgba(139,92,246,.30)"
  primary-border: "rgba(139,92,246,.28)"
  success: "#41FFA7"
  success-soft: "rgba(65,255,167,.11)"
  success-strong: "rgba(65,255,167,.28)"
  gem: "#38BDF8"
  danger: "#FF5D73"
  danger-soft: "rgba(255,93,115,.12)"
  danger-border: "rgba(255,93,115,.28)"
  border: "rgba(181,187,203,.12)"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: "-0.028em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.018em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
  technical:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  modal: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
    typography: "{typography.label}"
  button-success:
    backgroundColor: "{colors.success}"
    textColor: "#06120D"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 14px"
    typography: "{typography.label}"
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input-default:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "10px 12px"
---

# Design System: Voxygen

## Overview

**Creative North Star: "The Living Atlas"**

Voxygen is a mobile-first territorial community interface. Its visual language should feel like a precise, always-available atlas and control surface: dark, focused, information-rich, and quietly energetic. The map and community data are the product; the interface should organize them rather than compete with them.

The current visual identity is built on deep neutral surfaces, a purple action accent, mint confirmation/curator accent, and cyan reserved for gem balances. Typography combines Manrope display headings with Inter reading and control text. The system uses compact cards, rounded controls, subtle depth, and short state transitions suitable for Telegram WebView and touch interaction.

This document separates observed implementation from the proposed normalized rules. The color and type values in the frontmatter are grounded in the current `src/App.jsx`; the spacing and radius scales consolidate values already repeated in that file. Where the current implementation conflicts with itself, the conflict is called out rather than presented as an established invariant.

**Key Characteristics:**
- Dark neutral foundation; never rely on pure black as the only surface.
- Purple is the primary action and selection color.
- Mint is the positive/curator accent; cyan is reserved for gem economy values.
- Manrope carries hierarchy; Inter carries reading and controls.
- Compact, rounded, touch-first controls with restrained motion.
- Themes change semantic tokens, not component geometry or information hierarchy.

## Colors

The palette is a dark neutral system with three recognizable accents. Keep roles stable across themes even when their actual values change.

### Primary
- **Voxygen Purple** (#8B5CF6): primary actions, selected segmented controls, active navigation, focus emphasis, and primary interactive states.
- **Voxygen Mint** (#41FFA7): positive confirmation, curator/inspector identity, success actions, and selected positive indicators. Do not use it as a generic warning color.
- **Gem Cyan** (#38BDF8): gem balances, gem prices, and economy-specific values only. It is a content/economy semantic, not a general interactive accent.

### Secondary
- **Danger Coral** (#FF5D73): destructive actions, errors, and rejection states. Use a soft red surface and border for secondary destructive controls; use the solid color for concise emphasis.

### Neutral
- **Night Base** (#0A0B10): root page background.
- **Deep Surface** (#12151D): cards, panels, and modal surfaces.
- **Raised Surface** (#171B24): nested controls, secondary panels, and input backgrounds.
- **Elevated Surface** (#1D2230): tertiary surface and inactive slider track.
- **Primary Ink** (#F7F8FC): main text and high-priority values.
- **Secondary Ink** (#B5BBCB): body copy and explanatory text.
- **Muted Ink** (#7F879A): labels, supporting metadata, and inactive controls.
- **Dim Ink** (#636B7E): placeholders and low-priority metadata.
- **Quiet Border** (rgba(181,187,203,.12)): default card, field, and divider outline.

### Named Rules
**The Semantic Separation Rule.** Purple means action/selection; mint means positive/curator; cyan means gems; red means danger. A theme may change the hues, but must preserve these roles.

**The No-False-Warning Rule.** The current code aliases `--gold` and `--emerald` to mint. This makes warning and success visually indistinguishable. New theme work must use a dedicated warning token; migrate legacy aliases before treating warning as a distinct status.

**The Visual-Color Isolation Rule.** User-selected territory/visual-item colors and Minecraft text formatting are content data. They must not be recolored by a global theme switch.

## Typography

**Display Font:** Manrope (fallback: ui-sans-serif, system-ui, sans-serif)  
**Body Font:** Inter (fallback: ui-sans-serif, system-ui, sans-serif)  
**Technical Font:** IBM Plex Mono (fallback: ui-monospace, monospace; proposed role, not yet loaded by the current app)

**Character:** Manrope gives section titles and key values a compact, confident shape. Inter remains neutral and highly readable for the dense operational interface. IBM Plex Mono is reserved for technical data where alignment and numeric distinction help scanning.

### Hierarchy
- **Display** (800, 30px, line-height 1.08, letter-spacing -0.035em): primary page title and rare high-emphasis display values. On narrow screens, the current implementation reduces h1 to 27px.
- **Headline** (700, 24px, line-height 1.14, letter-spacing -0.028em): major panel and section headings. On narrow screens, reduce to 22px.
- **Title** (700, 18px, line-height 1.2, letter-spacing -0.018em): card and subsection headings. On narrow screens, reduce to 17px.
- **Body** (400, 15px, line-height 1.55): explanatory text and longer content. On narrow screens, 14px is the current fallback.
- **Body Compact** (400–500, 14px, line-height 1.45): controls, dense descriptions, and compact card content.
- **Label** (600, 12px, line-height 1.35): field labels, metadata headings, status labels, and compact navigation copy.
- **Microcopy** (400–600, 11–12px, line-height 1.3–1.45): timestamps, secondary metadata, and captions. Do not use below 11px for essential information.
- **Technical** (500, 12px, line-height 1.4): coordinates, IDs, compact numeric metadata only; do not use for paragraphs.

### Named Rules
**The Two-Voice Rule.** Manrope is for display hierarchy; Inter is for all ordinary reading and controls. Do not introduce a third proportional typeface.

**The Weight Discipline Rule.** Normalize font weights to 400, 500, 600, 700, and 800. The current stylesheet requests 650 and 750 in places while the Google Fonts URL loads discrete 400–800 weights; replace intermediate values with the nearest intentional weight instead of relying on browser synthesis.

**The Technical Accent Rule.** Use IBM Plex Mono sparingly for coordinates and machine-like values. It is a proposed addition and must be loaded explicitly before use.

## Layout

Voxygen is a narrow, mobile-first application embedded in Telegram. The current main content wrapper is capped at 448px and fills available width. Keep this constraint as the default reading and interaction column; map canvases may use their own viewport behavior where required.

### Standardized spacing rhythm
Use a 4px base unit and the following preferred steps: 4, 8, 12, 16, 20, 24, and 32px. These values consolidate repeated paddings and gaps already found in the current interface. Prefer these steps over arbitrary values. One-off values are allowed only when required by a specific control or visual asset.

### Responsive behavior
- Primary target is a narrow mobile viewport inside Telegram WebView.
- Content width: 100%, capped at 448px for the main application column.
- At widths of 380px and below, preserve the existing compact typography adjustments: h1 27px, h2 22px, h3 17px, body paragraph 14px.
- Respect safe-area insets for fixed navigation, toasts, and bottom sheets.
- Controls must not cause horizontal overflow; long names and coordinates should wrap or truncate intentionally.
- The map is an exceptional full-area surface and must not be constrained by the text-column rules.

### Named Rules
**The Four-Pixel Rhythm Rule.** Layout spacing uses multiples of 4px wherever practical. A new theme cannot alter spacing to compensate for color or typography changes.

**The Mobile-First Atlas Rule.** Optimize the primary experience for a phone-width Telegram WebView first; desktop is a wider presentation of the same system, not a separate visual identity.

## Elevation & Depth

The current interface uses a hybrid depth model: tonal surface layers establish hierarchy, while low-opacity shadows, inset highlights, and restrained accent glows separate interactive surfaces. Depth should remain quiet; the map and territory content must remain visually dominant.

### Shadow Vocabulary
- **Low elevation** (`0 8px 22px rgba(0,0,0,.18)`): nested surface and compact interactive card.
- **Medium elevation** (`0 16px 42px rgba(0,0,0,.28)`): primary cards and panels.
- **High elevation** (`0 26px 70px rgba(0,0,0,.38)`): modal shells and overlays.
- **Purple action glow** (`0 14px 34px rgba(139,92,246,.17)`): primary action emphasis and selected interactive elements.
- **Mint confirmation glow** (`0 14px 34px rgba(65,255,167,.12)`): positive/curator emphasis only.

The navigation uses a stronger top shadow and a frosted backdrop (18px blur). The modal overlay uses a dark translucent scrim (78% black) with 4px blur. Provide opaque fallbacks so text remains legible if backdrop blur is unavailable.

### Named Rules
**The Surface-First Rule.** Establish hierarchy with surface tone before adding shadows. Shadows should clarify layering, not decorate every element.

**The Glow Is a Signal Rule.** Accent glow belongs to meaningful interactive or status emphasis; do not apply it to every card.

## Shapes

The current interface is softly rounded and tactile. The implementation already uses a range of radii; the following scale consolidates the common values into named roles:

- **Tight** (8px): compact icon controls and small nested elements.
- **Small** (10px): compact buttons, small fields, and status chips.
- **Control** (12px): standard button and input geometry.
- **Card** (16px): cards, panels, and grouped content.
- **Large Surface** (20px): elevated cards and broad surfaces.
- **Modal** (22px): modal shell.
- **Pill** (999px): badges, segmented tracks, chips, and fully rounded toggles.

Use a 1px border for standard card and field outlines. Use a 2px focus outline with a 3px offset for keyboard-visible focus; never use border thickness alone to indicate focus. Slider tracks are 4px high, with an 18px thumb and a 2px contrasting outline.

## Components

Components should feel deliberate, compact, and easy to operate with one thumb. The current code has shared styling patterns but many controls are still implemented as individual buttons with inline styles. The specs below are the standard to converge on, not a claim that a complete component library already exists.

### Buttons
- **Primary:** Purple fill, white text, subtle purple glow; standard target height 44px; 12px radius; horizontal padding 16px.
- **Success:** Mint fill, dark text (#06120D); use only for positive confirmation or clearly successful actions.
- **Secondary:** raised surface fill, primary text, 1px quiet border; no glow by default.
- **Destructive:** red text on a red-soft surface for secondary destructive actions; solid danger fill only when the destructive action is the clear primary action.
- **Ghost / Icon:** transparent or raised-surface background; maintain a clear 40–44px touch target even when the icon itself is 16–20px.
- **Disabled:** reduce emphasis and prevent transforms; retain readable text and a visible disabled state.
- **States:** hover (fine pointer only) may lift 1px; active uses a brief press response; focus-visible uses a 2px purple outline with 3px offset; disabled has no hover/press transform.

### Iconography & Icon Buttons

**Source:** [Lucide Icons](https://lucide.dev/icons/) is the canonical icon library for Voxygen. In React, use the pinned `lucide-react` package; do not mix in unrelated icon packs or emoji as substitutes for interface icons.

- Use Lucide's consistent outline geometry; keep stroke weight consistent (normally 2).
- Standard inline icons are typically 16–20px; larger sizes are reserved for prominent controls.
- Icons inherit semantic text/action color (`currentColor`) rather than hard-coded palette values.
- Icon-only actions must have a meaningful `aria-label`; a `title` may supplement it but does not replace accessible naming.
- Preserve a 40–44px interactive hit area on touch devices even when the glyph is smaller.
- Use shared `IconButton` variants (neutral, primary, success, danger, ghost) instead of ad hoc icon-button geometry. Variant color must follow the semantic separation rules above.
- Decorative icons should be hidden from assistive technology; meaningful status icons need accompanying text or an accessible label.

### Cards / Containers
- **Default Card:** deep surface, 1px quiet border, 16px padding, 16px radius.
- **Raised Card:** raised surface, 1px quiet border, 12–16px padding, 16–20px radius, low/medium shadow depending on hierarchy.
- **List Item:** compact horizontal layout, 10–12px padding, 16px radius, subtle purple border emphasis on hover/selection.
- **Recruitment / Review Cards:** preserve their specific content hierarchy and signature entrance treatment; avoid adding generic decoration.
- **Inventory / Visual Cards:** user-selected visual colors belong to the item content and must remain independent from the theme palette.

### Inputs / Fields
- **Style:** raised surface, 1px quiet border, 12–14px radius, 10–12px vertical and 12px horizontal padding, Inter 14px.
- **Focus:** purple border plus a 3px translucent purple focus halo. The current stylesheet contains an earlier mint focus rule and a later purple rule; the later, more specific rule is the effective text-input focus treatment.
- **Error:** danger border/text and concise inline explanation.
- **Disabled:** visibly inactive; preserve enough contrast to identify the field and its current value.
- **Labels:** 12px Inter 600, muted text; keep labels visible rather than relying on placeholder text.

### Segmented Controls / Chips
- **Track:** raised surface, pill radius, 3px inner padding.
- **Options:** pill radius, 7px vertical and 14px horizontal padding, 13px text.
- **Selected:** Purple fill and white text.
- **Unselected:** transparent fill and muted text.
- **Status Chips:** pill silhouette; use semantic token + subtle matching border/surface. Do not use the primary action style for passive status labels.

### Badges
- **Score Badge:** pill silhouette, 1px tinted border, 8px 12px padding, bold Manrope, and a small role-specific icon.
- **Curator / Inspector:** mint family.
- **Community / Player:** purple family.
- **Gem Balance:** cyan family, strictly economy-specific.
- Keep score type and status distinguishable by text/icon as well as color.

### Navigation
- **Bottom Navigation:** fixed, dark translucent base, top divider/highlight, 18px backdrop blur, purple active state. Maintain safe-area padding.
- **Territory Tabs:** use the segmented-control language; selected state is purple.
- Navigation icons use Lucide outline style, typically 16–20px. Keep stroke weights consistent within a row.

### Modals / Bottom Sheets
- **Modal Shell:** deep surface, 1px quiet border, 22px radius, 18px padding, maximum width 448px, maximum height constrained to viewport.
- **Overlay:** rgba(0,0,0,.78) with 4px blur; closing state must disable pointer interaction.
- **Bottom Sheet:** same surface and border language, anchored to the bottom, respects safe-area insets.
- **Motion:** modal entrance/exit uses the shared modal timing; do not introduce per-modal unrelated motion curves.

### Toasts / Feedback
- **Success:** mint-soft surface, mint border/text.
- **Error:** red-soft surface, red border/text.
- **Warning:** must become a dedicated amber/yellow semantic token; current code incorrectly maps warning to the mint/gold alias.
- Feedback must not rely on color alone; include an icon or clear message where appropriate.

## Do's and Don'ts

### Do:
- **Do** keep Purple, Mint, Gem Cyan, and Danger Coral in their defined semantic roles.
- **Do** use Manrope for display hierarchy and Inter for body/control text.
- **Do** use the 4px spacing rhythm and the named radius scale.
- **Do** maintain a 44px minimum primary touch target where layout permits; compact icon controls should still have a 40–44px hit area.
- **Do** use 1px default borders and a distinct 2px keyboard focus outline.
- **Do** preserve user-generated Minecraft formatting and user-selected visual-item colors.
- **Do** test new themes at phone widths, especially 380px and below.
- **Do** check text and control contrast for every theme; the source code does not contain a completed WCAG contrast audit.

### Don't:
- **Don't** encode component styling by matching inline style strings; migrate toward semantic classes/components and token references.
- **Don't** use Mint as both success and warning.
- **Don't** recolor Gem Cyan, user visual colors, or Minecraft text colors as generic theme accents.
- **Don't** create new font families for individual screens.
- **Don't** use arbitrary font weights such as 650 or 750 in the standardized type scale.
- **Don't** add shadows or glows to every surface.
- **Don't** use color as the only way to communicate status.
- **Don't** change layout geometry, type hierarchy, or interaction states when creating a color-only theme.

---

## Implementation Notes

This document captures the current Voxygen implementation and defines a normalized target standard. The app currently centralizes much of its global styling inside `FontsAndTheme()` in `src/App.jsx`, but many component styles remain inline. The current app does not yet have a complete token-driven theme architecture.

Before implementing selectable themes:
1. Move the semantic tokens into a dedicated theme layer (CSS variables or a typed theme object).
2. Replace legacy `--gold` / `--emerald` aliases with explicit semantic tokens (`--success`, `--warning`, `--danger`, `--info`).
3. Introduce reusable Button, Badge, Card, Input, Segmented, Modal, and Toast primitives only where repeated intent is confirmed.
4. Replace inline style-string selectors with semantic classes or component variants.
5. Keep geometry, typography, spacing, and component states in Voxygen Core; allow theme packs to override color, surface, shadow, and effect tokens only.
6. Add screenshot regression coverage for the four main sections and important modal/form states before migrating the existing UI.
