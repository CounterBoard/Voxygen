# Territory ratings and reviews

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/territory-details/TerritoryFeedbackPanel.jsx`  
**API source:** `bot/src/worker.js` — ratings and comments routes

## Purpose

The territory detail page embeds a separate feedback panel for rating the territory and managing reviews. The panel includes the one-rating cooldown, review creation, author/inspector moderation, manager replies and reply editing/removal.

## Request contracts

| Action | Request |
| --- | --- |
| Save rating | `POST /api/ratings` with `{ initData, territoryId, integrity, comfort, atmosphere, detail }` |
| Add review | `POST /api/comments` with `{ initData, territoryId, text }` |
| Refresh reviews after create | `GET /api/comments?territoryId=...` |
| Add manager reply | `POST /api/comments/reply` with `{ initData, commentId, text }` |
| Edit review | `POST /api/comments/update` with `{ initData, commentId, text }` |
| Delete review | `POST /api/comments/delete` with `{ initData, commentId }` |
| Edit reply | `PATCH /api/comments/reply` with `{ initData, commentId, text }` |
| Delete reply | `DELETE /api/comments/reply` with `{ initData, commentId }` |

The panel keeps the original confirmation prompts, author/inspector delete rules, owner-only reply actions, retry-at handling and 20-hour fallback cooldown timestamp.

## Ownership and state flow

`TerritoryFeedbackPanel` owns rating values/cooldown state, the one-second cooldown display clock, new review draft, and review/reply editing state. It receives the current base territory (for reset behavior), the current enriched territory, the parent state setter, identity/role flags and shared feedback callback from `TerritoryDetail`.

Shared controls and text renderers are passed through the `ui` adapter. The parent remains the source of truth for the territory object and keeps ownership of its toast timer; successful panel operations update the territory through `setTerritory` and display feedback through `onFlash`.

## Invariants

- Rating criteria and labels are unchanged; inspector/player slider variants remain role-specific.
- Cooldown reset and retry-at response handling remain unchanged.
- Review creation still reloads the comments endpoint; subsequent edits use optimistic local updates as before.
- Only the review author or main inspector can delete a review; only the territory owner/manager can reply/edit/delete replies.
- No API route, request payload, authorization, Worker, database or persistence code changed.

## Regression coverage

`tests/territory-feedback-ui.test.js` checks the extracted panel boundary, request methods/payloads, cooldown/reset behavior, role-specific actions and shared feedback callbacks.
