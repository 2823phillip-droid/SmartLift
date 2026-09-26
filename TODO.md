# TODO
last_updated: 2026-09-26

## Current — what's happening now

### Bugs fixed

- [x] **Rest timer lost on nav away/back** — Fixed: `startRest()` now saves end time to localStorage; mount effect restores it; `clearRestTimer()` + `endWorkout()` + `cancelWorkout()` clean up.
- [x] **Set 2+ weight reverts to session target on nav away/back** — Fixed: L274 `useEffect` now uses current `logs` when they exist for the exercise (latest log as seedSet), falling back to `lastSessionByExercise` only on fresh workout start.
- [x] **Elapsed workout time resets to 0 on nav away/back** — Fixed: `workoutStart` now restored from localStorage on mount, persisted on set, fallback to `session.started_at`; cleared on `endWorkout()`/`cancelWorkout()`.

### Bugs to fix

- [ ] **Coach tab layout** — header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently broken — header scrolls out of sight, chatbox scrolls, conversation box also scrolls.

- [ ] **Session target on set 1** — Set 1 correctly pulls from the previous session (session target). If this bug still manifests, it's likely the same root cause as the nav-away/back overwrite (L274 effect recomputing from stale `lastSessionByExercise` on return). Need user confirmation of exact repro.

- [ ] **Missing coach notes on second-half exercises** — (assisted chest dips, DB seated tricep extension, tricep cable pushdown) despite correct actual weights from linear progression. Need to investigate why coach notes aren't appearing for these exercises.

- [ ] **"Set target" UI still showing after last set** — unnecessary prompt after workout is done. The suggestion UI should hide when all sets are complete.
