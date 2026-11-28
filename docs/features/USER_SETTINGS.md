# User settings lifecycle

**Status:** current implementation  
**Updated:** 2026-11-28  
**UI/state hook:** `src/features/settings/useUserSettings.js`  
**API service:** `bot/src/features/settings/service.js` — `GET/POST /api/user-settings`  
**Route dispatch:** `bot/src/worker.js`  
**Related UI:** `GlobalSettingsPanel.jsx`, `Events.jsx`

## Purpose and ownership

`useUserSettings` owns the user's effective theme, map zoom and timezone state, plus the authenticated settings refresh lifecycle. It provides one `applyUserSettings` function used by initial server loading, profile settings saves and the main-inspector global settings panel. It also owns the retry trigger and the readiness/error state consumed by the map and event screens.

`App.jsx` remains responsible for application composition and map viewport state. It passes the stable `setVoxView` state setter to the hook so the hook can reset the viewport when the effective zoom preference changes or provide a safe fallback when settings cannot be loaded.

The call to `useUserSettings` remains immediately after the root profile-refresh effect. This preserves the original relative order of startup effects: profile refresh is registered before user-settings refresh. The hook does not own page navigation or screen visibility.

## Request contract

The hook sends `GET /api/user-settings` with the current `X-Telegram-Init-Data` value, `cache: no-store` and an `AbortController` signal. A request has a 15-second timeout.

A request version prevents an older response from updating state after a newer request starts. Hiding the document increments the version and aborts the current request; returning to the visible state triggers a fresh request. The hook polls every 15 seconds while mounted. All request timers, interval timers, expiry timers and event listeners are cleaned up on effect teardown.

If no Telegram init data is available, timezone and map readiness are marked complete without attempting a request. On failure, the hook exposes the existing user-facing error text and gives the map a default viewport only when no viewport is already present.

## Effective settings and refresh

The shared `applyUserSettings` method:
- normalizes the theme using the theme catalogue;
- normalizes the timezone using the existing fixed-offset helper;
- resolves the effective map zoom from `mapZoomPercent` / `personalMapZoomPercent` with the existing default;
- resets the map viewport only when the zoom preference is first resolved or changes;
- marks map zoom ready, and optionally marks timezone ready / clears its load error for successful initial or profile-save recovery.

The next active global map-zoom expiry is read from `globalOverrides.mapZoomPercent.expiresAt`. The hook schedules a refresh just after that expiry, so the app switches back to the current personal preference without requiring a reload.

Profile settings saves call `applyUserSettings` and trigger a retry refresh. `GlobalSettingsPanel` calls the same apply method after a successful change. Event screens receive `timezoneOffset`, readiness/error state and the retry callback.

## Backend service boundary

The backend service owns the authenticated GET/POST handlers and the effective-settings calculation. It receives the existing authentication, table-readiness, role lookup, timezone normalization and JSON response helpers from the Worker. It does not own D1 schema initialization or route dispatch.

The service preserves the legacy response aliases (defaultTheme and theme), retired allNotifications compatibility field, per-territory preference defaults, global theme/map-zoom override precedence and opt-out markers. ensureUserPreferenceTables and ensureGlobalSettingsTable remain in the database initialization module and are injected unchanged.

## Dependency boundary

The hook imports theme, map zoom and timezone normalization helpers from their canonical modules. It receives only `apiErrorMessage` and the root's `setVoxView` setter through its inputs. It does not import `App.jsx`, the profile screen, the event screen or the global settings panel.

## Regression coverage

`tests/user-settings-loading-ui.test.js` protects the request/auth/cache/timeout contract, cancellation and stale-response handling, visibility/polling/expiry timers, settings normalization, viewport reset, save/retry integration and effect ordering relative to profile refresh.

This extraction does not change the Worker route, settings response shape, timezone format, theme precedence, map zoom calculation or global override persistence behavior.
