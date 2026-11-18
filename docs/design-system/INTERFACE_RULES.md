# Voxygen Interface Rules — spacing, color, components and feedback

**Scope:** current default theme Vox and the shared interface contracts in `main`.  
**Purpose:** one practical reference for choosing spacing, colors, component geometry and feedback behavior without changing product logic.  
**Sources of truth:** `src/theme/theme-tokens.css` (actual token values), `src/App.jsx` (current component implementation and notification behavior), `docs/design-system/DESIGN.md`, `THEME_TOKEN_REFERENCE.md`, `THEME_ARCHITECTURE.md`, `Functional_System.txt`.

> This guide describes the current implementation. The design system is still being migrated: some legacy screens retain local inline values. A local value found in one screen is not automatically a global rule. Where the code does not provide one universal rule, this guide says so explicitly.

---

## 1. The hierarchy of rules

When implementing or reviewing an interface element, apply rules in this order:

1. **Meaning / semantic role:** primary action, success, warning, destructive action, information, neutral content.
2. **Shared component contract:** Button, IconButton, Field, TextAreaField, SelectField, SurfaceCard, ToggleField, Segmented, Slider, SectionTitle, ScoreBadge.
3. **Theme tokens:** color, spacing, radius, type, size, shadow and motion.
4. **Screen composition:** layout-specific spacing, alignment, width and grouping.
5. **Local exception:** only when the screen has a clear reason; keep it scoped and document it.

A theme changes visual values, not component meaning, behavior, permissions, API calls or content data. Prefer semantic tokens and shared primitives over hard-coded Vox colors or arbitrary new pixel values.

## 2. Spacing system

### 2.1 Shared spacing scale

The Vox spacing scale is:

| Token | Value | Typical role |
|---|---:|---|
| `--theme-space-1` | 4 px | Very close relationship: icon/text micro-gap, label-to-field, compact inner details |
| `--theme-space-2` | 8 px | Related controls, button icon/text gap, compact field/action rhythm, section heading gaps |
| `--theme-space-3` | 12 px | Default field wrapper bottom rhythm; compact card padding; standard section-to-section gap where specified |
| `--theme-space-4` | 16 px | Standard card/surface inner padding; normal horizontal content inset |
| `--theme-space-5` | 20 px | Larger heading/display separation and larger button horizontal padding |
| `--theme-space-6` | 24 px | Spacious modal content grouping |
| `--theme-space-8` | 32 px | Available scale step; no broad usage was established in the inspected App.jsx |

These are a scale, not a rule that every distance must be one of these values. A component-specific token or documented screen composition can take precedence.

### 2.2 Standardized gap between independent sections

`--theme-layout-section-gap` = **12 px**.

Use this between adjacent independent cards or sections at the same hierarchy level. Examples:

- profile account card → Purchases → Treasury → territory management sections;
- independent management sections such as Founders/Mayors, Residents, Territory appearance and Recruitment;
- other peer cards that form a vertical page stack.

The profile page uses a flex column with this token as its `gap`. Its direct children have bottom margins neutralized to prevent double spacing.

Do **not** use this token for:

- label → its input;
- icon → text inside one button;
- controls in the same input/action row;
- paragraphs inside a card;
- padding inside a card;
- nested details that belong to one logical group.

If two elements are part of one operation, use an internal gap, not the independent-section gap.

### 2.3 Field rhythm

Shared field primitives use:

- `--theme-field-label-gap` = `--theme-space-1` = **4 px**;
- `--theme-field-message-gap` = `--theme-space-1` = **4 px**;
- outer `Field`, `TextAreaField` and `SelectField` wrapper bottom margin defaults to `--theme-space-3` = **12 px**.

This is the default vertical rhythm between separate field groups. It is not an instruction to add another 12 px below the native input itself.

**Local compact composition:** `TextAreaField` accepts optional `containerStyle` to adjust only its outer wrapper. In the territory recruitment and additional-information forms, the wrapper bottom margin is set to 0 and the following action row gets an explicit **8 px** top gap. This avoids stacking wrapper margin + textarea margin + action-row margin.

Example:

```jsx
<TextAreaField
  value={description}
  containerStyle={{ marginBottom: 0 }}
  style={{ width: '100%' }}
/>
<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
  {/* actions */}
</div>
```

Do not copy this exception to every textarea. Other forms retain the default wrapper rhythm unless their composition is deliberately compacted.

### 2.4 Component-internal spacing

