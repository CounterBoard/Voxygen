# Backend awards feature folder alignment

**Date:** 2026-11-27

## What changed

- Moved `award-management.js` and `sticker-delivery.js` from `bot/src/features/territory-awards/` to `bot/src/features/awards/`.
- Updated the Worker imports and all backend service/contract test paths.
- Updated `docs/ARCHITECTURE.md`.

## Compatibility

Only backend module paths changed. Award grant/revoke behavior, D1 statements, authorization, Telegram API payloads, sticker validation and HTTP responses are unchanged. The frontend `src/features/territory-awards/` folder is intentionally untouched.
