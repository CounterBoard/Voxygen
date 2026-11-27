# Territory ratings and reviews

**Status:** current implementation  
**Updated:** 2026-11-28  
**UI source:** `src/features/territory-details/TerritoryFeedbackPanel.jsx`  
**API source:** `bot/src/features/territories/feedback-service.js` (composed by `bot/src/worker.js`)

## Purpose

The territory detail page embeds a feedback panel for rating territories and managing reviews. The backend service owns rating persistence and score aggregation inputs, review creation/edit/removal, manager replies and review listing. Screenshot upload/moderation remains a separate Worker responsibility for a later extraction.

## Request contracts

| Action | Request |
| --- | --- |
| Save rating | `POST /api/ratings` with `{ initData, territoryId, integrity, comfort, atmosphere, detail }` |
| List ratings | `GET /api/ratings?territoryId=...` |
| Add review | `POST /api/comments` with `{ initData, territoryId, text }` |
| Refresh reviews after create | `GET /api/comments?territoryId=...` |
| Add manager reply | `POST /api/comments/reply` with `{ initData, commentId, text }` |
| Edit review | `POST /api/comments/update` with `{ initData, commentId, text }` |
| Delete review | `POST /api/comments/delete` with `{ initData, commentId }` |
| Edit reply | `PATCH /api/comments/reply` with `{ initData, commentId, text }` |
| Delete reply | `DELETE /api/comments/reply` with `{ initData, commentId }` |

Worker keeps every public route and delegates to `createTerritoryFeedbackService`. Route paths, methods, request/response payloads and status codes are unchanged.

## Module boundaries and dependencies

- `feedback-service.js` owns the authenticated rating/review handlers and review/score-related persistence.
- Worker injects authentication, role/manager checks, D1 initialization, score calculation, Telegram notifications, achievement evaluation, formatting and JSON response helpers.
- `calculateTerritoryScores` remains in Worker for now because the achievement service also consumes it; the feedback service receives the same function through dependency injection.
- `requestInspectorRating` remains in Worker because it is an inspector-notification workflow, not a user rating write.
- Screenshot upload, listing, moderation, deletion and image delivery remain in Worker and are intentionally not mixed into this extraction.

## Invariants

- Rating criteria remain integrity, comfort, atmosphere and detail, each an integer from 1 through 5.
- Verified-user requirements, manager self-rating prohibition, inspector rating path, resident weighting, 20-hour cooldown and race-safe cooldown update remain unchanged.
- Score aggregation still weights resident ratings at one third and keeps the existing recent-vs-older sample weighting.
- A successful rating still notifies managers when the displayed score changes and triggers territory achievement evaluation.
- Review creation still enforces the five-review per-user/per-territory quota in the INSERT statement, then notifies managers and evaluates achievements.
- Only the review author or main inspector can delete a review; a review with a manager reply cannot be edited.
- Only territory managers can create, edit or delete replies. The first reply still notifies the review author.
- Existing approved-territory filtering, response field names and reply normalization are preserved.

## Regression coverage

- `tests/territory-feedback-service.test.js` covers rating permissions/side effects, review quota atomicity, reply-protected review editing and review-list response shape.
- `tests/territory-feedback-ui.test.js` continues to cover frontend routes, payloads, cooldown behavior and role-specific controls.
