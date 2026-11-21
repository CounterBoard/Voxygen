# Voxygen Design System

**Status:** current implementation baseline and theme-authoring contract (updated 15 Nov 2026; PR #19 merged)  
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
primary action, mint positive/curator accent and warning treatment, red
destructive states and a neutral informational role. Cyan is reserved for gem
currency. The theme uses Manrope display typography and
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
slider geometry, focus treatment, app and modal content widths, icon-button sizing,
segmented controls, shared fields and the simple modal primitive through
theme tokens. Many screen-specific inline styles and legacy style-string
selectors remain to be migrated. It does not yet add a theme
picker, download remote theme packs, or introduce third-party theme
execution.

Theme packs remain trusted, versioned code shipped with the application.
Do not accept arbitrary CSS, JavaScript, font URLs or executable theme
payloads from users or the database.


## 9. Shared UI primitives (migration status)

The shared primitives currently live beside the application composition in
`src/App.jsx`. They are intentionally behavior-light: they own presentation
and accessibility defaults, while callers continue to own state and actions.

| Primitive | Contract | Migration status |
|---|---|---|
| `Button` | primary, neutral, success, danger and ghost actions; size and full-width options | Variants, sizing, typography, radius and spacing tokenized; rollout in progress |
| `IconButton` | icon-only action with required accessible label and semantic variants | Surface, geometry, glyph size/stroke and variants tokenized; rollout in progress |
| `SurfaceCard` | base, raised and elevated theme surfaces | Added; applied to a territory-management panel |
| `Slider` | shared range geometry with player/inspector/warning variants | Added; applied to map zoom and territory rating |
| `Field` | single-line input with tokenized control geometry, labels, hints and errors | Control typography, label/message rhythm and validation states tokenized; rollout in progress |
| `TextAreaField` | multiline input with tokenized surface, border, typography and radius | Control and multiline line-height, label/message rhythm tokenized; rollout in progress |
| `SelectField` | native select with tokenized control geometry | Control typography and label rhythm tokenized; rollout in progress |
| `Segmented` | compact mutually-exclusive option group with pressed state | Existing; migration in progress |
| `ToggleField` | accessible switch with label/description and disabled state | 3 uses; geometry, typography and motion tokenized |

### Primitive rules

- Prefer semantic variants over caller-supplied colors for standard actions.
- Keep native form controls and their keyboard behavior; never replace them
  with decorative elements.
- Preserve controlled values, callbacks, validation, loading and disabled
  behavior during migration.
- Label, hint and error text must be associated with the relevant control;
  invalid state must be programmatically exposed, not only colored.
- Focus-visible, disabled, selected and error states are part of the
  component contract, not optional screen decoration.
- Screen-specific spacing may remain a caller override; core appearance
  (surface, typography, border, radius and control geometry) comes from tokens.
- A primitive is not considered fully migrated until representative uses
  and responsive/accessibility checks have been completed.


## QA and release verification

The automated theme/UI contract regression test is `tests/theme-ui-contract.test.js`; it is run by the existing `npm test` CI step. The manual Telegram WebView and responsive checklist is maintained in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md). A passing CI build does not constitute a completed visual QA pass.


## 10. Theme-tokenized toggle control

The shared `ToggleField` keeps its switch semantics and caller-owned state,
but all visual geometry and label/description typography are controlled by
the `--theme-toggle-*` token family: track and thumb dimensions, inset,
row rhythm, label scale/weight/line-height and description scale/rhythm.
The transition uses the shared motion/easing tokens. This lets a shipped
theme reshape settings switches without editing component behavior.

## 11. Theme-tokenized action buttons

The shared `Button` primitive now delegates its font weight, line height,
corner radius and internal icon/text gap to the `--theme-button-*` token
family. `IconButton` delegates icon glyph size and stroke weight to
`--theme-icon-button-glyph-*` tokens. Semantic variants, size presets,
disabled behavior, accessible labels and caller overrides remain intact.

## 12. Theme-tokenized form field rhythm

