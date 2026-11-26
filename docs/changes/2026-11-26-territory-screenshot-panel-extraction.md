# Territory screenshot panel extraction — 2026-11-26

## Scope

Moved screenshot gallery JSX, upload/delete handlers and the image compression helper from `TerritoryDetail` into `src/features/territory-details/TerritoryScreenshotsPanel.jsx`.

The parent still owns the enriched territory object, the derived approved screenshot list and the Lightbox. The panel reports open/delete events through callbacks and updates screenshot records through the parent's existing state setter.

## Contracts preserved

- Upload stays `POST /api/screenshots` with the same multipart field names and Telegram init-data header.
- Delete stays `DELETE /api/screenshots/:id` with the same JSON body.
- Compression max edge (1280px), JPEG type, quality (0.70) and filename suffix remain unchanged.
- Upload and deletion role rules, success/error messages, thumbnail layout and lightbox selection remain unchanged.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/TERRITORY_SCREENSHOTS.md`.
- Updated `docs/ARCHITECTURE.md` to describe screenshot gallery ownership.
- Added `tests/territory-screenshots-ui.test.js` for request, compression, permission and callback contracts.
