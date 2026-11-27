# Worker shared validation extraction

**Date:** 2026-11-27

## What changed

- Moved the pure `parseRequestCoords` and `parseTwoCoordinates` helpers into `bot/src/shared/validation.js`.
- Worker imports both functions under their original names. Call sites and accepted input formats remain unchanged.
- Added focused tests for labelled and unlabelled coordinate pairs, decimal commas, Unicode minus signs, malformed input and non-finite values.
- Updated `docs/ARCHITECTURE.md`.

## Responsibility boundary

These helpers only parse text into finite numeric coordinate pairs. Territory/world-bound checks remain at their existing call sites; this module does not access D1 or make authorization decisions.

## Compatibility

Structural-only change: no endpoint, request/response, coordinate range, database or permission behavior is intentionally changed.

## Validation

- `npm test`
- `npm run build`
- `node --check bot/src/worker.js`
- Wrangler Worker dry-run bundle