`Field`, `TextAreaField` and `SelectField` now use shared tokens for
label-to-control spacing and hint/error spacing. Single-line controls and
native selects use the control line-height token; multiline controls use a
separate textarea line-height token. Native input/select/textarea semantics,
validation attributes, error announcements and caller style overrides remain
unchanged.

## 13. Theme-tokenized section headings and reaction actions

`SectionTitle` uses theme tokens for title/count typography, icon-to-title
spacing and bottom rhythm, and semantic primary/muted text roles.
`reactBtn` uses tokens for icon/label gap, label size and active/idle weight.
The active reaction keeps its warning semantic role; Vox renders that role
with the theme's mint warning treatment rather than an extra gold or violet accent.

## 14. Theme-tokenized player avatar

`AvatarHead` uses semantic theme roles for the fallback background and
foreground, a shared avatar radius, and the semantic border color for loaded
skins. The caller-provided size, skin image, alt text, load-error fallback
and source-change retry behavior are preserved.

## 15. Theme-tokenized score badge presets

`ScoreBadge` delegates radius, shadow, weight, line-height and the complete
small/default/large/recruitment geometry (padding, minimum height, type size,
icon size and gap) to the `--theme-score-badge-*` token family. The curator
and community color mapping, labels, numeric formatting and recruitment
modifier classes are deliberately unchanged.

## 16. Migration from legacy style aliases

The main application styles now consume semantic `--theme-*` roles directly
instead of the legacy color, surface, typography-state, shadow, glow, motion
and radius aliases. The compatibility bridge remains available for code not
yet migrated. The protected gem color is referenced explicitly as
`--content-color-gem`; slider fill/progress and map-marker inverse scale stay
component-local custom properties rather than being treated as theme roles.


## 17. Explicit semantic border and action contrast roles

Success and warning states now have separate border tokens instead of sharing
the ambiguous legacy mint-strength alias. This keeps toast borders and curator
score borders aligned with success, while warning toast borders follow warning.
Primary-action inline styles use the theme's action-contrast token rather than
hard-coded white. Status foregrounds and the protected gem color remain
independent semantic roles.


## 18. Theme-aware overlays and state-control contrast

Modal scrims, full-screen overlays, primary-action focus rings, and status
button contrast now use dedicated theme roles. Warning buttons preserve their
warning background, warning contrast foreground, warning border and warning
glow; they are no longer styled as success actions. Primary and success
controls consume their own contrast tokens. This migration deliberately leaves
Minecraft formatting, visual-equipment palette values, territory colors and the
gem content color unchanged.


## Semantic hover states and protected visual palettes

Reusable success, primary-action and neutral hover treatments must use theme tokens rather than literal Vox accent RGB values. Confirmation halos and toast borders follow the success roles; action-focused hover borders/glows follow the primary-action roles; neutral card borders follow the strong-border role. User-selected colors in the Visual customization palette are content data, not interface chrome, and must not be recolored by theme migration.


## Image overlays and bottom navigation

Modal dimming, persistent bottom navigation, and controls layered over user-provided
media consume theme tokens. User-provided map and screenshot imagery remains content;
only surrounding controls, borders, and metadata text follow the active theme.
Territory headers use a generated color gradient rather than an uploaded cover image.
The visual editor's explicit palette colors remain protected content.


## Depth, elevation, and inset highlights

Slider-thumb, toast, and navigation shadows are theme roles rather than
component-local color literals. Neutral inset highlights on cards are
separate tokens, so themes can tune surface material and elevation while
preserving semantic success borders and protected content colors.


## Global typography rhythm

Theme typography includes line-height roles for headlines, titles, small
labels, form fields, buttons, and inline text. Form-field size is also a
semantic role. Avoid introducing component-local values for these shared
typographic patterns when an existing role applies.


Display and heading letter spacing, paragraph spacing, and button weight are
part of the theme typography system. Preserve their hierarchy through semantic
roles rather than hard-coded component styling.


Recruitment-card sheen and map-marker hover depth are theme-controlled
decorative effects. Do not confuse these interface treatments with the
colors or pixels of user-provided visual assets.


