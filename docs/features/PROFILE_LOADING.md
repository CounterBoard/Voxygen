# Telegram profile loading

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI/state source:** `src/features/profile/useTelegramProfile.js`  
**API source:** `bot/src/worker.js` — `POST /api/me`, `POST /api/profile/claim`

## Ownership

`useTelegramProfile` owns the current role and profile, profile loading state/error, request cancellation and deduplication, periodic/visibility refresh, and nickname claim submission. The root app consumes the hook result and passes it to the profile screen.

## Profile refresh contract

- The hook sends `POST /api/me` with JSON `{ initData }`, `Content-Type: application/json` and `cache: no-store`.
- A request is aborted after 15 seconds. Requests for the same init data are deduplicated; a request for changed init data aborts the prior one.
- A monotonically increasing request version prevents a stale response or catch handler from changing current profile state.
- Profile refresh runs at mount, when the document becomes visible, and every 60 seconds.
- A successful response maps role, verified/empty profile and nickname state separately. A failed request never falls through to the nickname-claim state.

## Telegram identity changes

The hook initializes its active Telegram ID from the Telegram WebApp user and compares it with the ID returned by `/api/me`. When a previously known ID changes, it invokes the supplied callback. The app shell uses that callback to reset and reload the territory list so data from one account is not kept under another account.

The callback is held in a ref and read at request completion, so it always uses the latest app-level handler without restarting the profile refresh timer.

## Nickname claim

The hook sends `POST /api/profile/claim` with JSON `{ nickname, initData }`. It keeps the current validation and user-facing messages and updates the local profile only after the standard API response parser accepts the result.

## Invariants

- No authorization, role assignment or persistence rules are moved out of the Worker.
- Request methods, endpoints, payload fields, request timeout, retry cadence and visibility behavior remain unchanged.
- Stale responses cannot overwrite a newer session's state.
- Errors do not authorize nickname claiming; only a successful profile response can produce `needs_nickname`.

## Regression coverage

`tests/profile-loading-ui.test.js` verifies the hook boundary, request contracts, timeout/cancellation/deduplication, role/status mapping, identity-change callback and nickname claim behavior.
