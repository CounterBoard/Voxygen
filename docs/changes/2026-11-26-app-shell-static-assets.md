# App shell static asset audit — 2026-11-26

## Scope

Reviewed the existing separation of global application styles and the gem icon on `main`.

The implementation already uses `src/main.jsx` to import `src/theme/theme-tokens.css` and `src/theme/app-shell.css` before `App.jsx`. The gem icon is already stored in `src/assets/gem-icon.png` and imported by `App.jsx` for the `GemHex` component. No runtime extraction or visual redesign was needed in this pass.

## Verification

- Confirmed that `App.jsx` no longer contains `GEM_ICON_DATA_URL` or an embedded PNG data URL.
- Confirmed that `GemHex` uses the imported PNG URL.
- Confirmed that `main.jsx` loads theme tokens before the global app-shell stylesheet and before the React app.
- Confirmed that the standalone CSS file contains responsive and reduced-motion rules.
- Added `tests/app-shell-assets.test.js` to protect these boundaries against regression.

## Scope boundaries

No component behavior, API contract, backend Worker, database schema, authorization rule, theme token value or visual design was changed.

The test and documentation changes are a finalization of stage 1, not a second extraction of resources that are already separated.

## Existing test drift found during CI

The first CI run executed 355 tests: 354 passed and one failed in the pre-existing `tests/profile-loading-ui.test.js` assertion. That assertion expected the old Telegram prompt `Откройте Voxygen через Telegram.`, while the current `useTelegramProfile` implementation correctly returns `Откройте приложение через Telegram.` for nickname claiming.

Updated only the stale test expectation to match the current user-facing implementation. No application runtime code was changed. CI is being rerun before merge.
