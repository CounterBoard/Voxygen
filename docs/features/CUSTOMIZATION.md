# Customization screen and visual editor

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/customization/CustomizationScreen.jsx`  
**Shared palette:** `src/features/customization/VisualColorPicker.jsx`  
**API source:** `bot/src/worker.js` — customization, achievement and purchase routes; Telegram discount handling lives in `bot/src/features/customization/telegram-discounts.js`

## Purpose

The customization screen displays the visual catalog and inventory, allows users to switch between their personal account and eligible territory treasuries, and provides main-inspector controls for visual creation, editing, visibility, ordering and achievement rechecks.

## Module boundaries

- `CustomizationScreen` owns catalog/inventory state, personal-vs-treasury scope, stale-request guards, purchase and reorder operations, filters and account-balance refresh.
- `VisualEditModal`, `AchievementFields` and `makeVisualForm` own the visual editor form and its fields.
- `VisualColorPicker` exports the palette and circular color control shared with territory banner editing in `src/features/territory-management/CityManagementProfile.jsx`.
- `bot/src/features/customization/telegram-discounts.js` owns Telegram banker discount parsing, active visual selection, atomic application, expiry and duplicate-update protection. Worker injects shared normalization, visual-tag matching, DB initialization, Telegram and response helpers.
- `bot/src/features/customization/telegram-inventory.js` owns main-inspector Telegram commands for granting/removing visuals from personal and territory inventories. It receives DB initialization, identity lookup, formatting, equipment reconciliation, marker initialization, achievement checks and Telegram delivery as explicit dependencies; `worker.js` retains the shared text normalizer and webhook composition.
- The app shell supplies `apiErrorMessage`, `safeCaughtError`, `useAnimatedClose`, `IconButton`, `Field`, `readImageData`, `GemHex` and `MinecraftText` through the `ui` adapter. Root navigation still owns screen selection and supplies `initData`, profile, role, territory list and global toast callback.

## API and event contracts

The module retains the existing API operations:
- `GET /api/customization?account=...` for the full inventory/catalog view;
- `GET /api/customization?lite=1&account=...` to refresh only account balance after `voxygen:currency-changed`;
- `POST /api/achievements/recheck` for the main inspector;
- `POST /api/customization/items` to create a visual;
- `PATCH /api/customization/items/:id` to edit a visual;
- `POST /api/customization/items/visibility` to change catalog visibility;
- `POST /api/customization/items/reorder` and `POST /api/customization/tags/reorder` for ordering;
- `POST /api/customization/purchase` to purchase an item.

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
