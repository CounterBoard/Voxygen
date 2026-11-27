# Telegram visual inventory handler extraction

**Date:** 2026-11-27

## What changed

- Moved visual-inventory target resolution and `handleVisualInventoryCommand` from `bot/src/worker.js` into `bot/src/features/customization/telegram-inventory.js`.
- Added `createVisualInventoryHandler` with explicit world/user-directory initialization, text normalization, formatting, Telegram, equipment reconciliation, first-marker setup and achievement-evaluation dependencies.
- Moved the visual-inventory candidate parser into the module and retained a Worker compatibility adapter for the existing `parseVisualInventoryCandidates(rawText, items)` export.
- Preserved webhook dispatch order, longest-name matching, territory-over-user precedence, account-deletion-lock protection, inventory SQL and existing Telegram response text.
- Added focused tests for territory/user grants and removals, territory marker/achievement side effects, territory name precedence, deletion locks, inactive items, ambiguous recipients and unrelated messages.
- Updated architecture and customization feature documentation.

## Compatibility

No command syntax, visual selection precedence, D1 table/statement, webhook authorization gate, equipment reconciliation, achievement trigger or public API route was intentionally changed.

## Scope intentionally left unchanged

Visual catalog routes, purchase transactions, discounts and the territory equipment rules themselves remain unchanged.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run