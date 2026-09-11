# Active Context
last_updated: 2026-09-10

Updated when work in progress changes.

## Current Task
Inline set editor + history effort fix + backend parity deploy. The inline edit icon during live workouts was a dead button (tapped but did nothing). Now tapping "Edit" on a completed set opens inline weight/reps/effort fields with Save/Cancel. History screen effort field was capped at /5; fixed to /10. Backend parity commit (343d9e7) deployed to Fly so frontend and backend agree on progression seed.

## Completed
- Inline set editor in SortableExerciseCard.tsx: `editingSetId`, `editWeight`, `editReps`, `editEffort` state + startEditSet/cancelEditSet/commitEditSet functions
- Edit icon now opens inline editor for completed sets during live workout
- HistoryScreen.tsx effort field: max={5} → max={10}, label "Effort /5" → "Effort /10"
- Backend `SetLogUpdate` already had `effort` field — no backend change needed for edit fix
- Backend parity commit 343d9e7 deployed to Fly (machine 2862102a31e718, v213)
- Frontend build: index-DbEsCaNh.js (874971 bytes), dist rsynced to MacBook, cap sync ios done
- Docs update: deploy.md, PROJECT.md, changelog.md updated with deploy realities

## Next Actions
- User tests on device in the morning
- After testing: address any bugs found, then continue with Phase 1/2 work

## Notes
- Knowledge hierarchy documented in `MEMORY-INDEX.md`; always read it before starting work.
- All domain-specific lessons are in `memory/<topic>.md`.
- Never fall back to local backend; production is `https://askeo.fit/api`.
- Always use `macbook` SSH alias, never raw IP.
- When building for iOS: sync Linux `dist/` to MacBook `dist/` first, then run `cap sync ios` from project root.
- Health endpoint is `/healthz` (NOT `/api/healthz`).
- `fly` CLI only exists on MacBook; deploy from Linux via SSH.