| Component / composition | Current role |
|---|---|
| Button icon ↔ label | `--theme-button-gap` = space-2 = 8 px |
| Segmented options | space-1 = 4 px; segmented shell padding also space-1 |
| Field label ↔ control | field-label-gap = 4 px |
| Field hint/error ↔ control | field-message-gap = 4 px |
| SectionTitle icon ↔ title | `--theme-section-title-gap` = 8 px |
| SectionTitle bottom rhythm | `--theme-section-title-bottom-gap` = 8 px |
| Toggle row gap | `--theme-toggle-row-gap` = 12 px |
| Toggle description gap | `--theme-toggle-description-gap` = 4 px |
| Reaction icon ↔ label | `--theme-react-action-gap` = 4 px |
| ScoreBadge gaps | 4 px for small/default/recruitment; 8 px for large |
| Standard SurfaceCard padding | space-4 = 16 px |
| Compact raised panels | radius-control + space-3 = 12 px padding |
| Repeated list/recruitment cards | spacing uses space-2/3/4 according to the card composition |

### 2.5 Card and surface padding

- Standard `SurfaceCard`: default inner padding **16 px** (`--theme-space-4`).
- Base card radius: **16 px** (`--theme-radius-card`).
- Compact raised panels documented in the design architecture: **12 px** padding and **12 px** control radius.
- Modal overlay default outer inset: **16 px** (`--theme-modal-overlay-padding`).
- Modal content padding: **18 px** (`--theme-modal-content-padding`).
- Account switcher padding: **14 px 16 px**.
- Individual older panels may still use local values. Do not assume every inline-styled panel has already migrated to SurfaceCard.

### 2.6 Layout rules

- Keep related controls in one row when they form one action; allow the flexible field to take remaining width and keep the action's target geometry stable.
- Use `minWidth: 0` on flexible row children where long text/input content could force overflow.
- Align icon buttons and their glyphs with flex centering; do not rely on baseline alignment.
- Independent sections should share a common left/right content edge.
- Avoid multiple competing margin sources. Choose one owner for vertical distance: parent `gap`, child margin, or explicit spacer.
- Use full available width for page-level form rows unless a narrower width is an intentional constraint.
- Preserve safe-area space and scrollability; do not solve a spacing issue by clipping content.

## 3. Geometry: controls, corners and viewports

### 3.1 Control sizes

| Token / contract | Vox value |
|---|---:|
| Standard control height | 44 px |
| Compact control height | 36 px |
| Standard navigation item minimum height | 44 px |
| Shared icon-button token size | 40 px |
| Territory page exit and screenshot Lightbox close controls | 44 × 44 px |
| Resident promotion/removal controls | 34 × 34 px |
| Review publish action | 44 × 44 px, square |
| Territory resident-add icon action | 44 × 44 px |

The actual screen-specific contracts above may deliberately override the generic 40 px icon-button token. A requested 44 px touch target must not silently become 40 px.

Button primitive sizes:
- `sm`: min-height 36 px, horizontal padding 12 px;
- `md`: min-height 44 px, horizontal padding 16 px;
- `lg`: min-height 52 px, horizontal padding 20 px.

A paired input/action row does not imply equal widths. The field should normally flex into available space; the action should be sized for its label and stable geometry. For the treasury row, the current documented action width is 120 px and the amount field takes the remaining width.

### 3.2 Radius scale

| Token | Value | Typical role |
|---|---:|---|
| radius-xs | 8 px | small compact elements |
| radius-sm | 10 px | small panels/controls |
| radius-control | 12 px | inputs, buttons, compact controls |
| radius-card | 16 px | standard cards |
| radius-large | 20 px | larger surfaces |
| radius-modal | 22 px | modal shells |
| radius-pill | 999 px | chips, pill badges, toast |

Specific action shapes matter: an icon-only review publish button remains square (44 × 44) with 12 px radius; it must not become a wide text button.

### 3.3 Responsive and safe-area geometry

- Content max width: **448 px**.
- Modal max width: **448 px**.
- Modal vertical safety inset: **48 px**; height is capped against the available viewport.
- Modal height tiers: compact 70vh, standard 76vh, form 80vh, settings 84vh, expanded 88vh, editor 90vh, additionally bounded by safe viewport height.
- App root uses 100vh fallback and 100dvh when supported.
- Bottom navigation uses safe-area-aware bottom padding: `calc(14px + env(safe-area-inset-bottom))`.
- Toast bottom offset: `calc(76px + env(safe-area-inset-bottom))`.
- Navigation item minimum height is 44 px.
- Compact typography breakpoint documented by the design system: 380 px.

