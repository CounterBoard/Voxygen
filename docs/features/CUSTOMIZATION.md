# Customization screen and visual editor

**Status:** current implementation  
**Updated:** 2026-11-27  
**UI source:** `src/features/customization/CustomizationScreen.jsx`  
**Shared palette:** `src/features/customization/VisualColorPicker.jsx`  
**API source:** `bot/src/worker.js` composes `bot/src/features/customization/catalog-service.js`, `admin-service.js`, `achievements.js`, `purchase-service.js`, `city-appearance-service.js`, `image-service.js` and `visual-equipment-service.js`; Telegram discount and inventory handling live in their respective customization feature modules.

## Purpose

The customization screen displays the visual catalog and inventory, allows users to switch between their personal account and eligible territory treasuries, and provides main-inspector controls for visual creation, editing, visibility, ordering and achievement rechecks.

## Module boundaries

- `CustomizationScreen` owns catalog/inventory state, personal-vs-treasury scope, stale-request guards, purchase and reorder operations, filters and account-balance refresh.
- `VisualEditModal`, `AchievementFields` and `makeVisualForm` own the visual editor form and its fields.
- `VisualColorPicker` exports the palette and circular color control shared with territory banner editing in `src/features/territory-management/CityManagementProfile.jsx`.
- `bot/src/features/customization/telegram-discounts.js` owns Telegram banker discount parsing, active visual selection, atomic application, expiry and duplicate-update protection. Worker injects shared normalization, visual-tag matching, DB initialization, Telegram and response helpers.
- `bot/src/features/customization/telegram-inventory.js` owns main-inspector Telegram commands for granting/removing visuals from personal and territory inventories. It receives DB initialization, identity lookup, formatting, equipment reconciliation and marker initialization from `visual-equipment-service.js` through Worker composition, plus achievement checks and Telegram delivery; `worker.js` retains the shared text normalizer and webhook composition.
- `bot/src/features/customization/achievements.js` owns achievement requirement parsing/validation, territory progress evaluation, automatic visual/award persistence and the main-inspector recheck endpoint. It receives score calculation, marker setup from `visual-equipment-service.js` through Worker composition, notification, authorization, DB initialization and response helpers.
- `bot/src/features/customization/admin-service.js` owns main-inspector visual creation/editing, visibility, soft deletion and visual/tag ordering. Tag normalization/upsert and government-marker synchronization live with these operations; category cleanup and achievement evaluation remain injected Worker dependencies, while equipment reconciliation is supplied by `visual-equipment-service.js`.
- `bot/src/features/customization/catalog-service.js` owns authenticated full/lite catalog reads, account-scope resolution, role-based item visibility, active discount pricing and personal/territory inventory aggregation. Treasury manager lookup, role resolution, territory manager rows, marker setup from `visual-equipment-service.js`, category cleanup and discounted-price calculation are injected through Worker composition.
- `bot/src/features/customization/visual-equipment-service.js` owns `visualHasTag`, `ensureFirstCityMarker`, `territoryCanUseVisual` and `reconcileTerritoryVisualEquipment`. It keeps the territory/government type and inventory-ownership rules in one place, selects a deterministic first marker, and restores an achievement marker when an equipped marker becomes unavailable. Worker composes the service for HTTP handlers, Telegram inventory, purchases, achievements and membership/ownership lifecycle handlers.
- `bot/src/features/customization/image-service.js` owns the image response handler for `GET /api/customization/items/:id/image`. It reads stored `data:image/...;base64,...` content, returns decoded bytes with the original image MIME type, bounded cache headers, `nosniff`, timing metadata and CORS. It deliberately does not hide an image only because a visual is inactive or hidden from the catalogue: a territory may still be using an already-selected item.
- `bot/src/features/customization/city-appearance-service.js` owns the authenticated `GET` and `POST /api/customization/city` handlers. It assembles territory marker/banner data and available marker inventory, and validates manager changes to markers, banner colors and gradients. Authorization, D1 initialization, the shared `visualHasTag` helper, manager rows and JSON responses are injected from Worker.
- `bot/src/features/customization/purchase-service.js` owns the authenticated visual purchase endpoint, discounted purchase-price snapshot, personal/territory debit, inventory grant, `gem_spend_log` write, banker/manager receipts and post-purchase marker/achievement checks. The marker initializer is supplied by `visual-equipment-service.js` through Worker composition; the API route and `ctx.waitUntil` contract remain in Worker.
- The app shell supplies `apiErrorMessage`, `safeCaughtError`, `useAnimatedClose`, `IconButton`, `Field`, `readImageData`, `GemHex` and `MinecraftText` through the `ui` adapter. Root navigation still owns screen selection and supplies `initData`, profile, role, territory list and global toast callback.

