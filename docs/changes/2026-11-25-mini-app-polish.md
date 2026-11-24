# Mini App polish — 2026-11-25

This change set polishes territory presentation, the main-inspector award-pack manager, and a few bot command flows.

## UI changes

1. **Territory award badges.** Award icons are centered inside their badge surfaces. Their entrance animations use a per-item delay so badges appear one after another.
2. **Review reply spacing.** The founder/mayor reply input no longer adds an extra bottom margin inside the already padded review card.
3. **Territories rating list.** The small left-hand territory thumbnails now show a center crop of the same 150px banner used on the territory page. The banner is rendered at its original viewport width and height inside an overflow-hidden square; it is not stretched or scaled.
4. **Award pack manager.** Removed the two explanatory helper sentences. Every Telegram emoji pack is collapsed on initial render and can be expanded or collapsed using an accessible chevron control next to its title.
5. **Equipped-award guidance.** Added an italic note explaining that equipped awards appear on the territory page.
6. **Profile banner editor.** Disabled color swatches and the banner preview retain their normal brightness in read-only/profile views.
7. **Territories header geometry.** The FAQ and add-territory buttons, plus the rating sort segmented control, use the same 36px height as the adjacent circular inspector control.
8. **Rating filter wording.** Changed “По инспектору” to “По инспекторам”; the player filter is unchanged.

## Bot behavior

- Granting a territory award through the main-inspector award manager now sends an award notice to recipients who have enabled notifications for that territory:
  `🏆 <territory> получил(а) награду «<award name>»`.
- The notification uses the existing per-territory preference check and existing recipient selection for territory members/managers. Users without an enabled territory preference are not sent the notice.
- Gem withdrawal parsing accepts optional leading slash syntax and optional whitespace after the minus sign, including `-250`, `- 250`, `/-250`, and `/ - 250`, as well as the corresponding territory-prefixed forms.
- Removed the legacy banker-chat command for granting/removing territory awards. Award management is handled by the protected main-inspector Mini App interface.

## Banner data note

Territories currently store their banner appearance as `banner_color` and `banner_gradient`, not as a separate raster image URL. The rating thumbnail therefore crops the center of the rendered gradient banner already used by the territory detail page.

## Validation

Added regression coverage for the supported gem withdrawal forms and static UI contracts for badge alignment/animation, center-cropped banners, collapsed award packs, reply spacing, banner editor disabled-state styling, and 36px header controls. The withdrawal parser handles numeric syntax while the command handler separately rejects zero or negative amounts. The GitHub Actions run on the pull request remains the full repository validation gate.