## 4. Color system: choose by meaning, not by screen

### 4.1 Vox palette

| Semantic role | Vox color | Use it for | Do not use it for |
|---|---|---|---|
| Primary / purple | `#8B5CF6` | Main actions, selected states, active navigation, focus | success confirmation or destructive action |
| Success / mint | `#41FFA7` | Successful completion, positive state, inspector/curator-positive accent, approved/selected positive affordance | warning or danger |
| Warning / mint | aliases success mint tokens | Caution, pending/attention state | purple primary or destructive error |
| Danger / red | `#FF5D73` | Errors, destructive actions, remove/delete | ordinary neutral actions |
| Info | `#67B7FF` | Neutral informational emphasis | protected gem currency or automatic replacement of content colors |
| Gem / cyan | `#38BDF8` | Gem currency/content marker | generic interface accent |
| Neutral text/surfaces | theme neutral roles | content hierarchy, cards, fields, borders | semantic status replacement |

The gem color is protected at `:root` as `--content-color-gem`; it is not a theme accent.

### 4.2 Surface hierarchy

| Role | Vox value | Meaning |
|---|---|---|
| Canvas | `#0A0B10` | app background |
| Surface | `#12151D` | base cards/panels |
| Surface raised | `#171B24` | controls, nested/raised panels |
| Surface elevated | `#1D2230` | higher layer |
| Surface overlay | `rgba(5, 7, 12, .78)` | translucent overlay surface |
| Overlay scrim | `rgba(0, 0, 0, .82)` | darken content behind modal/full-screen layer |

Keep these levels visibly distinct. Do not use the app canvas as the background of every nested card.

### 4.3 Text and border hierarchy

- Primary text: `#F7F8FC` — main labels, titles and important values.
- Secondary text: `#B5BBCB` — supporting information.
- Muted text: `#7F879A` — metadata, secondary hints.
- Subtle text: `#636B7E` — lowest-emphasis supporting labels; check contrast.
- Neutral border: `rgba(181, 187, 203, .12)` — quiet card/field separation.
- Strong border: `rgba(181, 187, 203, .22)` — controls/chips that need a clearly visible neutral outline.

Use the strong border for unselected Visual filter tags. Selected tags use the primary border. A neutral border should not disappear on a raised surface.

### 4.4 Semantic variants and state colors

Use paired background, foreground, border and focus/glow roles. Do not select only the foreground color and leave a conflicting background.

- **Primary button/selected chip:** primary background + primary contrast foreground + primary border.
- **Neutral button/unselected chip:** raised neutral surface + primary text/muted text as appropriate + strong neutral border.
- **Success button/state:** success soft or success background + success foreground/contrast + success border.
- **Warning button/state:** warning soft/background + warning foreground/contrast + warning border/glow.
- **Danger button/state:** danger soft/background + danger foreground + danger border.
- **Ghost action:** transparent background/border with secondary or muted foreground.

Warning and success remain different semantic states, but both use the requested mint color family. Warning must never introduce a separate violet hue.

### 4.5 Protected content colors

A theme must not recolor:
- gem currency;
- user-selected territory colors and the Visual editor palette;
- map/game content colors;
- Minecraft text formatting codes;
- user-created visual assets and uploaded images.

The interface around content may change; the content itself retains its authored color.

## 5. Typography rules

Vox uses:
- Display: Manrope;
- Body/UI reading: Inter;
- Technical/numeric: IBM Plex Mono.

Important scale values:
- Display 30 px / line-height 1.08 / weight 800;
- Headline 24 px / weight 700 / line-height 1.14;
- Title 18 px / weight 700 / line-height 1.2;
- Body 15 px / line-height 1.55;
- Compact body 14 px;
- Label 12 px / weight 600;
- Control 13 px;
- Field 14 px / line-height 1.45;
- Textarea line-height 1.5;
- Button line-height 1.2.

Paragraph bottom margin is 14 px. Headings have their own spacing: h1 20 px, h2 16 px, h3 12 px in the current baseline. On narrow screens, compact display/headline/title/body tokens are used; the 380 px breakpoint is part of the current responsive contract.

Keep Cyrillic glyph coverage and line wrapping in view when changing fonts. Text should not be used as a substitute for a visible error or state indicator.

## 6. Component contracts

### 6.1 Buttons

