# Telegram visual discount handler extraction

**Date:** 2026-11-27

## What changed

- Moved `parseVisualDiscountCommand` and `handleVisualDiscountMessage` from `bot/src/worker.js` to `bot/src/features/customization/telegram-discounts.js`.
- Added `createVisualDiscountHandler` with injected world-table initialization, command normalization, Minecraft formatting cleanup, visual-tag matching, Telegram delivery and response creation.
- Kept the treasury banker module as the command router: it still validates `BANKER_TELEGRAM_ID` and a private chat, then delegates discount messages to the customization callback.
- Preserved the `parseVisualDiscountCommand` Worker export for existing callers and tests.
- Added focused tests for applying/decreasing discounts, exact name/tag selection, D1 batch ordering, duplicate updates, no matches, invalid update IDs and best-effort Telegram receipts.
- Updated architecture, customization, treasury and discount documentation.

## Compatibility

Command grammar, `Все` semantics, visual name/tag matching, limits (1–100%), minute/hour duration syntax, decrease-by-percentage-points behavior, D1 statements, update ID uniqueness, terminal status, Telegram response texts and expiry rules are preserved.

## Scope intentionally left unchanged

No visual catalog API, price calculation, purchase flow, territory banner behavior or schema migration was changed. The `customization_discounts` and `visual_discount_operations` tables continue to be created by the existing world-schema initialization.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle