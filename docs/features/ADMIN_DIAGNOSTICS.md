# Main inspector D1 diagnostics

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/admin-tools/D1DiagnosticsPanel.jsx`  
**API route:** `bot/src/worker.js` — `GET /api/admin/diagnostics/d1`  
**Read-only report service:** `bot/src/features/admin-tools/d1-diagnostics.js` — `getD1Diagnostics`, `sqlIdentifier`

## Purpose

The main inspector can request a read-only health report for the Voxygen D1 database. The panel is deliberately separate from data repair and cleanup actions: it reports observations and never changes database records.

## Request and response contract

The panel sends a GET request to `/api/admin/diagnostics/d1` with the existing `X-Telegram-Init-Data` authorization header and `cache: no-store`.

The response must explicitly contain `readOnly: true`. Any other value is treated as an invalid report and is not shown as a successful diagnostic result.

The report currently presents four summary measures:

- orphan rows associated with territories;
- orphaned relation rows;
- foreign-key violations;
- report warnings.

The capture timestamp and number of inspected tables are shown above the summary. The complete response remains available in an expandable JSON view.

## Export and safety

The panel first attempts to copy the full JSON to the clipboard. If clipboard access is missing or denied, it exposes a read-only text area with the same JSON and instructs the operator to copy it manually.

The report is not a database backup and must not be treated as one. Before any cleanup operation, the operator must inspect the findings and create a separate database snapshot.

## Module boundary

`MainInspectorD1DiagnosticsPanel` owns its loading, error, report and copy-fallback state. The app shell supplies the Telegram init data and the shared `parseApiResponse` / `safeCaughtError` helpers through the `ui` adapter. The panel does not own authorization rules, SQL or repair logic. The Worker router keeps the main-inspector authorization dependency and injects it into `getD1Diagnostics`; the feature service owns the read-only SQL inventory and report shaping. The service deliberately does not call `ensureWorldTables`, so it cannot trigger schema creation or migrations.

## Regression coverage

`tests/admin-diagnostics-ui.test.js` checks the component boundary, the explicit read-only response contract, the absence of mutation methods, JSON inspection, clipboard handling and manual fallback. `tests/d1-diagnostics-service.test.js` checks authorization-before-D1, missing-binding behavior, SQL identifier escaping and that the report issues only `SELECT` / `PRAGMA` statements.