- Use semantic variants: primary, neutral, success, danger, ghost.
- The label length determines content width where the design allows; do not make unrelated controls artificially equal width.
- Paired controls share a row but can have different widths.
- Keep dimensions stable while pressed/loading; changing the label to a short loading glyph must not cause layout shift.
- Disabled state remains visibly disabled and cannot trigger the action.
- Primary text uses `--theme-color-action-primary-contrast`; do not hardcode white.
- Success and warning actions use their own contrast tokens.

### 6.2 Icon buttons

- Must have an accessible label/title.
- Glyph must be geometrically centered in both axes.
- Use fixed width/height and flex centering; prevent shrinking in action rows.
- Use semantic variants for neutral, primary, success and danger.
- Touch targets should normally be at least 44 px where the control is a primary mobile interaction; documented compact resident controls are 34 px and need deliberate visual QA.

### 6.3 Fields and textareas

- Use native input/select/textarea semantics and keyboard behavior.
- Label, hint and error remain associated with the field.
- Invalid state must be programmatically exposed (`aria-invalid`), not only colored.
- Focus: primary border/focus ring plus theme focus shadow.
- Disabled: reduced opacity and not-allowed cursor.
- Error: danger border/text and a readable message.
- Placeholder is lower emphasis than entered text.
- Use default field wrapper rhythm unless a compact form composition explicitly overrides it.

### 6.4 Cards and section titles

- Use SurfaceCard or documented surface recipes for repeated cards.
- Base, raised and elevated surfaces must retain their hierarchy.
- Standard card padding is 16 px; compact panels may use 12 px.
- SectionTitle uses 8 px icon/title gap and 8 px bottom rhythm.
- Do not nest a second card surface around a block unless the hierarchy requires a distinct panel.

### 6.5 Tags, segmented controls and toggles

- Unselected Visual tags: raised neutral background + strong neutral border.
- Selected Visual tag: primary background + primary contrast foreground + primary border.
- Segmented: selected state is programmatically exposed via pressed state; idle option remains visually distinct.
- Toggle: checked and unchecked tracks/thumbs use dedicated recipe tokens; label and description remain readable.
- Color must not be the only indication of selection.

### 6.6 Review compose and territory management examples

- Review publication action: square 44 × 44 px, 12 px radius. Resident = primary/purple; inspector = success/mint. Existing role predicate and publish action stay authoritative.
- Resident add row: full available width; input flexes; add action fixed 44 × 44 px.
- Resident promote/remove actions: fixed 34 × 34 px with centered glyphs; promote = success/mint, remove = danger/red.
- Treasury row: flexible amount field + fixed-width 120 px “Пополнить” action; same control height; no layout shift on press.
- Territory appearance is a separate card/section, aligned to the same shared section rhythm.
- Additional territory information renders Telegram usernames through the existing interactive text handler.

## 7. Motion, focus and interaction feedback

Current Vox motion tokens:
- instant 100 ms;
- tap 160 ms;
- standard 190 ms;
- modal 245 ms.

Easing:
- standard `cubic-bezier(.22, .72, .22, 1)`;
- interactive `cubic-bezier(.2, .85, .25, 1)`;
- enter `cubic-bezier(.16, 1, .3, 1)`.

Rules:
- motion communicates state/hierarchy and must not obstruct a task;
- pressed controls may use a brief 1 px / subtle scale response, but geometry must remain stable;
- focus-visible uses a 2 px primary outline with 2 px offset on shared primitives;
- invalid focused fields use danger focus color;
- disabled fields reduce opacity and do not accept interaction;
- `prefers-reduced-motion: reduce` must suppress/shorten transitions and animations without removing information or functionality.

## 8. Notifications and inline feedback

### 8.1 What FixedToast does

Current `FixedToast` implementation in `src/App.jsx`:

- renders only when `message` is non-empty;
- is mounted via React portal into `.atlas-root` (fallback: `document.body`), so it is not trapped inside a local card/modal clipping context;
- is fixed horizontally centered near the bottom, above the persistent bottom navigation and safe-area inset;
- has `pointer-events: none`, so it is informational and does not block taps;
- uses a pill shape, shadow and entrance/exit animation;
- announces errors with `role="alert"` and `aria-live="assertive"`;
- announces success/warning/info-like default messages with `role="status"` and `aria-live="polite"`.

Geometry tokens:
- bottom offset: `calc(76px + env(safe-area-inset-bottom))`;
- max width: 420 px;
- total horizontal viewport gutter: 32 px;
- padding: 11 px vertical / 16 px horizontal;
- radius: pill;
- text: 12.5 px / weight 700 / line-height 1.3;
- z-index: 1200.

