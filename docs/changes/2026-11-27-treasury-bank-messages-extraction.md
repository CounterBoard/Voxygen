# Treasury Telegram banking service extraction

**Date:** 2026-11-27

## What changed

- Moved Telegram personal gem-withdrawal command parsing and handling into `bot/src/features/treasury/bank-messages.js`.
- Moved banker balance command parsing, player/territory target resolution, atomic balance/ledger updates and webhook bank-message handling into the same service.
- Added `createTreasuryBankMessageService` with explicit database, authorization, Telegram, response, financial-transfer and customization-handler dependencies.
- Worker preserves its legacy named export surface for `parseGemWithdrawalCommand`, `formatGemWithdrawalBankerNotification`, `parseBankCommand`, `applyBankBalanceChange` and `isPrivateBankerMessage`; the webhook still receives the same `handleUserGemWithdrawal` and `handleBankMessage` bindings.
- Visual-discount parsing/application remains in Worker and is injected into the bank message handler, ready for later extraction into `features/customization`.
- Updated financial atomicity source contracts to inspect the new treasury banking module and expanded deletion-lock source coverage.

## Compatibility and invariants

No Telegram update routing, private-banker identity rule, command syntax, D1 batch order, bank transaction status, replay behavior, deletion-lock predicate, recipient notification or response payload was intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
