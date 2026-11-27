# Treasury and gem withdrawals

**Updated:** 2026-11-27

## Module boundaries

- `bot/src/features/treasury/service.js` owns personal and territory treasury reads, API deposits/donations/withdrawals, financial-operation identifiers and the shared idempotent D1 transfer helper.
- `bot/src/features/treasury/telegram-withdrawal.js` owns Telegram personal and territory treasury withdrawal commands, their parsing and banker notification formatting.
- `bot/src/worker.js` composes these modules with D1 initialization, permissions, Telegram delivery and the HTTP router.
- `bot/src/telegram/webhook.js` keeps the Telegram message dispatch order and calls the injected withdrawal handler before banker messages and inspector commands. Banker transfer commands and visual-discount commands remain separate Worker responsibilities for a later extraction.

## Telegram withdrawal behavior

Personal withdrawals accept a negative amount command, for example `-25` or `- 25`. Territory treasury withdrawals accept either `North City -25` or `-25 North City`. The parser also accepts the Unicode minus sign.

A withdrawal must be a safe positive integer and may not exceed 1,000,000,000 gems. Territory names are resolved against approved territories after Minecraft formatting is removed and whitespace/case are normalized. A territory withdrawal is permitted only for its founder or manager.

## Financial and webhook invariants

- The handler delegates every accepted transfer to `executeIdempotentFinancialTransfer`; it does not maintain a second transaction implementation.
- The operation identifier remains `telegram-withdraw-<update_id>`, and the operation type distinguishes personal and territory treasury withdrawals.
- Conditional D1 debits require sufficient funds and are guarded against active account-deletion locks.
- The idempotency helper keeps the operation record, debit, credit placeholder and terminal status in one D1 batch. A completed replay must not debit again or send duplicate notifications.
- Failed or rejected transfers retain the existing Telegram response contract; a successful operation reads the resulting balance, attempts the configured banker notification and replies to the originating chat.
- Banker notification failure is intentionally non-fatal after a successful financial transfer.
- The webhook dispatcher continues to perform its account-deletion lock check before dispatching user messages.

## Validation

The relevant automated coverage is in `tests/security-and-bank.test.js`, `tests/treasury-service.test.js` and `tests/treasury-telegram-withdrawal.test.js`. Preserve these tests when changing command syntax, permission checks, transfer idempotency, lock predicates or notification behavior.
