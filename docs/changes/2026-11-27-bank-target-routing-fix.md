# Banker player nickname versus territory withdrawal routing

**Date:** 2026-11-27

## Issue

The Telegram webhook dispatches gem withdrawals before banker transfers. The withdrawal parser accepts `Target-amount` and `Target - amount` as territory withdrawal syntax. When a player's nickname was not an approved territory, the withdrawal handler replied `Территория не найдена` and returned early, preventing the banker handler from resolving that same target as a player.

## Fix

- Ambiguous approved territory names still produce the territory ambiguity response.
- An exact approved territory match still follows the existing manager permission and treasury withdrawal path.
- When no approved territory matches, the withdrawal handler now returns `null`, allowing the next webhook handler to resolve the command as a player bank debit.
- Added regression coverage for `CounterBoard-1` and `CounterBoard -1` in both withdrawal routing and banker target resolution.

## Compatibility

Personal withdrawals, approved-territory withdrawals, authorization, idempotency, ledger handling and notifications are unchanged.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
