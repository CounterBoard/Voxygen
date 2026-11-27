# Voxygen architecture map

**Updated:** 2026-11-28

This document is the entry point for understanding the repository. Feature-level behavior and invariants belong in the corresponding file under `docs/features/`; this page explains where responsibilities live.

## Frontend

| Area | Location | Responsibility |
| --- | --- | --- |
| Application shell and screen composition | `src/App.jsx` | App-wide state, navigation, screen composition, shared UI primitives and cross-feature orchestration |
| Telegram profile lifecycle | `src/features/profile/useTelegramProfile.js` | Profile refresh, session-aware request cancellation/deduplication, role/status state and nickname claims |
| World map upload and publication UI | `src/features/world-map/MapUploadPanel.jsx` | Square-image validation, binary upload progress, manifest polling and recoverable publication status |
| World map viewport | `src/features/world-map/VoxMap.jsx` | Pan, pinch and wheel gestures, transform synchronization, visible deep-zoom / URL-grid tile selection, and territory marker rendering |
| World map asset loader | `src/features/world-map/useWorldMap.js` | Manifest/preview loading, legacy image fallback, retry and stale-request protection |
| Event/calendar feature | `src/features/events/` | Event screens and forms, date/time conversion and calendar controls |
| Territory award rendering and admin manager | `src/features/territory-awards/` | Telegram sticker rendering, award icons, source-pack gallery, award grants and issued-award administration |
| Admin tools | `src/features/admin-tools/` | Read-only D1 health report and JSON export, inspector assignment/removal, and confirmed-user administration (list/create/edit/delete) |
| User settings lifecycle | `src/features/settings/useUserSettings.js` | Loads effective theme, timezone and map zoom; manages request cancellation, polling, expiry refresh and readiness/error state |
| Global settings overlay | `src/features/settings/GlobalSettingsPanel.jsx` | Main-inspector control of global theme/zoom overrides, expiry and per-theme visibility rules |
| Customization feature | `src/features/customization/` | Visual catalog, account-scope selection, visual creation/editing, purchases, ordering and visibility controls |
| Territory summary data lifecycle | `src/features/territories/useTerritories.js` | Loads and normalizes the shared territory summary list, preserves fields for degraded API areas, and coalesces overlapping requests; `App.jsx` owns active-screen refresh scheduling |
| Territory detail screen | `src/features/territory-details/TerritoryDetail.jsx` | Loads and composes the selected territory, owns its local overlays and lightbox, and delegates screenshots and feedback to child feature modules |
| Territory feedback | `src/features/territory-details/TerritoryFeedbackPanel.jsx` | Territory rating, review creation/moderation and founder/manager replies |
| Territory screenshots | `src/features/territory-details/TerritoryScreenshotsPanel.jsx` | Screenshot gallery, image compression, upload approval request and owner/inspector deletion |
| Territory management | `src/features/territory-management/CityManagementProfile.jsx` | Owner/manager controls for residents, managers, recruitment, banner, marker and award placement |
| Shared frontend utilities | `src/shared/` | Small utilities used by more than one feature |
| API and asset configuration | `src/config/api.js` | Frontend API and map asset base URLs |
| Theme catalogue and visual rules | `shared/theme-catalog.js`, `shared/customization-visuals.js`, `src/theme/` | Theme definitions, visual recipes and CSS tokens |
| Global application shell styles | `src/theme/app-shell.css` | Global layout, typography, shared component states, overlays, animation rules and responsive styling |
| Static frontend assets | `src/assets/` | Bundled image assets referenced by frontend components |

## Backend and data

| Area | Location | Responsibility |
| --- | --- | --- |
| Cloudflare Worker router/runtime | `bot/src/worker.js` | HTTP route dispatch, remaining business handlers, authorization wiring and scheduled tasks; composes shared, auth, DB, Telegram and feature modules including treasury operations, customization catalog/admin/purchase/city appearance/category maintenance/image delivery/visual equipment, territory award placement, resident membership/invitations, manager role/voting lifecycle, banking and achievement services, and copyable nickname formatting |
| Telegram Web App authentication | `bot/src/auth/telegram.js` | Verifies initData HMAC and freshness, then extracts the signed Telegram user from request body, header or query string |
| Telegram Bot API client | `bot/src/telegram/api.js` | Shared outbound Telegram Bot API POST client; obtains the configured bot token and returns the raw Response plus parsed JSON payload |
| Telegram webhook dispatcher | `bot/src/telegram/webhook.js` | Validates the Telegram webhook secret, enforces account-deletion locks, syncs incoming Telegram identities and dispatches callback queries and messages to injected business handlers |
| Event backend service | `bot/src/features/events/service.js` | Event creation/edit/deletion, reminder persistence and scheduled delivery, event validation, and expiry cleanup; dependencies on auth, D1 initialization, Telegram and formatting are injected by the Worker |
| Treasury backend service | `bot/src/features/treasury/service.js` | Personal and territory treasury reads, deposits, donations and API withdrawals; shared financial-operation idempotency, D1 batch logic and treasury transaction notifications stay inside the service |
| Telegram gem withdrawal handler | `bot/src/features/treasury/telegram-withdrawal.js` | Parses personal and territory treasury withdrawal commands, normalizes territory names, checks manager access and runs idempotent D1 transfers with banker/user notifications; passes unmatched target-first debit syntax to the banker handler for player lookup |
| Telegram banker handler | `bot/src/features/treasury/telegram-bank.js` | Validates the configured banker, parses transfer commands, resolves player/territory targets, applies balance changes and atomically finalizes the `bank_transactions` ledger; visual-discount commands are delegated to customization |
| Telegram visual discount handler | `bot/src/features/customization/telegram-discounts.js` | Parses banker discount commands, selects active visuals by name/tag or all, and applies idempotent D1 discount operations with expiry and Telegram receipts |
| Telegram visual inventory handler | `bot/src/features/customization/telegram-inventory.js` | Resolves inspector grant/removal commands for personal or territory inventories, applies item changes and triggers territory equipment reconciliation, marker setup and achievement checks |
| Customization achievement service | `bot/src/features/customization/achievements.js` | Validates achievement requirements, evaluates territory progress, grants achievement visuals with self-healing inventory persistence, sends founder notices and supports main-inspector bulk rechecks |
| Customization admin service | `bot/src/features/customization/admin-service.js` | Owns main-inspector visual create/edit, visibility, soft deletion and catalog/tag ordering, including tag upsert and government-marker synchronization |
| Customization catalog service | `bot/src/features/customization/catalog-service.js` | Builds authenticated full/lite catalog and inventory responses, applies role-based visibility and discounts, resolves personal/treasury account scope and assembles territory inventory/awards |
| Customization purchase service | `bot/src/features/customization/purchase-service.js` | Executes personal and territory visual purchases with conditional D1 debits, atomic inventory/spend-log writes, banker/manager notifications and achievement side effects |
| Customization city appearance service | `bot/src/features/customization/city-appearance-service.js` | Reads territory appearance data and validates/persists manager-selected marker, banner color and gradient; Worker retains the HTTP routes |
| Customization visual equipment service | `bot/src/features/customization/visual-equipment-service.js` | Matches visual tags, initializes a territory's first valid marker, validates equipped-visual eligibility and reconciles stale equipment after membership/inventory changes; composed by Worker for feature handlers |
| Customization image service | `bot/src/features/customization/image-service.js` | Reads stored visual image data, validates image data URIs, decodes bytes and returns CORS/cache/content-security headers; Worker retains the image route |
| Customization category maintenance | `bot/src/features/customization/category-maintenance.js` | Removes category tags unused by active visuals and compacts remaining category order; shared by Worker DB initialization, customization admin and catalog services |
| Telegram formatting helpers | `bot/src/telegram/formatting.js` | Escapes Telegram HTML and renders Minecraft nicknames as copyable inline code |
| Purchase notifications | `bot/src/worker.js` | Sends every completed visual purchase notification to the configured banker (`BANKER_TELEGRAM_ID`); territory-funded purchases additionally notify opted-in founders/mayors |
| Authorization and role checks | `bot/src/auth/permissions.js` | Resolves user/inspector roles and checks authenticated, verified-user, main-inspector and territory-manager permissions using injected runtime dependencies |
| Shared backend request validation | `bot/src/shared/validation.js` | Pure parsing of coordinate input formats; deliberately does not apply territory range, authorization or persistence rules |
| Shared backend HTTP responses | `bot/src/shared/responses.js` | Common CORS response wrapper and safe JSON response normalization, including stable HTTP error codes |
| Telegram award sticker delivery | `bot/src/features/awards/sticker-delivery.js` | Telegram sticker file lookup, preview selection, path/format/size validation, TGS decompression and safe response headers; injected Worker infrastructure keeps this service independent of the router |
| Territory award management | `bot/src/features/awards/award-management.js` | Main-inspector award catalog, Telegram pack import/removal, metadata snapshot grants, manager notifications and issued-award deletion; authorization and D1 bootstrap are injected by the Worker |
| Territory award placement service | `bot/src/features/awards/placement-service.js` | Authenticated territory-manager equip/unequip operations, atomic slot clearing/compaction and the four-award placement limit; Worker retains the HTTP route |
| Territory manager change service | `bot/src/features/territories/manager-change-service.js` | Applies approved promote/demote decisions, including verified-account guards, atomic membership/manager changes, owner handoff and post-write race verification; voting/finalization routes remain in Worker |
| Territory manager voting service | `bot/src/features/territories/manager-change-voting-service.js` | Records eligible votes, claims/reclaims finalization leases, computes and persists decisions, runs expiry sweeps and handles Telegram vote callbacks; Worker retains vote initiation routes and dispatch |
| Territory resident membership service | `bot/src/features/territories/membership-service.js` | Creates invitations, claims and retries Telegram delivery, binds pending nickname invitations, reads member/manager/invite data, cancels invitations, removes residents, processes resident leave and invite callbacks; Worker retains HTTP routing plus webhook and scheduled dispatch |
| Territory feedback service | `bot/src/features/territories/feedback-service.js` | Owns authenticated rating and review handlers, score-change notifications, review quota and manager replies; Worker retains route dispatch, score aggregation dependency and screenshot workflows |
| D1 diagnostics service | `bot/src/features/diagnostics/d1-diagnostics.js` | Main-inspector-only, read-only database inventory, orphan/FK checks and data-volume report; receives auth and JSON helpers from the Worker and never initializes schema |
| Admin site content service | `bot/src/features/admin-tools/site-content.js` | FAQ and home feature button defaults, normalization, role-aware reads and authenticated writes using existing `app_settings` table helpers |
| Admin global settings service | `bot/src/features/admin-tools/global-settings.js` | Main-inspector-only theme/map-zoom override reads, writes, clearing and theme-access rules; Worker retains DDL/cache and the shared personal-settings reader |
| Lazy database initialization | `bot/src/db/initialization.js` | Owns cached world, recruitment, `app_settings`, event, user-preference and global-settings initialization plus intentionally repeatable manager-change, approval-session and user-directory setup |
| Versioned world schema migration | `bot/src/db/migrations/world-schema.js` | World database schema migration `2026-11-v41`; owns table/column/index/trigger DDL and calls manager-change and user-directory helpers provided by DB initialization plus the injected `category-maintenance.js` cleanup helper |
| Database schema | `bot/schema.sql` | D1 tables and indexes |
| Worker configuration | `bot/wrangler.toml` | Cloudflare deployment configuration |
| Shared world geometry | `shared/world-map-coordinates.js` | Canonical world coordinate bounds and coordinate conversion |

## Tests and documentation

- `tests/` contains API/business-rule tests and frontend contract tests.
- `docs/features/` documents feature boundaries, data flow and behavior that must remain stable.
- `docs/changes/` records implementation changes in chronological order; update it alongside feature documentation for behavior changes.
- `docs/design-system/` contains design tokens, component rules and QA guidance.

## Safe change workflow

1. Read the relevant feature document and inspect its callers before editing.
2. Keep API payloads, permissions, persistence and UI behavior unchanged unless the task explicitly requires a product change.
3. Add or update focused tests alongside the implementation.
4. Run the full test suite and production build through CI.
5. Update this architecture map when module ownership or dependencies change, and update the feature document and changelog in the same commit.

Feature modules should own cohesive UI/behavior. Shared primitives should be extracted only when there are multiple real consumers; avoid moving app-wide state or backend behavior into a visual component.
