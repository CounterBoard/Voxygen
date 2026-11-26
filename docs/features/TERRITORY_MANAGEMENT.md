# Territory management screen

**Status:** current implementation  
**Updated:** 2026-11-26  
**UI source:** `src/features/territory-management/CityManagementProfile.jsx`  
**Related editor:** `RecruitmentManagement` (same module)  
**API source:** `bot/src/worker.js` — city management, recruitment and customization routes

## Purpose

The territory management screen is used by territory owners/managers to manage the territory name and additional information, residents and manager roles, pending invitations, recruitment settings, banner appearance, equipped marker and award placement. The same screen has a read-only presentation for residents, with the existing option to leave a territory.

## Request groups and contracts

| Action | Request |
| --- | --- |
| Load managers/members/invites | `GET /api/city/management?territoryId=...` with `X-Telegram-Init-Data`, `cache: no-store` |
| Load personal/territory inventory | `GET /api/customization?scope=profile&territoryId=...` with the same auth header and no-store cache |
| Generic management updates | Existing POST routes under `/api/admin/territories/*`, `/api/city/*` and `/api/recruitment/contact`; the shared helper sends `{ initData, ...body }` |
| Save banner | `POST /api/customization/city` with `territoryId`, `bannerColor` and a newly selected `bannerGradient` |
| Equip marker | `POST /api/customization/city` with `territoryId` and `markerItemId` |
| Place/remove award | `POST /api/customization/city/award` with `territoryId` and `awardId` |
| Leave territory | `POST /api/city/leave` with `{ initData, territoryId }` after confirmation |
| Save recruitment text | `POST /api/recruitment` with territory ID, owner nickname, description, enabled state and selected recruitment username |

The module retains the existing role-specific headers and payloads, including the direct Telegram header on banner, award and leave operations.

## Ownership and state flow

`CityManagementProfile` owns loaded managers, members, invitations, territory inventory, edit drafts, banner/marker/award loading state and local notices/errors. Its nested `RecruitmentManagement` editor owns the recruitment description and enabled draft.

The root app continues to supply the shared UI primitives/error helpers through the `ui` adapter and keeps the two original mount modes:
- editable mode for the user's managed territories;
- `readOnly` mode for territories where the user is a resident.

The module reports successful management changes through `onChanged`, allowing the parent profile to refresh the territory list. The root remains responsible for the overall profile/navigation state.

## Invariants

- Editable controls remain hidden/disabled in resident read-only mode; the resident can still use the existing leave-territory action.
- Member/manager/invite data still refreshes from the same management endpoint after POST operations.
- Banner changes remain optimistic and roll back to the previous color/gradient if saving fails.
- Marker equipment remains scoped to the selected territory inventory.
- Award slots retain the four-award maximum handling and the same success/removal feedback.
- Recruitment description visibility and publish/hide actions keep their original read-only behavior.
- No Worker routes, authorization, database tables or persistence behavior changed.

## Regression coverage

`tests/territory-management-ui.test.js` checks both root mount modes, the initial authenticated reads, mutation payloads, banner rollback, marker and award operations, recruitment saving and resident leave flow. Existing theme UI contracts continue to inspect the extracted editor module.