## API and event contracts

The catalog read is implemented by `bot/src/features/customization/catalog-service.js`; Worker preserves the route and injects authorization, treasury scope, role, cleanup and pricing dependencies.

The module retains the existing API operations:
- `GET /api/customization?account=...` for the full inventory/catalog view;
- `GET /api/customization?lite=1&account=...` to refresh only account balance after `voxygen:currency-changed`;
- `GET /api/customization/items/:id/image` to serve an existing visual image. Worker retains the route and delegates image validation/decoding and response headers to `image-service.js`;
- `POST /api/achievements/recheck` for the main inspector;
- `POST /api/customization/items` to create a visual;
- `PATCH /api/customization/items/:id` to edit a visual;
- `POST /api/customization/items/visibility` to change catalog visibility;
- `POST /api/customization/items/reorder` and `POST /api/customization/tags/reorder` for ordering;
- `GET /api/customization/city?territoryId=...` to read a manager's territory appearance, eligible markers, award placements and recruitment contact;
- `POST /api/customization/city` to update the territory marker, banner color or banner gradient. Both routes delegate to `bot/src/features/customization/city-appearance-service.js`.
- `POST /api/customization/purchase` to purchase an item. The route delegates to `bot/src/features/customization/purchase-service.js`.

## Visual image delivery

- The Worker keeps the route matcher for `GET /api/customization/items/:id/image`; `image-service.js` owns the response handler and receives the shared CORS wrapper from Worker.
- The item ID is trimmed and limited to 160 characters before querying D1. The handler reads the stored `image_data` and accepts only base64 data URIs with an `image/*` media type.
- Valid content is decoded to bytes and returned with its stored MIME type, `X-Content-Type-Options: nosniff`, a five-minute public cache and `Server-Timing`.
- Missing items/images return 404, unsupported data-URI formats return 415, and unexpected D1/decoding failures return a generic 500 response. Failure responses use `Cache-Control: no-store` and expose only a bounded diagnostic code in Worker logs.
- The query intentionally does not filter by `active` or catalogue visibility. Those settings govern whether a visual appears in the catalogue, not whether an already-equipped territory marker or banner can load its image.

## Territory appearance API

- The read endpoint requires an authenticated manager of an approved territory. It returns the selected marker and banner settings, markers available from territory inventory and manager/member personal inventories, award placements, and the recruitment contact only while recruitment is enabled.
- The write endpoint keeps the manager-only rule and rejects government territories. Banner colors and gradient presets are restricted to explicit allowlists.
- A selected marker must be an active, non-government visual tagged `метка` and available through the territory, the requesting manager, a resident, or a territory manager. Sending an empty marker ID clears the selection.
- Marker and banner fields are written through the existing `city_customization` upsert. Omitted fields retain the previous partial-update behavior; the route request/response contract is unchanged.

## Visual equipment lifecycle

- `visualHasTag` performs the shared category/tag match using the category name and comma-separated tags.
- `ensureFirstCityMarker` keeps a valid equipped marker when possible. Otherwise it clears an inactive, wrong-type or inaccessible marker and chooses the earliest eligible ordinary marker from city/member/manager inventory, ordered by acquisition time, visual sort order and item ID.
- Government territories never borrow ordinary inventory; their equipped marker must be an active visual with `government_marker=1`.
- `territoryCanUseVisual` requires an approved territory, an active visual, a matching government/ordinary type, the requested tag and inventory ownership by the territory or its owner/manager/member.
- `reconcileTerritoryVisualEquipment` keeps a valid marker or falls back to the earliest territory-owned `метка` tagged `за достижение`. It does not create a `city_customization` row when none exists.
- Worker invokes reconciliation after membership, ownership and inventory changes and injects marker setup/reconciliation into catalog, purchase, achievement, admin and Telegram-inventory services.

