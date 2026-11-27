# Treasury and gem withdrawals

**Updated:** 2026-11-27

## Module boundaries

- `bot/src/features/treasury/service.js` owns personal and territory treasury reads, API deposits/donations/withdrawals, financial-operation identifiers and the shared idempotent D1 transfer helper.
- `bot/src/features/treasury/telegram-withdrawal.js` owns Telegram personal and territory treasury withdrawal commands, their parsing, normalized territory lookup and banker notification formatting.
- `bot/src/telegram/formatting.js` provides escaped, copyable inline-code formatting for Minecraft nicknames in bot messages.
- `bot/src/worker.js` composes these modules with D1 initialization, permissions, Telegram delivery and the HTTP router.
- `bot/src/telegram/webhook.js` keeps the Telegram message dispatch order and calls the injected withdrawal handler before banker messages and inspector commands. Banker transfer commands and visual-discount commands remain separate Worker responsibilities for a later extraction.

## Telegram withdrawal behavior

Personal withdrawals accept a negative amount command, for example `-25` or `- 25`. Territory treasury withdrawals accept either `North City -25` or `-25 North City`. The parser also accepts the Unicode minus sign.

A withdrawal must be a safe positive integer and may not exceed 1,000,000,000 gems. Territory names are resolved against approved territories after Unicode normalization, Minecraft formatting removal, HTML/Markdown wrapper cleanup, invisible-character removal and whitespace/case normalization. A territory withdrawal is permitted only for its founder or manager. The user-facing invalid-amount prompt intentionally does not expose the internal upper bound.

## Financial and webhook invariants

- The handler delegates every accepted transfer to `executeIdempotentFinancialTransfer`; it does not maintain a second transaction implementation.
- The operation identifier remains `telegram-withdraw-<update_id>`, and the operation type distinguishes personal and territory treasury withdrawals.
- Conditional D1 debits require sufficient funds and are guarded against active account-deletion locks.
- The idempotency helper keeps the operation record, debit, credit placeholder and terminal status in one D1 batch. A completed replay must not debit again or send duplicate notifications.
- Failed or rejected transfers retain the existing Telegram response contract; a successful operation reads the resulting balance, attempts the configured banker notification and replies to the originating chat.
- API donations notify the territory activity audience using the `Донат в казну` template and the donor's Minecraft nickname. API deposits notify eligible managers and residents who enabled that territory's notifications, excluding the depositor. Both messages include the `сц` suffix and are suppressed for replayed operations.
- Minecraft nicknames shown in bot messages use Telegram HTML `<code>` formatting so they can be copied easily.
- Banker notification failure is intentionally non-fatal after a successful financial transfer.
- The webhook dispatcher continues to perform its account-deletion lock check before dispatching user messages.

## Validation

The relevant automated coverage is in `tests/security-and-bank.test.js`, `tests/treasury-service.test.js`, `tests/treasury-telegram-withdrawal.test.js`, `tests/treasury-notifications.test.js` and `tests/telegram-formatting.test.js`. Preserve these tests when changing command syntax, permission checks, transfer idempotency, lock predicates or notification behavior.
