# Transient notification lifecycle

**Status:** current implementation  
**Updated:** 2026-11-27  
**Shared component:** `FixedToast` in `src/App.jsx`

## Shared display contract

`FixedToast` renders one transient status/error message through a portal inside the active `.atlas-root`. It hides itself automatically after 2.6 seconds for success/warning messages and 4.3 seconds for explicit error messages. The final 180 ms are used for the exit animation. Both timeout handles are cleared whenever the message, type or revision changes, and when the toast component unmounts.

The `revision` prop is an event identity, not a message identity. A caller increments it for every notification event, including when the next message has exactly the same text and type as the previous one. This makes repeated identical messages reliably restart their visibility period without relying on React remount keys.

## Repeated-notification invariants

- Do not use the message string as the only React key for an event that may repeat.
- Keep a monotonic revision counter for repeated local notices, or use an existing operation/sequence ID.
- Prefer the shared toast's own auto-hide lifecycle instead of adding a second parent `setTimeout` that clears toast state.
- If a parent must manage a timeout (for example, the root home screen), cancel the previous timer before scheduling the next one and clear it on unmount.
- For async mutations, publish the intended optimistic feedback immediately when the UI state is applied; show a server error or reconcile if the save fails.

## Current audited callsites

- Territory management: award-limit and ordinary notices pass their revision counters; repeated same-message events reset the timeout.
- Recruitment and treasury: repeated success notices carry their own revision.
- Main inspector panel: child panels report through a `showNotice` callback that increments a revision.
- Territory detail: `flash` increments a revision and leaves expiry to `FixedToast`; it no longer schedules independent stale hide timers.
- Root home screen: `showHomeToast` clears the previous timeout before scheduling a new one; the timer is cleaned up when the root unmounts.
- Global notifications: the global toast sequence ID is reused as its revision.
- Events screen: reminder notices and event edit/delete feedback increment a notice revision. Event creation, inline editing and event management each use a separate revision for the two-month date-limit warning; repeated attempts restart the timeout.
- Other audited source modules do not render the shared `FixedToast` component; their status messages are persistent inline feedback rather than timed portal toasts.

## Regression coverage

`tests/toast-revision-ui.test.js` guards timer dependencies/cleanup, repeated identical message revisions, the four-award limit notification, territory detail feedback, main inspector and treasury notices, and root home/global notification scheduling. `tests/events-toast-ui.test.js` protects event reminder feedback, event create/edit/delete notices and all three date-limit toast instances.