Toast elevation is consistent across success, warning, and error states;
status colors remain distinct. Form focus combines the semantic focus ring
with a neutral theme shadow. The account switcher uses the shared card radius
and a theme-controlled internal padding role.


Range-slider thumb depth must match across WebKit and Firefox. Territory banner
titles use the theme-owned readability shadow over a generated palette gradient.


## Bottom navigation and mobile viewport geometry

The persistent bottom navigation now takes its padding, item minimum height,
icon size, label size and internal gap from dedicated theme roles. Its lower
padding includes `env(safe-area-inset-bottom)`, so the controls remain clear
of the home indicator and device gesture area. The app root uses the dynamic
viewport height (`100dvh`) with a `100vh` fallback for older WebViews. The
navigation item minimum height is 44 px; the theme may adjust it while keeping
an accessible touch target.


## Compact-screen typography

The narrow-screen type scale (display, headline, title and body copy) is
controlled by dedicated compact typography tokens. The existing 380 px
breakpoint and its visual hierarchy are preserved; themes can adjust the
smaller-screen scale without changing the responsive rules or component
markup.


## Modal geometry and viewport safety

Modal overlays have a theme-controlled default inset so dialogs without a
component-specific padding no longer sit flush against the device edges.
Each dialog keeps its existing height tier, now capped by the dynamic viewport
minus a shared vertical safety inset. Modal radius and content padding use
shared geometry roles. Full-screen experiences that explicitly set zero or
custom overlay padding retain that explicit behavior.


The viewport cap has a `100vh` fallback token and switches to `100dvh`
inside an `@supports` rule when the dynamic viewport unit is available.


Modal shells are excluded from the generic inline-surface card selectors.
This preserves their dedicated modal radius and high elevation rather than
letting ordinary surface-card treatment flatten the dialog hierarchy.


The generic surface selectors also exclude the shared `SurfaceCard` primitive.
Its explicit tone, radius, shadow and caller overrides therefore remain the
component's source of truth rather than being replaced by broad style-attribute
selectors.


## Toast geometry and viewport spacing

The fixed toast's bottom offset (including the device safe area), maximum
width, horizontal viewport gutter, compact content padding (**8 px vertical /
12 px horizontal**), pill radius and text metrics are controlled by dedicated
theme roles. Its width is content-driven (message width plus padding), with the
maximum width and viewport gutter acting only as safety caps. This allows the
notification treatment to adapt without changing timing, priority, accessibility
announcement or status colors.


The account switcher's inset highlight now uses the shared soft surface
highlight role rather than a component-local white RGBA value. Its surface
depth and layout remain unchanged.


## Repeated card geometry

The recurring list, review and recruitment cards now use shared theme roles
instead of local numeric radius and padding values. List/recruitment cards use
`--theme-radius-card`, review cards use `--theme-radius-control`, and their
spacing comes from `--theme-space-2`, `--theme-space-3` and
`--theme-space-4`. This is a scoped first pass, not a claim that every legacy
panel/card inline style has been migrated.


### Base surface panels

Repeated standard surface panels share `--theme-radius-card` and `--theme-recipe-surface-padding` (10 px) for radius and inner spacing. Individual visual-item cards retain their own existing composition and padding.


### Compact raised panels

Territory-management raised panels use `--theme-radius-control` and 10 px inner padding. Other raised panel variants remain screen-specific and should be reviewed before migration.


## Theme authoring workflow

For the practical step-by-step workflow, component checklist and release gate, see [THEME_AUTHORING_GUIDE.md](./THEME_AUTHORING_GUIDE.md). Keep this architecture/design contract as the source of truth; the guide is its implementation companion.


## Token reference

Use [THEME_TOKEN_REFERENCE.md](./THEME_TOKEN_REFERENCE.md) as the searchable index of the current theme-specific CSS roles and Vox baseline values. The CSS pack remains authoritative.

For the complete practical rules covering spacing decisions, component geometry, semantic colors, inline feedback and FixedToast behavior, see [INTERFACE_RULES.md](./INTERFACE_RULES.md). This guide consolidates the current implementation rules and clearly marks areas that are still screen-specific or not centralized.


## Component recipes (first pass)

