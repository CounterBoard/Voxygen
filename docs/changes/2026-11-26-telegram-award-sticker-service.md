# Telegram award sticker delivery service extraction — 2026-11-26

## Scope

Moved Telegram award sticker file delivery and its format/path/TGS validation helpers from `bot/src/worker.js` into `bot/src/features/territory-awards/sticker-delivery.js`.

The Worker continues to own the `GET /api/telegram-sticker` route and passes the existing shared infrastructure dependencies explicitly: Telegram API base URL, CORS response wrapper, D1 table initializer and Telegram Bot API helper.

## Preserved behavior

- Kept the route path, HTTP method and `stickerId` / `awardId` selectors.
- Kept D1 lookups, thumbnail selection, Telegram `getFile` resolution, file path/extension validation, payload size limits and TGS decompression/JSON validation.
- Kept successful response content types and caching, opaque error payloads, diagnostic header and CORS behavior.
- Kept the helper exports from `worker.js` as compatibility re-exports for existing test consumers.
- Did not move pack import, award grant/delete, authorization, shared D1 bootstrap, schema or migration logic.

## Validation added

- Updated `tests/territory-awards.test.js` to read the extracted service source and verify the Worker still dispatches the existing route to it.
- Added `tests/telegram-award-sticker-service.test.js` with direct service tests for invalid selectors, missing records, unavailable TGS previews and the Worker route/CORS integration.

## Documentation

- Updated `docs/features/TERRITORY_AWARDS_STICKER_DELIVERY.md` with the service ownership boundary and dependency contract.
- Updated `docs/ARCHITECTURE.md` with the backend service module (see architecture map).

No schema, migration, route payload, authorization or frontend changes are included.
