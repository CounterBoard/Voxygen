# Territory manager voting service extraction

**Date:** 2026-11-27

## What changed

- Moved manager vote eligibility, guarded vote recording, exclusive/stale finalization lease handling, decision calculation, result persistence, expiry sweeps and Telegram vote callback processing from bot/src/worker.js into bot/src/features/territories/manager-change-voting-service.js.
- Added createManagerChangeVotingService with injected manager-change table initialization, applyManagerChange, Telegram delivery, HTML escaping, nickname formatting, territory-manager authorization and JSON response creation.
- Kept worker vote-initiation HTTP routes and scheduled/webhook dispatch in place.
- Preserved Worker exports for claimManagerChangeFinalization, recordManagerChangeVote and isEligibleManagerChangeVoter, so existing imports remain compatible.
- Added behavioral tests for majority approval, incomplete votes, expiry rejection, failed role application, initiator vote exclusion and cron scanning.
- Existing finalization tests continue to exercise exclusive claims, stale lease recovery and pending-only vote writes.

## Compatibility

No API path, callback payload, vote threshold, voting duration, D1 schema, vote uniqueness rule, 60-second lease recovery policy, scheduled batch limit or role-transition contract is intentionally changed. Vote writes remain guarded by status='pending'; finalization remains guarded by its lease timestamp.

## Validation

- npm test
- npm run build
- node --check bot/src/worker.js
- Wrangler Worker dry-run
