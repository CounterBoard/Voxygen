# Territory ratings and reviews extraction — 2026-11-26

## Scope

Moved rating and review functionality out of `TerritoryDetail` into `src/features/territory-details/TerritoryFeedbackPanel.jsx`.

The module now owns rating criteria, cooldown state/timer, review draft, comment/reply editing state, all rating/review handlers and the corresponding JSX section. `ReplyBox`, `CRITERIA` and `formatRatingCooldown` moved with the feature.

## Contracts preserved

- Rating and comments endpoints, methods, headers and request bodies remain unchanged.
- Rating cooldown and retry-at behavior, comments refresh after creation, optimistic updates after edit/delete and confirmation prompts remain unchanged.
- Owner/manager reply permissions, inspector review moderation and profile-link behavior are unchanged.
- The parent remains responsible for territory state, screen composition and the toast timer; callbacks connect the extracted panel to those existing responsibilities.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/TERRITORY_FEEDBACK.md`.
- Updated `docs/ARCHITECTURE.md` to list the territory-feedback feature module.
- Added `tests/territory-feedback-ui.test.js` and updated the theme UI contract tests to inspect the extracted review panel.
- Updated the award UI contract test to read the moved `ReplyBox` from the feature module.
