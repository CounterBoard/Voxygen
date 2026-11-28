# User settings service extraction

**Date:** 2026-11-28  
**Area:** Backend Worker decomposition

## Change

Moved the authenticated GET /api/user-settings and POST /api/user-settings handlers and the active global override reader into bot/src/features/settings/service.js.

The Worker now composes the service with its existing authentication, role lookup, database initialization, timezone normalization and JSON helpers. HTTP route paths and methods remain in the Worker.

## Compatibility constraints

- No changes to API paths, methods, headers, request fields, response fields or status behavior.
- No changes to D1 tables, migrations, initialization caches or account-deletion triggers.
- Preserve theme visibility rules, global theme/map-zoom precedence and personal opt-out markers.
- Preserve timezone normalization, event-notification settings, legacy allNotifications response compatibility and territory notification preference authorization/defaults.
- Account-deletion lock source coverage now includes the extracted settings service because it owns preference writes.

## Validation

Focused service tests and the full repository CI suite cover authorization-before-DB access, response compatibility, theme access, global override behavior, partial legacy saves, per-territory authorization and account-deletion source contracts.
