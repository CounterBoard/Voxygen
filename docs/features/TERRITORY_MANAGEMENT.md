# Territory management screen

**Status:** current implementation  
**Updated:** 2026-11-27  
**UI source:** `src/features/territory-management/CityManagementProfile.jsx`  
**Related editor:** `RecruitmentManagement` (same module)  
**API source:** `bot/src/worker.js` — city management, recruitment and customization routes; `bot/src/features/territories/manager-change-service.js` — atomic application of an approved manager-role transition

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
| Demote a founder/mayor | `POST /api/city/demote-manager` with `{ initData, territoryId, telegramId }`; after confirmation, a two-manager city applies the demotion immediately; larger eligible groups start a vote |
| Save recruitment text | `POST /api/recruitment` with territory ID, owner nickname, description, enabled state and selected recruitment username |

The module retains the existing role-specific headers and payloads, including the direct Telegram header on banner, award and leave operations.

## Ownership and state flow

`CityManagementProfile` owns loaded managers, members, invitations, territory inventory, edit drafts, banner/marker/award mutation queues and local notices/errors. Marker and award selections are applied to the local inventory before network requests; queued POSTs preserve the same order as the user's taps, and a final GET reconciles the optimistic state. Its nested `RecruitmentManagement` editor owns the recruitment description and enabled draft.

The root app continues to supply the shared UI primitives/error helpers through the `ui` adapter and keeps the two original mount modes:
- editable mode for the user's managed territories;
- `readOnly` mode for territories where the user is a resident.

The module reports successful management changes through `onChanged`, allowing the parent profile to refresh the territory list. The root remains responsible for the overall profile/navigation state.

## Invariants

- Editable controls remain hidden/disabled in resident read-only mode; the resident can still use the existing leave-territory action.
- In a city with exactly two managers, one manager's confirmed demotion of the other is applied immediately; if additional eligible managers can vote, the existing voting flow remains in place. If the demoted manager owns the city, ownership transfers to the initiating manager before the target becomes a resident.
- Member/manager/invite data still refreshes from the same management endpoint after POST operations.
- Banner changes remain optimistic and roll back to the previous color/gradient if saving fails.
- Marker equipment remains scoped to the selected territory inventory and updates optimistically before its save request.
- Award slot changes update the local inventory and success/removal notification immediately. Requests are serialized in click order so rapid clicks are not discarded or applied out of order; the inventory is reconciled from the server after the queue completes.
- If a save fails, the authoritative inventory is reloaded and the error is shown. A server-side 409 still surfaces the four-award limit.
- Recruitment description visibility and publish/hide actions keep their original read-only behavior.
- No Worker routes, authorization, database tables or persistence behavior changed.

## Regression coverage

`tests/territory-management-ui.test.js` checks both root mount modes, the initial authenticated reads, mutation payloads, banner rollback, immediate marker/award state changes, serialized background saves, four-slot handling, recruitment saving and resident leave flow. Existing theme UI contracts continue to inspect the extracted editor module.


## Backend ownership

- **demoteManager** and the existing promotion/manager-vote routes stay in bot/src/worker.js. They retain request validation, initiator permissions, voter counting, vote persistence and callback routing.
- bot/src/features/territories/manager-change-service.js owns **applyManagerChange(env, { territoryId, targetId, action, initiatorId })**. Worker creates the service with Telegram delivery, HTML escaping, recruitment-contact cleanup, manager notifications and achievement evaluation injected.
- Promotion rechecks the approved territory and target membership. The D1 batch inserts the manager only while membership and verified-account/nickname predicates still hold, then removes membership only if the manager relation exists.
- Ordinary demotion performs the inverse guarded D1 batch: add membership only while the manager relation and verified account still exist, then remove the manager relation only if membership exists.
- Demoting the owner requires a verified next owner who is already a manager. The owner update, manager-role removals and membership restoration remain in one D1 batch; the resulting owner/manager/member state is read back before the operation reports success.
- Promotion/demotion retries remain idempotent where the requested state is already applied. Failed post-write verification returns false; notifications and achievement evaluation run only after the resulting role state is confirmed.
- The Worker continues to export applyManagerChange for existing consumers/tests. Vote claiming, stale-lease recovery, vote recording and finalization remain in Worker and are not part of this extraction.

## Demotion behavior

The confirmation dialog is the final confirmation for a two-manager city: the target is moved from `territory_managers` to `city_memberships` immediately, without creating an unreachable vote. The API returns `{ ok: true, immediate: true }`; the screen refreshes its manager/member lists and reports the completed demotion. When more eligible managers are available, the existing 24-hour manager vote is preserved. If the target is the territory owner, the initiating manager receives ownership as part of the same role transition.
