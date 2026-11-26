# Territory award sticker delivery

**Status:** current implementation  
**Updated:** 2026-11-26  
**Source of truth:** `src/features/territory-awards/TelegramSticker.jsx`, `src/features/territory-awards/MainInspectorAwardManager.jsx`, `src/features/territory-awards/IssuedAwardsPanel.jsx`, their integration in `src/App.jsx`, `bot/src/worker.js`, and the D1 tables created by `ensureWorldTables()`.

This document describes the current award-sticker path after removing the abandoned `AnimatedEmojies` integration. It supersedes earlier notes that describe `GET /api/telegram-emoji` as an active part of award rendering.

## 1. Scope and product behavior

Territory awards are Telegram custom-emoji stickers selected from public Telegram emoji packs. A granted award stores a copy of the sticker's Telegram file metadata in `territory_awards`; it does not depend on looking the sticker up in an external emoji catalogue every time the award is displayed.

The same issued award can appear in several places:

- the main inspector's issued-awards list;
- the territory manager's customization inventory;
- the public territory banner, when the award is equipped;
- the award details modal opened from a public territory banner.

The main inspector's pack gallery is a source-selection view. It shows the pack's static Telegram thumbnails, rather than pretending to be an issued award. The issued-awards list is also allowed to use a static thumbnail because it is an administrative summary. The customization inventory and public territory banner use the sticker's native format, including animation when available.

The original Unicode emoji is a failure fallback, not a loading placeholder. For a valid sticker record it must not be rendered while the asset is still loading. In particular, a TGS sticker without a Telegram thumbnail leaves its icon area visually empty until either the animation is ready or its loading/decoding attempt has definitively failed.

## 2. Data model

Two tables hold different stages of the lifecycle.

### `telegram_award_packs`

One row per configured public custom-emoji pack:

| Field | Meaning |
| --- | --- |
| `id` | Internal pack ID |
| `set_name` | Telegram sticker-set name |
| `title` | Display title |
| `added_by_telegram_id` | Main inspector who added the pack |
| `created_at` | Registration timestamp |

### `telegram_award_pack_stickers`

One row per imported sticker:

| Field | Meaning |
| --- | --- |
| `id` | Internal sticker ID used by the pack gallery and grant request |
| `pack_id` | Parent pack |
| `file_id` | Telegram file ID for the full sticker |
| `file_unique_id` | Telegram's stable file identity |
| `emoji` | Original emoji associated with the sticker |
| `custom_emoji_id` | Telegram custom-emoji ID, when supplied |
| `format` | `tgs`, `webm`, or `image` |
| `thumbnail_file_id` | Telegram thumbnail file ID, when supplied |
| `width`, `height` | Telegram sticker dimensions |

### `territory_awards`

Granting a sticker copies its display metadata into the award row:

- award identity and territory identity;
- unique normalized award name within that territory;
- original `emoji`;
- grant actor and grant timestamp;
- nullable `slot_index`;
- `sticker_file_id` and `sticker_file_unique_id`;
- `sticker_format`;
- `sticker_thumbnail_file_id`;
- `sticker_set_name` and `custom_emoji_id`.

The sticker fields form a snapshot. Deleting a source pack removes that pack and its `telegram_award_pack_stickers` rows, but it does not remove already-issued `territory_awards` or their copied Telegram file metadata. Issued awards therefore continue to resolve by `awardId` without a live join to the source pack.

No new database migration is required for this rendering fix: the sticker columns are already installed idempotently by `ensureWorldTables()`.

## 3. Grant lifecycle

