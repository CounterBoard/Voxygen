# Treasury and gem withdrawals

**Updated:** 2026-11-27

## Module boundaries

- `bot/src/features/treasury/service.js` owns personal and territory treasury reads, API deposits/donations/withdrawals, financial-operation identifiers and the shared idempotent D1 transfer helper.
- `bot/src/features/treasury/telegram-withdrawal.js` owns Telegram personal and territory treasury withdrawal commands, their parsing, normalized territory lookup and banker notification formatting.
- `bot/src/features/treasury/telegram-bank.js` owns configured-banker message validation, bank command parsing, player/territory resolution, atomic balance updates and the `bank_transactions` ledger. It receives the visual-discount parser/handler as callbacks; customization discount implementation remains in Worker.
- `bot/src/telegram/formatting.js` provides escaped, copyable inline-code formatting for Minecraft nicknames in bot messages.
- `bot/src/worker.js` composes these modules with D1 initialization, permissions, Telegram delivery and the HTTP router.
- `bot/src/telegram/webhook.js` keeps the Telegram message dispatch order and calls the injected withdrawal handler before the injected banker handler and inspector commands. Banker balance transfers are handled by the treasury module; visual-discount implementation remains a separate Worker responsibility.

## Telegram withdrawal behavior

Personal withdrawals accept a negative amount command, for example `-25` or `- 25`. Territory treasury withdrawals accept either `North City -25` or `-25 North City`. The parser also accepts the Unicode minus sign.

A withdrawal must be a safe positive integer and may not exceed 1,000,000,000 gems. Territory names are resolved against approved territories after Unicode normalization, Minecraft formatting removal, HTML/Markdown wrapper cleanup, invisible-character removal and whitespace/case normalization. If a target-first negative command does not match an approved territory, the withdrawal handler returns control to the webhook so a banker command for a player nickname (for example, `CounterBoard-1`) can be resolved by the bank handler. A matching territory withdrawal is permitted only for its founder or manager. The user-facing invalid-amount prompt intentionally does not expose the internal upper bound.

## Banker commands and ledger invariants

- Only a message from `BANKER_TELEGRAM_ID` in that user's private chat is accepted for bank/discount command processing.
- Player targets resolve through the existing `users` and `user_directory` lookup and must identify exactly one Telegram user. Approved territory names are checked first; ambiguous territory names are rejected rather than interpreted as player names.
- Each accepted bank command reserves its Telegram `update_id` in `bank_transactions`. Replayed updates with a terminal ledger status do not perform another balance change.
- The balance update and transition of the ledger row to `success` or `rejected` are committed in one D1 batch. User balance changes also require the target account not to be deletion-locked.
- Territory debits notify eligible founders/mayors who enabled territory notifications, excluding the banker; territory credits retain the established manager/resident notification behavior.
- User balance changes retain the recipient notification and the banker's private receipt. A processing failure keeps the ledger row retryable and returns a retryable webhook error.

## Financial and webhook invariants

- The handler delegates every accepted transfer to `executeIdempotentFinancialTransfer`; it does not maintain a second transaction implementation.
- The operation identifier remains `telegram-withdraw-<update_id>`, and the operation type distinguishes personal and territory treasury withdrawals.
- Conditional D1 debits require sufficient funds and are guarded against active account-deletion locks.
- The idempotency helper keeps the operation record, debit, credit placeholder and terminal status in one D1 batch. A completed replay must not debit again or send duplicate notifications.
- Failed or rejected transfers retain the existing Telegram response contract; a successful operation reads the resulting balance, attempts the configured banker notification and replies to the originating chat.
- API donations and deposits notify eligible managers and residents who enabled that territory's notifications, excluding the donor/depositor. Both messages include the `сц` suffix and are suppressed for replayed operations.
- Every successful expense from a territory treasury (API withdrawal, Telegram withdrawal command, banker debit, or purchase paid from the territory treasury) notifies only founders/mayors who enabled that territory's notifications, excluding the actor. Failed and replayed operations do not send duplicate expense notices.
- Minecraft nicknames shown in bot messages use Telegram HTML `<code>` formatting so they can be copied easily.
- Banker notification failure is intentionally non-fatal after a successful financial transfer.
- The webhook dispatcher continues to perform its account-deletion lock check before dispatching user messages.

## Validation

The relevant automated coverage is in `tests/security-and-bank.test.js`, `tests/financial-atomicity.test.js`, `tests/telegram-bank-handler.test.js`, `tests/treasury-service.test.js`, `tests/treasury-telegram-withdrawal.test.js` and `tests/telegram-bank-handler.test.js`, `tests/treasury-notifications.test.js` and `tests/telegram-formatting.test.js`. Preserve these tests when changing command syntax, permission checks, transfer idempotency, lock predicates or notification behavior.
