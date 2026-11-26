# Customization screen and visual editor

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/customization/CustomizationScreen.jsx`  
**Shared palette:** `src/features/customization/VisualColorPicker.jsx`  
**API source:** `bot/src/worker.js` — customization, achievement and purchase routes

## Purpose

The customization screen displays the visual catalog and inventory, allows users to switch between their personal account and eligible territory treasuries, and provides main-inspector controls for visual creation, editing, visibility, ordering and achievement rechecks.

## Module boundaries

- `CustomizationScreen` owns catalog/inventory state, personal-vs-treasury scope, stale-request guards, purchase and reorder operations, filters and account-balance refresh.
- `VisualEditModal`, `AchievementFields` and `makeVisualForm` own the visual editor form and its fields.
- `VisualColorPicker` exports the palette and circular color control shared with territory banner editing in `src/features/territory-management/CityManagementProfile.jsx`.
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

Existing Telegram init-data headers, payloads, role-dependent controls, account-scope request version guards, loading/error handling and toast behavior are preserved.

## Invariants

- Main-inspector controls remain role-gated; ordinary users retain the same catalog and purchase flow.
- Treasury choices are limited to territories where the viewer is owner/manager, with invalid scopes reset to personal.
- A slower response for an old account scope cannot replace data for the newly selected scope.
- The `voxygen:currency-changed` event refreshes only the currently selected account balance.
- Color palette values, color-dot dimensions and visual editor field semantics remain unchanged.
- No Worker routes, authorization, database tables or persistence behavior changed.

## Regression coverage

`tests/customization-ui.test.js` checks the module boundary, account-scope and stale-response guards, API routes/payloads, purchase and editor operations, palette sharing and event refresh behavior. Existing theme and award UI contract tests also load the extracted customization/palette modules where they verify the shared styling contracts.