### 8.2 Notification type selection

If a caller passes an explicit `type`, that type wins. Otherwise FixedToast infers the type from the message text:

| Type | Current inference / meaning | Vox treatment |
|---|---|---|
| Error | Contains wording matching `ошиб`, `не удалось`, `нет соединения`, `недостаточно прав`, `не найдена`, `временно недоступен`, `не выполнена`, `не получилось` | red/danger |
| Warning | Contains `ожидает`, `повторите`, `проверьте`, `не подтверждён` | mint/warning semantic token |
| Success | Default when neither error nor warning pattern matches | mint/success |

This is the current implementation, not a robust semantic API. Message wording can therefore affect color/ARIA priority. Prefer passing an explicit type when the state is known and correctness matters. Do not change this behavior casually because it affects both color and assistive-technology announcement priority.

### 8.3 Duration and timing

- FixedToast internal default: **2,600 ms** for non-error; **4,300 ms** for error.
- Exit animation begins 180 ms before hide.
- A caller may clear its message earlier. For example, the territory rating `flash()` helper clears after **2,200 ms**, so its toast can disappear before the component's 2,600 ms default. The caller timer is the effective limit.
- A key based on the message is used by call sites to remount the toast when the same message is emitted again.

### 8.4 When a toast is appropriate

Use a toast when the user has completed or attempted a discrete action and needs a short global confirmation/result, especially if the action is not tied to a single field:
- a successful save/update/create/delete;
- a completed publication or transaction;
- a rating/reaction submitted;
- a successful action in a modal that closes after completion;
- a background operation whose completion needs to be noticed.

Examples already present in the code/documentation include:
- “Карта мира обновлена” after publication verification completes;
- “ЧиВо сохранено” after a successful save;
- “Инспектор добавлен” after a successful add;
- “Донат отправлен” after successful donation;
- rating feedback via the `flash()` helper.

### 8.5 When not to use a toast

Prefer inline feedback when the problem belongs to a specific field, form or panel and the user needs to fix it in place:
- required field is empty;
- invalid value or malformed input;
- validation message tied to a particular input;
- upload/processing progress or a persistent incomplete state;
- a failure that must remain visible until the user corrects/retries;
- a local loading or empty state.

Current examples include inline `error` / `setError` messages adjacent to forms and panels, map publication continuing in background with an inline status/error, and event loading errors with a local Retry action.

Do not show a success toast merely because a request started. Show it only after the operation reaches the success state. Do not show both a toast and an identical persistent inline message for the same event unless the two serve different purposes.

### 8.6 Notification decision table

| Situation | Preferred feedback | Why |
|---|---|---|
| Save succeeded and the panel remains open | Success toast | Confirms completion without interrupting |
| Save succeeded and the modal closes | Success toast in root portal | Confirmation remains visible after modal closes |
| A required input is empty | Inline field/form error | User must correct a specific location |
| Server rejects a destructive/financial action | Error toast if action-level; inline error if form-specific | Must communicate failure without hiding recovery context |
| Operation is still running | Inline progress/loading state | It is not completed yet |
| Operation is pending/awaiting confirmation | Warning or persistent local status | Not a success |
| Background retry resumes | Status notice if useful; avoid duplicate success | User should understand current state, not be spammed |
| No meaningful state change | No notification | Avoid noise |
| User merely opens a page/tab | No toast | Navigation itself is not a completed action |

### 8.7 Important implementation boundary

There is not yet one central notification service or one exhaustive action-to-message registry. Several components own their own `notice`, `error`, or `toast` state and render FixedToast locally; the portal centralizes its visual position, but the message source/timing is distributed. Some errors intentionally remain inline. Therefore this document describes the current component behavior and decision principles, not a claim that every action in the product has been audited and mapped.

---

## 9. Practical examples

### Example A — card stack

Correct: account card, Purchases card, Treasury card, territory-management card are peer sections with a 12 px vertical gap. Each card owns its own 16 px inner padding.

Incorrect: add 12 px bottom margin to each card and also a 12 px parent gap; the visible distance becomes doubled.

### Example B — label and input

Correct: label sits 4 px above its input. The field wrapper then provides its default 12 px bottom rhythm before the next field group.

Incorrect: add another arbitrary 12 px to the input itself and another margin to the next label.

### Example C — textarea followed by actions

Correct: for the documented compact territory forms, wrapper bottom margin is 0 and the action row starts 8 px below the textarea.

