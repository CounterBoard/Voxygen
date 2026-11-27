# Territory screenshots

**Status:** current implementation  
**Updated:** 2026-11-28  
**UI source:** `src/features/territory-details/TerritoryScreenshotsPanel.jsx`  
**API source:** `bot/src/features/territories/screenshots-service.js` (composed by `bot/src/worker.js`)

## Purpose

The territory detail page lets verified users upload screenshots, displays approved screenshots, and lets authorized managers or the main inspector moderate or delete them. The service owns screenshot upload, persistence, moderation, listing, deletion and image delivery. The Worker retains HTTP route matching and Telegram webhook dispatch.

## API contracts

| Action | Route |
| --- | --- |
| Upload | `POST /api/screenshots` (multipart: `territoryId`, `photo`, `initData`) |
| List approved screenshots | `GET /api/screenshots?territoryId=...` |
| Serve approved image | `GET /api/screenshots/:id` |
| Delete approved screenshot | `DELETE /api/screenshots/:id` |
| Moderate screenshot | `POST /api/screenshots/:id` with `{ initData, approve }` |

The route paths, methods, multipart fields, response shapes and status codes remain unchanged. Telegram moderation callbacks retain `screenshot_ok:<id>` and `screenshot_no:<id>`.

## Workflow and invariants

- Upload requires a verified user, an approved territory, a JPEG file and the existing 10 MB source-file limit.
- The frontend continues to compress images to 1280 px maximum dimension and JPEG quality 0.70 before upload.
- Government-territory screenshots are stored directly as approved images, without Telegram moderation. The post-compression binary limit remains 900 KB.
- Ordinary user screenshots are sent to territory managers for Telegram moderation; inspector and main-inspector uploads follow the existing direct-approval path.
- Telegram file IDs remain the primary image reference. A bounded base64 cache is stored when Telegram file retrieval succeeds; image delivery prefers that cache and otherwise fetches the image from Telegram.
- Only approved screenshots appear in gallery listing or image delivery. Rejected and pending screenshots remain inaccessible through the public image route.
- The main inspector can moderate or delete screenshots. Territory managers can moderate pending screenshots and delete approved screenshots on their own non-government territories. Government screenshot deletion remains main-inspector-only.
- Moderation updates are conditional on `status='pending'`, preventing a second approval/rejection from overwriting the first decision.
- Approving a screenshot through the HTTP moderation route still triggers territory achievement evaluation. Telegram callback moderation retains its existing callback acknowledgements and button cleanup behavior.
- Screenshot gallery authors prefer the stored Minecraft nickname, then Telegram username, then `id<telegram_id>`.

## Module boundary

- `screenshots-service.js` receives authorization, D1 initialization, role/manager lookup, Telegram API access, achievement evaluation, CORS and JSON helpers through dependency injection.
- Worker keeps public route dispatch and passes `handleScreenshotCallback` to the Telegram webhook dispatcher.
- Frontend compression, upload progress, gallery state and lightbox remain in `TerritoryScreenshotsPanel.jsx` and `TerritoryDetail.jsx`.
