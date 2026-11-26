# FAQ and home feature button content

**Status:** current implementation  
**Updated:** 2026-11-26  
**Backend service:** `bot/src/features/admin-tools/site-content.js`  
**HTTP routes:** `bot/src/worker.js` — `/api/faq`, `/api/home-feature-button`  
**Storage:** D1 `app_settings` keys `faq_text` and `home_feature_button`

## Responsibilities and access rules

The service owns default FAQ content, FAQ read/write validation and home feature button normalization/read/write behavior. The Worker remains responsible for route dispatch and supplies its existing authorization and D1-table helpers.

| Method | Route | Access | Behavior |
| --- | --- | --- | --- |
| GET | `/api/faq` | Public | Returns the effective FAQ text, falling back to the current default |
| POST | `/api/faq` | Main inspector | Saves non-empty text up to 12,000 characters |
| GET | `/api/home-feature-button` | Authenticated user | Returns normalized button configuration; hidden content is redacted for non-main-inspectors |
| POST | `/api/home-feature-button` | Main inspector | Saves the button title, subtitle, body, optional image and hidden flag |

The route access split is intentional. FAQ content is public to read, while the home feature endpoint requires a signed Telegram user. A hidden home button is still visible to the main inspector for editing, but other users receive only the default empty configuration with `hidden: true`.

## Data normalization

The home feature button is read from the `home_feature_button` app setting and parsed defensively. Its fields are bounded:
- title: 80 characters;
- subtitle: 140 characters;
- body text: 6,000 characters;
- image: PNG, JPEG, WebP or GIF data URL up to 1,400,000 characters;
- hidden: accepted only when the stored value is the boolean `true`.

Unsupported or malformed images normalize to an empty image. Invalid JSON falls back to the default button configuration. Saving applies the same limits before writing.

The FAQ is stored as the `faq_text` app setting. Missing content and the exact legacy default are replaced by the current `DEFAULT_FAQ_TEXT`.

## D1 lifecycle

The service receives `ensureMapSettingsTable` and `ensureWorldTables` from the Worker. Existing initialization behavior is preserved: FAQ and home-button writes call `ensureMapSettingsTable`; home-button reads call `ensureWorldTables` and then `ensureMapSettingsTable`. The service does not define or relocate table creation logic. Do not silently remove the existing world-table initialization from the GET home-button path as part of unrelated refactoring.

## Dependency boundary

The service receives only the existing functions needed by each handler:
- `json` and the applicable `requireMainInspector` / `requireUser` checks;
- `getRoleByTelegramId` for the hidden-button exception;
- `ensureMapSettingsTable` and, for home-button reads, `ensureWorldTables`.

It does not import `worker.js` and does not own router dispatch.

## Regression coverage

`tests/admin-site-content-service.test.js` protects public FAQ fallback, main-inspector write authorization, FAQ length checks, home button normalization and image validation, hidden-content redaction, main-inspector visibility and explicit route/service wiring. `tests/route-auth-matrix.test.js` verifies that the authenticated-user GET home-button route rejects unauthenticated requests, alongside the existing main-inspector write routes.
