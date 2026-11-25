# Mini App polish — 2026-11-25

This change set polishes territory presentation, the main-inspector award-pack manager, and a few bot command flows.

## UI changes

1. **Territory award badges.** Award icons are centered inside their badge surfaces. Their entrance animations use a per-item delay so badges appear one after another.
2. **Review reply spacing.** The founder/mayor reply input no longer adds an extra bottom margin inside the already padded review card.
3. **Territories rating list.** The small left-hand territory thumbnails now show a center crop of the same 150px banner used on the territory page. The banner is rendered at its original viewport width and height inside an overflow-hidden square; it is not stretched or scaled.
4. **Award pack manager.** Removed the two explanatory helper sentences. Every Telegram emoji pack is collapsed on initial render and can be expanded or collapsed using an accessible chevron control next to its title.
5. **Award notification guidance.** Appended an italic note to the award-granted Telegram notification: “Экипированные награды появляются на странице территории”. The note is part of the same message, immediately after the award announcement; it is not shown in the profile UI.
6. **Profile banner editor.** Disabled color swatches and the banner preview retain their normal brightness in read-only/profile views.
7. **Territories header geometry.** The FAQ and add-territory buttons, plus the rating sort segmented control, use the same 36px height as the adjacent circular inspector control.
8. **Rating filter wording.** Changed “По инспектору” to “По инспекторам”; the player filter is unchanged.

## Bot behavior

- Granting a territory award through the main-inspector award manager now sends an award notice to recipients who have enabled notifications for that territory:
  `🏆 <territory> получил(а) награду «<award name>»` followed by the italic line `Экипированные награды появляются на странице территории`.
- The notification uses the existing per-territory preference check and existing recipient selection for territory members/managers. Users without an enabled territory preference are not sent the notice.
- Gem withdrawal parsing accepts optional leading slash syntax and optional whitespace after the minus sign, including `-250`, `- 250`, `/-250`, and `/ - 250`, as well as the corresponding territory-prefixed forms.
- Removed the legacy banker-chat command for granting/removing territory awards. Award management is handled by the protected main-inspector Mini App interface.

## Banner data note

Territories currently store their banner appearance as `banner_color` and `banner_gradient`, not as a separate raster image URL. The rating thumbnail therefore crops the center of the rendered gradient banner already used by the territory detail page.

## Validation

Added regression coverage for the supported gem withdrawal forms and static UI contracts for badge alignment/animation, center-cropped banners, collapsed award packs, reply spacing, banner editor disabled-state styling, and 36px header controls. The withdrawal parser handles numeric syntax while the command handler separately rejects zero or negative amounts. The GitHub Actions run on the pull request remains the full repository validation gate.

## Direct-main follow-up fixes — 2026-11-25

- **Main-inspector disappearing button.** Fixed the edit modal crash: it previously rendered an undefined `SettingsToggle` component. The existing `ToggleField` component provides the same checked/onChange interface and is now used instead, so the main inspector can open and use the settings dialog without a React render error.
- **Territory rating selector geometry.** The “По инспекторам / По игрокам” selector now uses the same raised background, 3px inset, rounded corners, button padding, and inset purple active pill as the “Набор / Карта / Рейтинг” tabs.
- Added UI regression tests for both fixes.

- **Rating badge sizing correction.** Removed the unnecessary fixed-width override from the inspector and player rating pills. They retain their original content-sized layout and existing design tokens; this follow-up does not alter their dimensions.

- **Rating selector backdrop radius.** Increased the dark background corner radius to 16.5px while keeping the 3px inset around the active purple pill, so the outer corner curve follows the pill with the same geometric offset.



## Rating selector corner correction — 2026-11-25

- Reverted the attempted equal-width treatment for inspector/player rating badges. Their widths remain naturally determined by their own icon and numeric content; no minimum or fixed width is imposed.
- Kept the “По инспекторам / По игрокам” selector at the already established 36px active-pill height. With a 3px inset and an 18px pill corner radius, the dark outer background uses a 21px radius (18px + 3px), following the nested-radius rule.
- Added regression coverage to ensure rating badges remain content-sized and the selector keeps the matching 21px/18px corner geometry.