Button and IconButton semantic variants now resolve their visual values through
`--theme-recipe-button-*` and `--theme-recipe-icon-*` roles in the active theme
pack. The React primitives keep variant names, accessibility and behavior stable;
a theme can independently retune each variant's background, foreground and
border without editing component code. Segmented active/idle states and Field/TextAreaField/SelectField shared geometry
now use the same recipe layer. Field background, foreground, border, radius and
padding are independently adjustable. Recipe roles are aliases to the semantic
color system in Vox, not a second source of color meaning.


## Surface recipes

The shared `SurfaceCard` primitive now resolves base/raised/elevated fills,
border, foreground, shadow and default geometry through `--theme-recipe-surface-*`.
Explicit per-instance radius/padding overrides remain supported, so component
recipes centralize defaults without removing layout-level flexibility. Vox recipes
map back to semantic surface, border, text and elevation roles.


## Toggle recipes

`ToggleField` now separates checked/unchecked track background and border from
thumb colors using `--theme-recipe-toggle-*` roles. This lets themes tune switch
contrast and checked-state emphasis independently while preserving the switch
semantics, dimensions and interaction behavior.


## Shared Vox component geometry and state contracts

The following implementation details are part of the current default Vox
baseline. They preserve behavior while standardizing repeated visual patterns.

### Section rhythm

Event reminder unit switch uses one clipped outer shell with the same control radius as the amount field and confirmation button. Two equal halves fill the shell edge-to-edge; the selected half uses primary purple, the unselected half uses the raised surface, and neither inner half has rounded corners. The shell is excluded from the generic card-radius override.

Use `--theme-layout-section-gap: 8px` between adjacent independent
cards/sections at the same hierarchy level. Do not use it for label-to-field
spacing, inline control gaps, or content padding inside a card. The searchable
token index in `THEME_TOKEN_REFERENCE.md` lists this role.

### Textarea composition

`Field`, `SelectField` and `TextAreaField` keep their default bottom wrapper spacing
(`--theme-space-3`). Each accepts an optional `containerStyle` override to tune
only the outer wrapper. Event create/edit forms set wrapper bottom margin to 0
and apply an explicit 12 px gap before the next field group, avoiding doubled
spacing. Avoid stacking wrapper margin, textarea margin and the next action's
top margin. The territory recruitment and additional-information forms use a
compact 8 px gap before their action row.

### Tags and selected states

Visual category filter chips use a neutral border
(`--theme-color-border-strong`) while unselected. The selected chip uses
the primary border/background/foreground roles. Selection remains a state
of the filter model, not a separate visual-only toggle.

### Icon controls and screenshot overlay

The screenshot Lightbox close control and territory-page back/exit control
share a 44×44 px touch target. Icon glyphs are centered inside their controls.
The Lightbox close control retains its own overlay positioning and close
handler.

### Review publication

The review-compose action remains a 44×44 px square with a 12 px radius.
Its background and icon contrast are role-aware: primary/purple for a resident
and success/mint for an inspector. The existing role predicate and publish
handler remain authoritative; theme styling must not change who can publish.

### Profile and territory details documented in Functional_System.txt

The current Vox implementation also uses the shared section gap, a flexible
treasury amount field with a fixed 120 px `Пополнить` action, full-width
resident invitation row, centered resident action icons, mint/success
selection state, a separate territory-appearance surface, interactive
Telegram usernames in additional information, root-portal FixedToast
notifications, and a 44×44 review-compose button. Their exact scope and
preserved behavior are recorded in Functional_System.txt sections 56–58.

## Field interaction colors

Editable text, numeric and select fields use Purple borders at rest and transition to Mint border/focus halo while focused. The inspector review field reverses that mapping: Mint at rest, Purple while focused. The mapping is expressed through shared field recipe tokens, including a transition role; invalid fields retain danger semantics.

## Reminder, profile and theme picker details