1. A main inspector adds a public Telegram custom-emoji pack through the inspector interface.
2. The Worker validates an HTTPS `t.me/addemoji/<set>` or `telegram.me/addemoji/<set>` URL, calls Telegram `getStickerSet`, and checks that the returned set is a custom-emoji set.
3. Sticker rows are imported with their full file ID, format, original emoji, optional thumbnail, dimensions, and custom-emoji ID.
4. The inspector chooses a pack sticker and grants it to an approved territory with a name and date.
5. The Worker copies the sticker metadata into `territory_awards`, initially with `slot_index = NULL`. The unique territory/name key prevents duplicate award names in one territory.
6. Territory managers receive the existing award notification, subject to the territory notification preferences.
7. The territory founder/mayor can equip or unequip the award. At most four awards can be equipped; slot indices preserve their visible order.

The active management interface is the protected main-inspector Mini App flow. The historical banker-chat command for adding/removing awards is not an active management path.

## 4. Rendering API contract

All Telegram award files are served through **`GET /api/telegram-sticker`**. Exactly one selector is required:

- `stickerId=<telegram_award_pack_stickers.id>` — pack-gallery/source-sticker record;
- `awardId=<territory_awards.id>` — already-issued award record.

Providing neither selector or providing both returns HTTP 400.

The Worker loads the record from the corresponding table and resolves its Telegram file ID with `getFile`. Telegram may return a `file_path` without a filename suffix (for example, `stickers/file_344`). The Worker validates the path itself and checks a filename extension against the saved sticker format only when a suffix is present; without a suffix, the format stored in D1 remains authoritative for decoding and the response content type. For preview requests, `preview=1` selects the saved thumbnail. For a static `image` sticker without a separate thumbnail, the full image file may serve as its own preview. A TGS/WEBM preview request without a stored thumbnail returns 404; callers must check thumbnail availability before requesting that path.

| Request | Response |
| --- | --- |
| `?stickerId=…` | Full asset of a source pack sticker |
| `?stickerId=…&preview=1` | Static thumbnail, or the static image itself |
| `?awardId=…` | Full asset snapshot of an issued award |
| `?awardId=…&preview=1` | Stored award thumbnail, or static image itself |

The route applies the shared CORS helper on successful and error responses. This is required because the Mini App and the bot Worker are served from separate origins.

## 5. File formats and safety

### TGS

Telegram's compressed TGS file is fetched from Telegram, decompressed in the Worker, parsed as JSON, and validated before being returned to the browser. The frontend dynamically imports `lottie-web` only when it needs to render a full TGS sticker, so static-image-only sessions do not download the animation engine in the initial JavaScript bundle. Each visible award gets its own looping player; the player is destroyed when its component unmounts.

Validation requires:

- a positive vector width and height, each no greater than 512;
- a `layers` array;
- no remote asset references in the `assets` array.

The compressed file is limited to 512 KiB and decompressed JSON to 1 MiB. Each animation player uses a deep-cloned JSON payload because Lottie mutates its input data. Playback is looping and starts automatically.

### WEBM

The Worker returns the validated Telegram file as `video/webm`. The browser renders it muted, inline, autoplaying, and looping. A thumbnail is used if video playback fails and a thumbnail exists.

### Static image

The Worker returns an allowed Telegram image as WebP, PNG, or JPEG. The frontend uses `object-fit: contain` so the sticker is not cropped. The original Unicode emoji is used only if the image load fails.

### Transport limits and caching

- TGS compressed payload: maximum 512 KiB; decompressed JSON: maximum 1 MiB.
- WEBM and static image payloads: maximum 20 MiB.
- Successful file responses use public one-day caching with stale-while-revalidate.
- Invalid or unavailable file requests return a bounded error response; no Telegram bot token or upstream file URL is exposed to the browser.

## 6. Loading states and fallback policy

The UI distinguishes an asset that has not finished loading from an asset that has failed.

| Format / state | What is rendered |
| --- | --- |
| TGS with thumbnail, animation loading | Telegram thumbnail |
| TGS without thumbnail, animation loading | Empty icon area; no Unicode flash |
| TGS, animation ready | Lottie animation replaces the thumbnail/empty area |
| TGS, animation failed, thumbnail still usable | Keep the thumbnail |
| TGS, animation failed and no usable thumbnail | Original Unicode emoji |
| WEBM loading/playing | Video element |
| WEBM failed, thumbnail available | Telegram thumbnail |
| WEBM failed, no usable thumbnail | Original Unicode emoji |
| Static image loading | Image element |
| Static image failed | Original Unicode emoji |
| Preview-only image failed | Original Unicode emoji |

