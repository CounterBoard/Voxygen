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

- Granting a territory award through the main-inspector award manager now sends an award notice to recipients who have enabled notifications for that territory. The italic guidance is separated with a real line break in the Telegram message, not a literal backslash-n sequence:
  `🏆 <territory> получил(а) награду «<award name>»` followed by the italic line `Экипированные награды появляются на странице территории`.
- The notification uses the existing per-territory preference check and existing recipient selection for territory members/managers. Users without an enabled territory preference are not sent the notice.
- Gem withdrawal parsing accepts optional leading slash syntax and optional whitespace after the minus sign, including `-250`, `- 250`, `/-250`, and `/ - 250`, as well as the corresponding territory-prefixed forms.
- Removed the legacy banker-chat command for granting/removing territory awards. Award management is handled by the protected main-inspector Mini App interface.

## Banner data note

Territories currently store their banner appearance as `banner_color` and `banner_gradient`, not as a separate raster image URL. The rating thumbnail therefore crops the center of the rendered gradient banner already used by the territory detail page.

## Validation

Added regression coverage for the supported gem withdrawal forms and static UI contracts for badge alignment/animation, center-cropped banners, collapsed award packs, reply spacing, banner editor disabled-state styling, and 36px header controls. The withdrawal parser handles numeric syntax while the command handler separately rejects zero or negative amounts. The GitHub Actions run on the pull request remains the full repository validation gate.

## Direct-main follow-up fixes — 2026-11-26

- **Main-inspector disappearing button.** Fixed the edit modal crash: it previously rendered an undefined `SettingsToggle` component. The existing `ToggleField` component provides the same checked/onChange interface and is now used instead.
- **Rating badge sizing.** Inspector and player score badges retain their original content-sized widths; no fixed or minimum widths are applied.
- **Vox theme owns territory rating switch geometry.** The “По инспекторам / По игрокам” switch now reads dedicated tokens from `.atlas-root[data-theme="vox"]` in `src/theme/theme-tokens.css`. Geometry is no longer hard-coded in the component:
  - Active segment height: 36px (the compact control token).
  - Inset: 3px.
  - Track height: 42px (36px + 3px + 3px).
  - Active segment radius: 18px (half of 36px).
  - Track radius: 21px (18px + 3px), using `R_outer = R_inner + inset`.
- UI regression tests read the Vox token pack, derive the dimensions and radii, and verify the component consumes the theme tokens.


## Award notification and Telegram emoji delivery fix — 2026-11-26

- **Award notification paragraph.** The italic sentence `Экипированные награды появляются на странице территории` is now separated from the award announcement by a blank line (`\n\n`), so Telegram displays it as its own paragraph.
- **Temporary AnimatedEmojies CORS fix (historical).** At this point in the change history, the cross-origin `GET /api/telegram-emoji` route was wrapped with the shared `withCors` helper. This was a temporary integration and is not part of the current award-rendering architecture; it was removed in the later award-sticker consolidation documented below.
- The notification paragraph regression test remains current. The CORS test for the removed `/api/telegram-emoji` route was retired when that route and its implementation were deleted.


## Territory award sticker rendering fallback — 2026-11-26

- Territory award stickers use `awardId` and request the full TGS/WEBM asset, while the main-inspector pack gallery uses `stickerId` with `preview=1` and therefore displays Telegram's static thumbnail. The territory component previously had no thumbnail fallback for TGS and displayed only a Sparkles placeholder when the animation request or Lottie parsing failed.
- Added a thumbnail request for territory TGS awards. The thumbnail remains visible while the animation loads and whenever it fails; a successfully loaded Lottie animation replaces it. WEBM awards also fall back to their Telegram thumbnail on playback failure.
- The main-inspector pack preview path and rating badge sizing are unchanged.
- Added UI regression tests for TGS thumbnail fallback and WEBM playback fallback.


## Consolidated territory award sticker delivery — 2026-11-26

The pack gallery and issued awards now share a single, format-aware Telegram sticker delivery path. The source pack gallery resolves a sticker with `stickerId`; territory inventory and public award badges resolve an issued snapshot with `awardId`. Both are served by `GET /api/telegram-sticker`, which requires exactly one selector and reads the corresponding D1 table.

