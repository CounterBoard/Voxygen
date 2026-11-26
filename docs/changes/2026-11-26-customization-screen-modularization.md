# Customization screen modularization — 2026-11-26

## Scope

Moved the customization screen, visual editor form and achievement fields from `src/App.jsx` into `src/features/customization/CustomizationScreen.jsx`.

Extracted the shared `VISUAL_COLORS` palette and `ColorDot` control into `src/features/customization/VisualColorPicker.jsx`. The same palette/control are used by both visual customization and territory banner editing.

## Contracts preserved

- The root keeps navigation and passes through the same profile, role, territory list and toast callback.
- All existing customization API operations keep their routes, methods, headers and payloads.
- The personal/treasury account scope, request-version guards against stale responses, balance-refresh event, main-inspector-only controls, filters, editor validation, image preparation and toast feedback remain unchanged.
- The visual palette, circular color control and their dimensions/values remain unchanged.
- No Worker, database, authorization or persistence code changed.

## Documentation and tests

- Added `docs/features/CUSTOMIZATION.md`.
- Updated `docs/ARCHITECTURE.md` with the customization feature boundary.
- Added `tests/customization-ui.test.js` for account scope, request contracts, stale-response guards, editor operations and palette sharing.
- Updated `tests/theme-ui-contract.test.js` and `tests/territory-awards-ui.test.js` to inspect the extracted customization/palette modules where they verify shared styling contracts.