The sticker component is keyed by the issued award ID when rendered through `TerritoryAwardIcon`, so switching the selected award cannot reuse the previous award's `failed`, `previewFailed`, or `animationReady` state. For TGS the failure fallback is gated by the animation failure state, not by the mere absence of a thumbnail or by a thumbnail request still being pending. A thumbnail error alone must not display Unicode while the animation may still succeed. This prevents the original emoji from flashing before a valid Telegram animation appears.

If an award has no sticker ID at all, the component has no Telegram asset to load and displays the award's stored emoji (or the neutral default) immediately. This is a missing-asset record, not a loading state.

## 7. Data returned to each screen

The thumbnail metadata must be present wherever the frontend makes a thumbnail-aware rendering decision.

- The admin issued-awards view returns `sticker_thumbnail_file_id` with the award rows.
- The territory list/detail query returns it with equipped awards.
- The customization/profile response returns it with the user's `territoryAwards` and derived `equippedAwards`.

The pack gallery separately receives `thumbnail_file_id` from `telegram_award_pack_stickers`.

This field is part of the frontend/backend contract. Omitting it from one query can cause the frontend to believe that a sticker has no thumbnail even though the D1 record and Telegram pack do contain one. The Worker endpoint remains the authority for retrieving the actual file, while the response field tells the component whether it should attempt to render that preview.

## 8. Removed integration

The abandoned `AnimatedEmojies` lookup has been removed from the current implementation:

- no `GET /api/telegram-emoji` route;
- no Worker sticker-set cache or search helper for the `AnimatedEmojies` set;
- no client animation cache or `TelegramEmoji` component;
- no corresponding tests or stale CSS selectors.

This does **not** remove `lottie-web`. Lottie is still required to render TGS files selected from the configured Telegram custom-emoji packs. The active source of award art is the imported pack sticker or the issued award's own Telegram file snapshot.

## 9. Regression coverage and validation

The relevant tests are:

- `tests/territory-awards-ui.test.js` — display surfaces, independent looping TGS players, thumbnail behavior, WEBM fallback, and the rule that Unicode is not shown while TGS is still loading;
- `tests/territory-awards.test.js` — sticker format mapping, pack URL validation, TGS safety validation, thumbnail fields in territory/profile queries, and both `stickerId` and `awardId` routes.
- `tests/territory-award-management-service.test.js` — main-inspector authorization ordering, pack URL/duplicate validation, award grant snapshot persistence and manager notification, and award deletion slot compaction.
- `tests/route-auth-matrix.test.js` — unauthenticated access to award listing, grant/delete, pack add/delete and equipment routes is rejected before protected work.

The repository CI validation pipeline runs `npm test`, `npm run build`, `node --check bot/src/worker.js`, and a Wrangler Worker dry-run bundle. These checks validate the source and bundle; they do not replace a live Telegram/D1 smoke test with real pack files.

## 10. Main inspector pack manager UI

The protected main-inspector profile embeds `MainInspectorAwardManager` from `src/features/territory-awards/MainInspectorAwardManager.jsx`. The module owns the pack catalog state, collapsed/expanded gallery state, sticker selection, pack add/remove actions, and award-grant form.

- The gallery starts collapsed. Each pack has an accessible expand/collapse control; expanded stickers are displayed in a nine-column grid using the static Telegram thumbnail when one is available.
- Adding a pack submits its public `t.me/addemoji/<set>` URL to `POST /api/admin/award-packs`. Removing a pack uses `DELETE /api/admin/award-packs/:id`; the Worker preserves the metadata snapshots of awards already granted from that pack.
- Granting requires a selected sticker, an approved territory, a non-empty award name (up to 80 characters), and a date. The selected sticker ID, territory ID, name and local-noon timestamp are sent to `POST /api/admin/awards`.
- After a grant, the module dispatches `voxygen:awards-changed` so the issued-awards list can refresh, and calls the existing `onTerritoriesChanged` callback.
- The module imports its sticker renderer and icon components directly. The app shell supplies the shared API error formatters through the explicit `ui` adapter; no API route, authorization rule, or payload is owned by this UI extraction.

