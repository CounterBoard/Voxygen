# Telegram profile hook extraction — 2026-11-26

## Scope

Extracted profile loading, session-aware request lifecycle and nickname claim submission from `CityRatingApp` into `src/features/profile/useTelegramProfile.js`.

The hook owns role/profile state, loading/error state, request cancellation and generation refs, periodic/visibility refresh, and `POST /api/profile/claim`. The app shell supplies the identity-change callback that resets and reloads territories.

## Contracts preserved

- Profile refresh remains `POST /api/me` with JSON `{ initData }`, `cache: no-store` and a 15-second abort timeout.
- Same-session requests remain deduplicated; a changed Telegram init data aborts the previous request; stale responses remain ignored.
- The visibility listener and 60-second refresh interval remain.
- Verified inspector, empty profile, verified nickname, pending nickname and error states retain their previous mapping.
- Nickname claim remains `POST /api/profile/claim` with the same JSON fields and messages.
- No Worker, authorization, database or profile persistence code changed.

## Documentation and tests

- Added `docs/features/PROFILE_LOADING.md`.
- Updated `docs/ARCHITECTURE.md` with the profile hook.
- Added `tests/profile-loading-ui.test.js` for module ownership and lifecycle/API invariants.