## Territory visual achievements

- Achievement conditions support residents, spent gems, inspector score, player score, approved screenshots, comments and distinct active visuals in the territory inventory. Blank conditions are ignored; at least one condition must be specified for an achievement to be eligible.
- Requirement input is validated when a main inspector creates or edits a visual: count values are non-negative integers, score values are between 0 and 10, and out-of-range values are rejected with a field-specific response.
- Territory progress uses only visuals owned by that territory for the visual-count condition; personal inventory items owned by residents/managers are not counted.
- When every configured condition is met, the service idempotently adds the visual to `city_items` and records `achievement_awards`. It repairs a missing territory-inventory row even if the award ledger already exists.
- Achievements are evaluated in passes. A newly granted visual may satisfy the visual-count condition of another achievement, which can unlock in the same evaluation cycle.
- A new reward triggers the first-marker setup when applicable and notifies the territory founder. Notification delivery is best-effort and does not undo the award.
- `POST /api/achievements/recheck` remains main-inspector-only and returns checked, skipped, awarded and error counts for approved territories.

## Main-inspector Telegram visual inventory commands

- The existing webhook dispatch order is unchanged: visual-inventory commands are considered only after the account-deletion lock check and after personal withdrawal/banker commands; the dispatcher still gates them to the main inspector.
- Commands support target-first and visual-first forms. A leading minus before a visual name removes it; otherwise the visual is granted. The longest exact visual name wins to avoid shorter-name suffix collisions.
- Targets resolve against approved territories and the user directory. An exact territory name takes precedence over a same-spelled player nickname; ambiguous recipients are rejected.
- Territory grants/removals reconcile equipped territory visuals and reevaluate achievements; grants also ensure the first city marker. Personal removals reconcile the affected territories, while personal grants retain the account-deletion-lock guard.

## Telegram banker visual discounts

- Discount commands are accepted only from the configured banker in a private chat; the treasury Telegram handler validates the sender and delegates the command to the customization feature.
- The customization handler accepts exact visual names and category/tag names, or `Все` for every active visual. It supports setting a percentage and decreasing an existing percentage by percentage points for a minute/hour duration.
- `visual_discount_operations` reserves each Telegram `update_id`; the applying transition, discount changes and terminal state are committed through one D1 batch. A replay does not apply the command twice.
- `customization_discounts` stores the current percentage, expiry and updater. Expired discounts are not reduced, while a decrease that reaches zero removes the row.

## Purchase notifications

- Every completed visual purchase (personal balance or territory treasury) sends its purchase receipt to the configured banker via `BANKER_TELEGRAM_ID`; the main inspector is not the purchase-notification recipient.
- The banker receipt includes the buyer's copyable Minecraft nickname, Telegram contact/ID, purchased visual, price and payment source.
- If the purchase is charged to a territory treasury, opted-in founders/mayors also receive the separate territory-expense notice, excluding the buyer. Personal-balance purchases do not send territory expense notices.
- Notification delivery is best-effort and cannot roll back a completed purchase.

Existing Telegram init-data headers, payloads, role-dependent controls, account-scope request version guards, loading/error handling and toast behavior are preserved.

## Invariants

- Main-inspector controls remain role-gated; ordinary users retain the same catalog and purchase flow.
- Treasury choices are limited to territories where the viewer is owner/manager, with invalid scopes reset to personal.
- A slower response for an old account scope cannot replace data for the newly selected scope.
- The `voxygen:currency-changed` event refreshes only the currently selected account balance.
- Color palette values, color-dot dimensions and visual editor field semantics remain unchanged.
- No Worker routes, authorization, database tables or persistence behavior changed.

## Regression coverage

`tests/customization-ui.test.js` checks the module boundary, account-scope and stale-response guards, API routes/payloads, purchase and editor operations, palette sharing and event refresh behavior. `tests/telegram-visual-inventory.test.js` covers inspector grant/removal dispatch, target resolution, territory-vs-player precedence, deletion-lock behavior and side-effect wiring. Existing theme and award UI contract tests also load the extracted customization/palette modules where they verify the shared styling contracts.
