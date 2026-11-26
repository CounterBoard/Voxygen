# Telegram award sticker delivery service extraction — 2026-11-26

## Scope

Moved Telegram custom-emoji sticker format/path validation and the `GET /api/telegram-sticker` delivery handler from `bot/src/worker.js` into `bot/src/features/territory-awards/sticker-delivery.js`.

The Worker remains the HTTP router and injects the existing `TELEGRAM_API`, `withCors`, `ensureWorldTables` and `telegram` functions into the handler. The existing named helper exports remain available from `worker.js` for current consumers and tests. `addTelegramAwardPack` continues to use the same URL, set-type and sticker-format helpers through module imports.

## Preserved behavior

- Kept `GET /api/telegram-sticker`, its `stickerId` / `awardId` selector contract and preview behavior.
- Kept the same D1 queries and `ensureWorldTables` bootstrap call.
- Kept Telegram `getFile`, upstream file retrieval, extension/path checks, TGS gzip decompression and JSON validation.
- Kept payload size limits, cache policy, CORS/security headers, opaque error codes and privacy-safe logs.
- Did not change award pack import, award granting, award placement, schema initialization or D1 schema.

## Regression coverage and documentation

- Updated `tests/territory-awards.test.js` to inspect the new service ownership while retaining the Worker route assertion.
- Added `tests/telegram-award-sticker-service.test.js` with handler-level tests for invalid selectors, missing records and missing TGS preview thumbnails.
- Updated `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md`, `docs/ARCHITECTURE.md` and `Functional_System.txt` to identify the new module and the Worker dependency boundary.
