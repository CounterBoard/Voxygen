# Telegram webhook dispatcher extraction

**Date:** 2026-11-27

## What changed

- Moved Telegram webhook secret validation and the complete `webhook(request, env)` dispatcher into `bot/src/telegram/webhook.js`.
- Added `createTelegramWebhookHandler`, which receives shared response, database, Telegram API and business-handler dependencies explicitly.
- Worker constructs the handler once and keeps routing `POST /api/webhook` to it.
- Updated account-deletion-lock source contracts to inspect the new webhook module while continuing to scan backend sources for SQL triggers.
- Updated `docs/ARCHITECTURE.md`.

## Security and ordering invariants preserved

- Missing/invalid configured secrets fail closed before parsing the update.
- The Telegram secret header is compared before processing any callback or message.
- Account-deletion lock checks run before user synchronization, invite notifications, bank withdrawal and other command handlers.
- Callback routing, authorization checks, message processing and response payloads retain their previous order and status codes.

## Compatibility

No webhook URL, method, secret header, callback prefix, handler signature, database mutation, Telegram method or response payload was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
