# TODO
last_updated: 2026-09-27

## Current — what's happening now

### Bugs fixed

- [x] **Effort persistence across navigation** — Complete set 1 with effort 7, set 2 auto-expands with effort 7 pre-selected. Navigate away (Settings), come back — effort still 7, not unselected. Fixed: `expandExercise` now reads effort from latest log (`f1c0c14`).
- [x] **No set target after last set** — Complete set 4 of an exercise. The Set Target suggestion box disappears entirely; no panel, no "Set Target" label. Fixed: `14cef4f`.
- [x] **Set 2 weight reverts to session target after navigating away and back** — Set 1 shows Session Target (pulls from last workout, going up 5lbs). Set 2 shows Set Target (matches rest timer, shows last set info, going up 5lbs). Both work correctly during continuous workout. But navigating away (Settings tab → back to Live Workout) causes two things to break:
  - Elapsed time resets to 0
  - Set 2 actual weight reverts to the session target weight instead of the set target weight (it was correct using set target before navigating away)
  
  Fixed: L274 `useEffect` now uses current `logs` when they exist for the exercise (latest log as seedSet), falling back to `lastSessionByExercise` only on fresh workout start. `workoutStart` persisted to localStorage and restored on remount.
- [x] **Rest timer lost on nav away/back** — Fixed: `startRest()` now saves end time to localStorage; mount effect restores it; `clearRestTimer()` + `endWorkout()` + `cancelWorkout()` clean up.
- [x] **Session target on set 1** — Set 1 correctly pulls from the previous session. Fixed: workout state persistence across navigation (`10ac957`). Confirmed clean — session target and set target both working.
- [x] **Session target / set target box only showing on first exercise** — Session Target and Set Target suggestion boxes only rendered on the first exercise card, not on subsequent exercises. Root cause: the initial-load effect used `find()` to pick a single target and computed a prescription for only that one. Fix: loop over all incomplete exercises, compute prescriptions for each, batch-set in one call. Auto-expand now picks the first incomplete exercise instead of the last. Also fixed missing coach notes on second-half exercises (assisted chest dips, DB seated tricep extension, tricep cable pushdown). (`d28d4ec`)

### Bugs to fix

- [ ] **Coach tab layout** — header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently broken — header scrolls out of sight, chatbox scrolls, conversation box also scrolls.

## Features / Wishlist

### Social
- [ ] Friend system — add friends in-app, see their workout activity
- [ ] Share workouts — share completed workout summaries with friends
- [ ] Status — set and view workout/status updates (lifting, resting, etc.)

### Notifications
- [ ] Push notifications — workout reminders, rest timer alerts, coach messages

## Modifications / Tweaks

### Coach messages
- [ ] Change "This workout" to "Next workout" in all coaching messages (backend `rules.py` + frontend `rules.ts`)

### Weight display
- [ ] Audit all frontend weight display paths for consistent kg/lbs conversion (start_weight, draft prefill, `getNextSetTarget()`, coach prescription inputs, recap screens)
