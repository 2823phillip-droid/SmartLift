# TODO
last_updated: 2026-09-26

## Current — what's happening now

### Bugs fixed

- [x] **Effort persistence across navigation** — Complete set 1 with effort 7, set 2 auto-expands with effort 7 pre-selected. Navigate away (Settings), come back — effort still 7, not unselected. Fixed: `expandExercise` now reads effort from latest log (`f1c0c14`).
- [x] **No set target after last set** — Complete set 4 of an exercise. The Set Target suggestion box disappears entirely; no panel, no "Set Target" label. Fixed: `14cef4f`.
- [x] **Set 2 weight reverts to session target after navigating away and back** — Set 1 shows Session Target (pulls from last workout, going up 5lbs). Set 2 shows Set Target (matches rest timer, shows last set info, going up 5lbs). Both work correctly during continuous workout. But navigating away (Settings tab → back to Live Workout) causes two things to break:
  - Elapsed time resets to 0
  - Set 2 actual weight reverts to the session target weight instead of the set target weight (it was correct using set target before navigating away)
  
  Fixed: L274 `useEffect` now uses current `logs` when they exist for the exercise (latest log as seedSet), falling back to `lastSessionByExercise` only on fresh workout start. `workoutStart` persisted to localStorage and restored on remount.

- [x] **Rest timer lost on nav away/back** — Fixed: `startRest()` now saves end time to localStorage; mount effect restores it; `clearRestTimer()` + `endWorkout()` + `cancelWorkout()` clean up.

### Bugs to fix

- [ ] **Coach tab layout** — header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently broken — header scrolls out of sight, chatbox scrolls, conversation box also scrolls.

- [ ] **Session target on set 1** — Set 1 correctly pulls from the previous session (session target). If this bug still manifests, it's likely the same root cause as the nav-away/back overwrite (L274 effect recomputing from stale `lastSessionByExercise` on return). Need user confirmation of exact repro.

- [ ] **Missing coach notes on second-half exercises** — (assisted chest dips, DB seated tricep extension, tricep cable pushdown) despite correct actual weights from linear progression. Need to investigate why coach notes aren't appearing for these exercises.

- [ ] **"Set target" UI still showing after last set** — unnecessary prompt after workout is done. The suggestion UI should hide when all sets are complete.