## 11. Issued-award administration panel

The main inspector's issued-award list is owned by `src/features/territory-awards/IssuedAwardsPanel.jsx`. It is separate from the source-pack gallery and from public award rendering.

- On mount, the panel requests `GET /api/admin/awards?view=issued` using the existing `X-Telegram-Init-Data` header and displays each issued award with its stored date and Telegram thumbnail/preview.
- The panel listens for `voxygen:awards-changed`; the source-pack/grant manager dispatches this event after a successful grant so the issued list refreshes without a page reload.
- Deletion uses `DELETE /api/admin/awards/:id`, asks for confirmation, removes the row from local state after a successful response and invokes the existing territory-refresh callback.
- The shared API error formatter, fallback formatter and award-date formatter are passed through the explicit `ui` adapter. The API route, authorization and response contract remain in the Worker.


## 12. Backend award-management boundary

The main-inspector award catalog and grant lifecycle is implemented in `bot/src/features/territory-awards/award-management.js`:
- `getAdminAwards` loads the issued-award list and source-pack catalog;
- `addTelegramAwardPack` validates the public Telegram custom-emoji URL, imports the pack metadata and stores sticker rows;
- `deleteTelegramAwardPack` removes a source pack and its sticker rows;
- `grantTerritoryAward` validates the selected approved territory and sticker, snapshots Telegram metadata into `territory_awards`, and notifies territory managers;
- `deleteTerritoryAwardById` removes an issued award and compacts the remaining equipped slots.

The Worker keeps route matching and injects the existing main-inspector authorization helper, D1 initialization, JSON response helper, Telegram API helper, notification helper and small formatting/validation functions. The service does not own HTTP routing, authentication implementation, shared D1 schema initialization, or the public sticker-file delivery endpoint.

`toggleTerritoryAwardPlacement` remains in `bot/src/worker.js` for now. It is a user/territory-manager operation tied to territory customization and is intentionally not moved with the main-inspector pack/grant administration handlers in this extraction.

## 13. Source map

| Responsibility | File / symbol |
| --- | --- |
| Award sticker rendering and loading state | `src/features/territory-awards/TelegramSticker.jsx` — `TelegramSticker`, `TerritoryAwardIcon`, `AwardEmoji` |
| Award placement and screen integration | `src/App.jsx` — inspector, inventory, territory banner and modal call sites |
| TGS player lifecycle | `src/App.jsx` — `cloneTelegramStickerAnimationData` and the Lottie effect in `TelegramSticker` |
| Pack catalog and grant lifecycle | `bot/src/features/territory-awards/award-management.js` — `getAdminAwards`, `addTelegramAwardPack`, `deleteTelegramAwardPack`, `grantTerritoryAward`, `deleteTerritoryAwardById` |
| Award placement | `bot/src/worker.js` — `toggleTerritoryAwardPlacement` |
| File delivery | `bot/src/features/territory-awards/sticker-delivery.js` — `serveTelegramAwardSticker`; `bot/src/worker.js` owns the route and injects CORS, Telegram and D1 bootstrap dependencies |
| TGS safety and Telegram file format validation | `bot/src/features/territory-awards/sticker-delivery.js` — `isSafeTelegramTgsAnimation`, pack URL validation, sticker format/path helpers |
| Territory public response | `bot/src/worker.js` — `getTerritories` |
| Profile/customization response | `bot/src/worker.js` — `getCustomization` |
| D1 schema and idempotent additions | `bot/src/worker.js` — `ensureWorldTables` |