### Data contract correction

- The territory awards query in `getTerritories` now selects `sticker_thumbnail_file_id` for equipped award records.
- The `getCustomization` profile response now selects the same field for `territoryAwards` and its derived `equippedAwards`.
- The main-inspector issued-awards query already included the field; the pack gallery reads `thumbnail_file_id` from its pack-sticker rows.
- This makes thumbnail availability consistent between the inspector, profile inventory, and public territory page. The API resolves actual file data server-side; the thumbnail ID in each response is the UI's availability signal.

### Rendering and loading behavior

- **TGS:** the Worker fetches the Telegram file, verifies its path/extension and compressed size, decompresses gzip, limits the decoded JSON, and validates vector dimensions, layers and the absence of remote assets. The frontend renders each sticker with its own looping Lottie instance and a deep-cloned animation payload.
- **WEBM:** the frontend plays the original Telegram video muted, inline, and looping. A stored thumbnail is shown if playback fails.
- **Static image:** WebP, PNG and JPEG are supported and contained without cropping.
- The original Unicode emoji is not a loading placeholder. For a TGS item with no thumbnail, its icon area stays empty while the animation request and Lottie initialization are pending. The player is keyed by award ID so switching modal selection cannot carry a previous award's failure state into the next one. Unicode is shown only after the animation has actually failed. If a thumbnail exists, it remains visible while the TGS animation loads; a thumbnail request error alone does not trigger Unicode while the animation may still succeed. WEBM and static-image fallbacks follow the same failure-only principle.

### Removal of AnimatedEmojies

The abandoned `AnimatedEmojies` source has been removed completely from the active application: its Worker sticker-set lookup/cache, `GET /api/telegram-emoji` route, frontend loader/cache and `TelegramEmoji` component, exports, tests, and obsolete CSS rules. `lottie-web` remains installed because TGS stickers selected from configured Telegram custom-emoji packs still use Lottie.

### Documentation and regression coverage

- Detailed behavior and API reference: `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md`.
- System-level documentation: `Functional_System.txt`, section 68, with historical placeholder wording superseded.
- UI tests cover TGS thumbnail/loading behavior, no Unicode-before-failure, WEBM fallback and award icon presentation.
- Worker tests cover format mapping, pack URL validation, TGS safety, thumbnail fields in territory/profile payloads, and the two selector branches of the common sticker endpoint.

### Validation gate

The GitHub Actions workflow runs `npm test`, `npm run build`, `node --check bot/src/worker.js`, and the Wrangler Worker dry-run bundle. A green CI run confirms repository tests and bundling; it is not a live smoke test against Telegram's Bot API, the production D1 database, or Cloudflare deployment.


## Audit follow-up — Telegram sticker robustness and bundle loading — 2026-11-26

- Telegram's `getFile` can return extensionless paths such as `stickers/file_344`. The Worker now extracts suffixes from the final path segment, validates them when present, and relies on the sticker format saved in D1 when Telegram omits a suffix.
- Added direct regression tests for extensionless paths and mismatched known extensions.
- `lottie-web` is now dynamically imported only when a full TGS sticker needs rendering. Static-image-only sessions no longer download Lottie as part of the initial JavaScript chunk. Active Lottie instances are still destroyed when their sticker component unmounts.
- Updated the feature specification and system reference so the file-path and loading behavior are documented in both places.


## Frontend modularization — first extraction — 2026-11-26

- Extracted the Telegram territory-award rendering components (`AwardEmoji`, `TelegramSticker`, and `TerritoryAwardIcon`) from the application shell into `src/features/territory-awards/TelegramSticker.jsx`.
- Moved the two Worker endpoint constants into `src/config/api.js`, which is now the shared frontend configuration source.
- Kept rendering behavior, request URLs, animation lifecycle, fallbacks, and public component props unchanged. Updated UI regression tests to assert the feature module boundary and its internal rendering contract.
- Future extractions should follow the same rule: move a cohesive feature with its own tests and stable imports, then verify before proceeding to the next area.
