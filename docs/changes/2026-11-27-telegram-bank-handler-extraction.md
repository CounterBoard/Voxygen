# Telegram banker handler extraction

**Date:** 2026-11-27

## What changed

- Moved banker command parsing, player/territory target resolution, D1 balance-and-ledger updates, private banker identity checks and `handleBankMessage` into `bot/src/features/treasury/telegram-bank.js`.
- Added `createTelegramBankHandler` with explicit dependencies for DB initialization, target normalization, formatting, Telegram delivery, responses and territory notifications.
- Kept the existing visual-discount implementation in Worker and injects its parser/handler into the new banker handler as a callback; the dispatch path and command precedence are unchanged.
- Preserved the Worker exports used by existing test contracts: `parseBankCommand`, `isPrivateBankerMessage` and `applyBankBalanceChange`.
- Updated financial atomicity source tests to inspect the new module and added focused tests for private-chat gating, personal transfers, ledger replay, territory debit notifications, discount delegation and insufficient funds.
- Updated the treasury feature documentation and architecture map.

## Compatibility

The bank command grammar, private banker identity check, `bank_transactions` schema and status names, Telegram update ID idempotency, D1 batch order, account-deletion lock predicates, response text, recipient messages and territory notification rules remain unchanged.

## Scope intentionally left unchanged

Visual discount parsing and persistence stay in Worker and remain part of the same banker message dispatch through an injected callback. No customization purchase, visual-discount SQL, API treasury endpoint or public HTTP route was moved or rewritten.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle