# Territory management module extraction — 2026-11-26

## Scope

Moved `CityManagementProfile` and its exclusively nested `RecruitmentManagement` editor from `src/App.jsx` into `src/features/territory-management/CityManagementProfile.jsx`.

The feature module owns territory administration drafts, loading, mutations, banner preview/rollback, marker equipment, award placement, recruitment settings and resident leave behavior. The root still mounts editable and read-only modes using the same inputs.

## Contracts preserved

- Existing GET routes, auth headers and no-store behavior for management data and territory inventory remain unchanged.
- All existing POST routes/payload fields for rename, additional info, invites, member/manager transitions, recruitment contact, banner, marker and award placement remain unchanged.
- Banner preview still updates optimistically and rolls back to the prior color/gradient on save failure.
- Residents retain the read-only view and the leave-territory action; editable controls remain role-gated.
- Recruitment text save, publish/hide messages, award limit feedback and UI presentation remain unchanged.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/TERRITORY_MANAGEMENT.md`.
- Updated `docs/ARCHITECTURE.md` with the territory management feature boundary.
- Added `tests/territory-management-ui.test.js` for mounting modes, API contracts, rollback and state-flow invariants.
- Updated theme and award UI contract tests to inspect the extracted territory management module and the shared color picker.