The event reminder unit switch, amount field and confirmation action share the same control radius. The switch keeps two flush, square inner halves. Profile and Visual bottom clearance is 85 px plus safe area; the final territory actions keep 10 px below. The theme picker uses a two-line Vox description, omits the one-theme availability notice, and renders arrow outlines/glyphs in Purple on a soft Purple surface, matching the territory-navigation action. The equipped visual uses a Mint outline around its image preview instead of a check badge. FixedToast remains content-width with 12 px horizontal padding and 14 px text, entering and exiting behind the bottom navigation. Repeated identical territory messages get a fresh toast instance. No backdrop filter or blur is used. The toast plate itself is darkened for legibility; the underlying interface remains sharp.

## Profile visual tiles and toast motion

Profile «Оформление территории» and «Покупки» grids use image-first tiles without visible item names or padded thumbnail cards. Markers and earned city awards use four columns. The equipped marker is identified by a Mint outline around the image itself, never by a check badge. Territory «Баннер» is a generated gradient selected from the Visual color palette; cover-image items are retired. Resident read-only additional information renders usernames as plain text, not Telegram links.

FixedToast is content-sized with 12 px horizontal padding and 14 px text. It sits in a clipped viewport whose bottom aligns to the navigation top (69 px plus safe area), leaving a 4 px gap. The viewport uses z-index 65 to remain visible above modal overlays and clips enter/exit motion at the navigation edge, so the toast still emerges from behind the bar. Error notifications remain red. The reminder unit selector has two equal-width flush halves; its inner halves have no radius, border or press-scale transform.


Disabled theme-picker arrows retain their Purple outline and glyph without disabled-state desaturation. Equipped inventory tiles use a dedicated higher-specificity Mint image outline, protected from the generic raised-surface border rule. Non-interactive Telegram usernames inherit the surrounding text color instead of using the Mint link accent.


Visual purchase, treasury deposit and territory donation all route «Недостаточно самоцветов» through the root error toast, never inline in the card or modal. The shared viewport stays above modal overlays while clipping movement at the navigation top edge.


### Toast contrast and semantic glow (20.11.2026)

Error toasts use a danger/red halo and glow animation; they must not flash Mint/success. Success toasts keep Mint/success glow, and warning toasts keep warning semantics. Each toast plate is darkened by mixing its semantic soft background (88%) with black (12%). FixedToast does not blur, dim or filter the page behind it: no `backdrop-filter` or `-webkit-backdrop-filter`. This intentionally avoids a Liquid Glass treatment.


### Sliding segmented selection and toast contrast (21.11.2026)
### Profile settings viewport alignment (21.11.2026)

The profile settings dialog is vertically centered in the area above the fixed bottom navigation. The overlay reserves the navigation's 69 px height plus 12 px clearance, as well as device safe areas; the dialog's maximum height is constrained to the remaining region. This removes the visual collision with bottom navigation while balancing the previously excessive top whitespace. Modal width, inner spacing, shape and scroll behavior are preserved.


The «Набор» / «Карта» / «Рейтинг» main tabs and «По инспектору» / «По игрокам» rating selector use a shared interaction principle: one Purple selection surface physically slides to the newly selected position. The text and icon in the selected segment are white; inactive labels remain muted. The indicator uses a 280 ms ease transition and respects reduced-motion settings. Existing control dimensions, placement and pill geometry are preserved.

FixedToast plates have been darkened further to 45% semantic-soft color plus 55% black. Only the plate changes; the underlying interface remains sharp and is not blurred or filtered.


## Event cards, temporary visual discounts and territory banners

Event cards keep their identifying information in the collapsed header. Expanding a card reveals only the description, reminder controls and available actions; it does not repeat the title, date, territory or coordinates. Event creation and date changes are capped at two calendar months ahead, with matching client and server validation. Event cover uploads and previews are removed.

Temporary visual discounts are reflected in the displayed catalog price and in the actual purchase debit. The original amount is muted and struck through in danger red; the discounted amount uses the existing gem color and gem icon. Banker commands can set a percentage for all visuals, exact visual names or tags, then reduce the active percentage by percentage points or remove it when it reaches zero.

The territory «Баннер» replaces the former cover-image slot. It is a gradient generated from one selected color in the existing Visual palette. In the profile layout it sits above «Метка»; earned and inspector-awarded «Награды» are shown directly below the marker inventory.
