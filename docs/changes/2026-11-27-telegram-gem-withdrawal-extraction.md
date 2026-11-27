# Telegram gem withdrawal handler extraction

**Date:** 2026-11-27

## What changed

- Moved `parseGemWithdrawalCommand`, `formatGemWithdrawalBankerNotification` and `handleUserGemWithdrawal` out of `bot/src/worker.js` into `bot/src/features/treasury/telegram-withdrawal.js`.
- Added `createGemWithdrawalHandler` so D1 initialization, territory permission checks, Telegram delivery, response creation, Minecraft formatting cleanup and the shared financial transfer helper are explicit injected dependencies.
- Worker creates the handler from the existing runtime dependencies and passes it to the existing Telegram webhook dispatcher.
- Kept `parseGemWithdrawalCommand` and `formatGemWithdrawalBankerNotification` exported from `bot/src/worker.js` for the current test and compatibility surface.
- Added focused tests for personal/territorial withdrawals, manager authorization, duplicate webhook updates, invalid amounts, lock predicates and invalid update IDs.
- Added `docs/features/TREASURY.md` and updated `docs/ARCHITECTURE.md`.

## Scope intentionally left unchanged

Banker balance commands, their transaction ledger and visual-discount commands remain in Worker. This change does not move or rewrite `handleBankMessage`, `applyBankBalanceChange`, bank target resolution or customization discount behavior.

## Compatibility

No command syntax, permission rule, D1 statement, idempotency key/type, webhook dispatch order, Telegram response text or notification template was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
