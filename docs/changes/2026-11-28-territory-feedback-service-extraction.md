# Territory feedback backend service extraction

**Date:** 2026-11-28

- Extracted rating and review API handlers from `bot/src/worker.js` into `bot/src/features/territories/feedback-service.js`.
- Kept the Worker as the HTTP route owner and injected authentication, role checks, score calculation, manager notifications, achievement evaluation, formatting and response helpers.
- Preserved all public rating/comment routes and request/response contracts.
- Left inspector rating-request notifications and screenshot upload/moderation/image delivery in Worker; those workflows have different dependencies and will be considered separately.
- Added focused service tests for rating permissions and side effects, atomic review quota enforcement, reply-protected review edits and response normalization.
- Updated the architecture map and territory feedback feature documentation.
