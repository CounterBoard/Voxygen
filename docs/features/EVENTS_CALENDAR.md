# Events and calendar modules

**Status:** current implementation  
**Updated:** 2026-11-26

## Module boundaries

The first extraction isolates reusable date/time rules and the visual date/time picker from the application shell.

| Responsibility | Source |
| --- | --- |
| Time-zone normalization, event wall-clock conversion, date validation, reminder labels and coordinate formatting | `src/features/events/date-time.js` |
| Scroll-wheel calendar and date/time fields | `src/features/events/DateTimeFields.jsx` |
| Image preparation shared by event and home-feature forms | `src/shared/image-utils.js` — `readEventImage` |
| Event listing, reminders, create/edit forms and inspector management | `src/features/events/Events.jsx` — `EventsScreen`, `ProfileEventCreateForm`, `EventInlineEditor`, `EventManagementPanel` |
| Backend routes and persistence | `bot/src/worker.js` — event/reminder routes and tables |

The screen and forms now live in `Events.jsx`. Their shared app-wide UI primitives (fields, toast, Minecraft text, error mapping and image preparation) are injected from the application shell through one stable `ui` object. This avoids circular imports and duplicate components while keeping the feature module independent from the app shell.

## Time-zone behavior

- `normalizeTimezoneOffset` accepts fixed UTC offsets from UTC−12 through UTC+14 in 15-minute increments. Invalid values fall back to `UTC+3`.
- User preferences that use a fixed UTC offset are treated as a fixed offset, not an IANA region.
- Calendar conversion helpers also accept IANA time-zone names such as `Europe/Moscow`; `Intl.DateTimeFormat` resolves daylight-saving rules for those names.
- `eventDatePartsTimestamp` converts chosen day/month/hour/minute wall-clock values into a future timestamp and rejects invalid dates or nonexistent wall-clock times.
- `globalExpiryPartsTimestamp` uses an explicit year and validates both date and future time.
- The event creation window uses UTC calendar-month arithmetic with end-of-month clamping.

## Validation

`tests/events-date-time.test.js` covers offset normalization, fixed-offset and IANA zone conversion, wall-clock round-tripping, calendar validation, end-of-month arithmetic, event date labels, coordinate cleanup and Russian reminder pluralization. It also checks the scroll-wheel calendar's interaction contract.

`npm test` and the GitHub Actions workflow validate the existing UI contracts and production build. This extraction does not change the event API, payload shape, permissions or database schema.
