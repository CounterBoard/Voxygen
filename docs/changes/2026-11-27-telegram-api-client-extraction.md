# Telegram Bot API client extraction

**Date:** 2026-11-27

## What changed

- Moved the shared outbound `telegram(env, method, payload)` helper and API base URL into `bot/src/telegram/api.js`.
- Worker imports the function under the same name; all existing callsites continue using the same signature.
- Added tests for missing-token behavior, token trimming, request URL/method/headers/body and parsed Telegram response.
- Updated `docs/ARCHITECTURE.md`.

## Compatibility

The helper still sends JSON POST requests to the Telegram Bot API and returns `{ response, data }`. It does not change retry behavior, Telegram methods, payloads, response handling or bot-token configuration.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
