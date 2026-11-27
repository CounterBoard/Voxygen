# Treasury notification corrections

**Date:** 2026-11-27

- Exclude the donor from territory donation notifications while retaining preference-filtered delivery to all opted-in territory members and managers.
- Notify opted-in founders and mayors, excluding the actor, after every successful territory treasury expense: API/Telegram withdrawals, banker debits, and purchases paid from the treasury.
- Keep expense notifications best-effort and suppress them for rejected or replayed financial operations.
- Add focused tests for donor exclusion and Telegram treasury-withdrawal notifications.
