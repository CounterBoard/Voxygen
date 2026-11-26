# UI notification and award equipment fixes — 2026-11-27

## Reported issues

1. The four-award limit notification did not reliably disappear after repeated triggers.
2. Animated award emojis showed white text behind the animation in Profile and the award modal.
3. Founder/manager award placement and marker selection did not update immediately; while a request was in flight, other award clicks could be ignored.

## Findings and changes

- The shared `FixedToast` now accepts an explicit `revision` event identity. Its timer restarts when an identical message is emitted again and still cleans up both timers on dependency changes/unmount.
- Audited repeated notification callsites across all frontend source modules. Added revisions to the four-award warning, territory management, recruitment, treasury, main inspector, territory detail, root notifications and event screens (including all three date-limit warnings). Replaced territory-detail's independent untracked hide timer with the shared auto-hide. The root home notification now cancels its previous timer before scheduling a new one and clears it on unmount.
- `TelegramSticker.jsx` contained a JavaScript-style `//` comment inside JSX. React rendered it as an actual text node. It is now a JSX comment, removing the visible text behind TGS animations.
- Marker and award selections now update the local inventory and show feedback immediately. Background POSTs are serialized in tap order, so rapid subsequent selections are not silently ignored or reordered. The inventory is reconciled from the server after the queued mutations complete; failures restore server truth and surface an error. The four-award maximum remains enforced locally and by the Worker.

## Validation

Added/updated:
- `tests/toast-revision-ui.test.js`
- `tests/events-toast-ui.test.js`
- `tests/territory-management-ui.test.js`
- `tests/territory-awards-ui.test.js`

No Worker route, request payload, D1 schema, or authorization rule was changed.