Incorrect: retain wrapper 12 px, textarea bottom margin, and add action margin-top 8 px; this produces the large gap previously reported.

### Example D — paired input and action

Correct: field takes remaining width; action has a stable content-appropriate width/size and height. The button does not resize on press/loading.

Incorrect: force the button and input to equal widths simply because they share a row.

### Example E — status colors

Correct: primary save action = purple; confirmed success = mint; caution/pending = mint warning; delete/error = red; gem amount = protected cyan.

Incorrect: use purple for warning, invent a separate violet status color, use red for neutral controls, or recolor the gem because the theme palette changed.

### Example F — notification vs inline error

Correct: “Сохранено” appears as a short toast after server success; “Введите название” stays beside the name field until fixed.

Incorrect: toast an empty-field validation message that disappears while the invalid field remains unresolved.

---

## 10. Rules for future UI changes

Before changing a component:

1. Identify its semantic role, state and owning screen.
2. Check whether a shared primitive or token already covers it.
3. Reuse existing spacing, color, radius, typography and motion roles.
4. Decide whether spacing belongs to the parent layout, component wrapper or internal gap; use one owner.
5. Preserve control width/height during loading and press states.
6. Preserve role, permissions, handlers, API payloads and content colors.
7. Add a regression test for a new reusable rule or state contract.
8. Update this guide, `DESIGN.md`, `THEME_TOKEN_REFERENCE.md` or `Functional_System.txt` when a rule changes.
9. Verify narrow mobile, keyboard-open forms, desktop, safe areas, focus, disabled, error, reduced-motion and actual Telegram WebView behavior.

### Current migration caveat

The design system is not yet a claim that every pixel in the 510 KB App.jsx is tokenized. Legacy inline styles and screen-specific local values remain. For a new change, the contract above is authoritative; for an existing untouched legacy component, inspect its implementation before assuming it already follows the contract. Migrate incrementally and test adjacent screens to avoid layout regressions.

## 2.7 Spacing inventory: approved values and migration rules

The approved local spacing values for the Vox interface are **4, 6, 8, 10, 12, 15, 18 and 20 px**. These values may be used for spacing properties (gap, row-gap, column-gap, margin* and padding*) when they fit the component relationship. Do not change element dimensions, positional coordinates, typography, border radii, animation values or other non-spacing properties as part of spacing normalization.

### A. Approved spacing values

| Value | Intended use |
|---:|---|
| 4 px | Micro-spacing: icon/text, label/control, hint/control |
| 6 px | Tight related items and compact metadata |
| 8 px | Related controls, button contents, compact action rows |
| 10 px | Intermediate compact grouping where 8 px is too tight |
| 12 px | Separate field groups, peer cards/sections, compact surface inset |
| 15 px | Standard surface inset and larger content spacing |
| 18 px | Spacious local grouping |
| 20 px | Large grouping and deliberate display/control spacing |

### B. Required normalization

| Existing value | New value |
|---:|---:|
| 5 px | 4 px |
| 7 px | 6 px |
| 9 px | 8 px |
| 14 px | 12 px |
| 16 px | 15 px |
| 22 px | 20 px |

Values already in the approved list remain unchanged. The mapping applies only when a number is used as a spacing value, not when the same number represents width, height, position, font size, radius, timing, data, or another non-spacing property.

### C. Current hard-coded local spacing inventory

The following counts are a static scan of numeric spacing declarations in the current App.jsx snapshot after normalization. They count numeric occurrences inside spacing-property values; a shorthand such as padding: '8px 12px' contributes two occurrences. They are not a count of unique visual distances.

| Approved value | Occurrences |
|---:|---:|
| 4 px | 44 |
| 6 px | 101 |
| 8 px | 182 |
| 10 px | 134 |
| 12 px | 145 |
| 15 px | 31 |
| 18 px | 14 |
| 20 px | 3 |

The counts are an inventory aid, not a requirement to replace every local declaration with a token. Preserve component-specific composition when it already uses an approved value appropriately.

### D. Token alignment

- --theme-space-1 remains 4 px.
- --theme-space-2 remains 8 px.
- --theme-space-3 remains 12 px.
- --theme-space-4 is now 15 px, matching the approved 16 → 15 px normalization.
- --theme-space-5 remains 20 px.
- --theme-layout-section-gap remains 12 px.

The 24 px and 32 px legacy scale tokens are not part of the approved local spacing list. Do not introduce them into new local spacing declarations; their existing token usages require separate component-level review before removal or remapping.
