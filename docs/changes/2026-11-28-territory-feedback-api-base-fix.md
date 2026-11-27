# Territory feedback API base fix

**Date:** 2026-11-28

- Fixed a runtime ReferenceError when submitting territory ratings: the extracted feedback panel now imports the shared `API_BASE` constant from `src/config/api.js`.
- Added a regression assertion that the panel imports and uses the shared API base.
- No API route, payload, backend behavior or configuration value changed.
