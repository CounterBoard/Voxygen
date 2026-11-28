# Vox grid service extraction

**Date:** 2026-11-28  
**Stage:** 4 — backend Worker decomposition

## Changes

- Extracted Vox grid reads, main-inspector cell updates and board reset into `bot/src/features/vox-grid/service.js`.
- Kept the three existing HTTP route declarations in `bot/src/worker.js`; the Worker now composes the service with its existing authorization, role, D1 initialization and JSON dependencies.
- Added behavioral coverage for the grid shape, public reads, role-based edit capability, authorization ordering, coordinate validation, reset and persistence.
- Updated the architecture map and added the Vox grid feature contract.

## Compatibility

No API path, HTTP method, request/response field, board dimension, cell-state normalization, authorization rule, SQL table, upsert key or audit field is intentionally changed. The read endpoint still returns the board to unauthenticated visitors and sets `canEdit` only for the main inspector. The mutation endpoints still authorize before database initialization.

## Validation

CI runs the complete Node test suite, theme checks, production build, Worker syntax validation and Wrangler dry-run. Production manual verification remains required after merge to `main`.
