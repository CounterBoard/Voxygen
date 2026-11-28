# Territory screenshots service extraction

**Date:** 2026-11-28

- Extracted screenshot upload, approved-gallery listing, moderation, deletion and image delivery from `bot/src/worker.js` into `bot/src/features/territories/screenshots-service.js`.
- Moved Telegram screenshot moderation callback handling into the same service while preserving callback payloads and webhook dispatch.
- Kept HTTP route matching and Telegram webhook composition in Worker.
- Added service tests for listing, authorization, one-time moderation, government deletion restrictions, cached image delivery and Telegram callback authorization.
- Updated the architecture map and screenshot feature documentation.
