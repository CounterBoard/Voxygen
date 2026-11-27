# Customization image service extraction

**Date:** 2026-11-27

## What changed

- Moved `serveCustomizationItemImage` from `bot/src/worker.js` into `bot/src/features/customization/image-service.js`.
- Added `createCustomizationImageService` with the shared CORS response wrapper injected by Worker.
- Kept the existing `GET /api/customization/items/:id/image` route matcher and handler arguments in Worker.
- Preserved ID trimming/length validation, D1 lookup, data-URI allowlist, MIME type, byte decoding, cache policy, `nosniff`, `Server-Timing`, CORS and safe error responses.
- Preserved the rule that inactive/hidden catalogue items can still serve images when an existing territory appearance references them.
- Added tests for successful byte delivery, inactive visual delivery, invalid IDs, missing image data, unsupported URI formats and safe server failures.

## Compatibility

No route, D1 schema, catalogue visibility rule, image format contract or frontend URL was intentionally changed. Catalogue visibility remains separate from image availability for already-selected appearance assets.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run
