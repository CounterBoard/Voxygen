# Purchase notification recipient correction

**Date:** 2026-11-27

- Route completed visual-purchase notifications to the configured banker using `BANKER_TELEGRAM_ID`, not the main inspector's `INSPECTOR_CHAT_ID`.
- Preserve buyer identity, visual, price and payment-source details in the banker receipt.
- Keep the separate opted-in founder/mayor expense notification for purchases charged to a territory treasury.
- Add regression coverage and update customization and architecture documentation.
