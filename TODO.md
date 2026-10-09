# TODO
last_updated: 2026-10-08

## Latest Build
- **Git HEAD:** `c5d5bdc` — "feat: equipment toggle system with coach progression control; consolidate muscle groups; remove deload override toggle"
- **Build:** `index-3C8zlRL3.js` (867,530 bytes) + `index-C0Ze5QzQ.css` (57,620 bytes)
- **Build date:** 2026-10-08
- **Deploy status:** Backend deployed to Fly; frontend built and synced to iOS
- **Validation status:** Health OK, smoke test passed

## Bugs to fix

_(no open bugs right now — add new bugs here when you find something broken during a workout)_

## Bugs fixed

	2026-09-27
		- d28d4ec
			- [x] **Session target / set target box only showing on first exercise** — Session Target and Set Target suggestion boxes only rendered on the first exercise card, not subsequent ones. Fix: loop over all incomplete exercises, compute prescriptions for each, batch-set in one call. Auto-expand now picks the first incomplete exercise instead of the last. Also fixed missing coach notes on second-half exercises (assisted chest dips, DB seated tricep extension, tricep cable pushdown).
		- 10ac957
			- [x] **Session target on set 1** — Set 1 correctly pulls from the previous session. Fixed: workout state persistence across navigation. Confirmed clean — session target and set target both working.
		- f1c0c14
			- [x] **Effort persistence across navigation** — Complete set 1 with effort 7, set 2 auto-expands with effort 7 pre-selected. Navigate away (Settings), come back — effort still 7, not unselected. Fixed: `expandExercise` now reads effort from latest log.
		- 14cef4f
			- [x] **No set target after last set** — Complete set 4 of an exercise. The Set Target suggestion box disappears entirely; no panel, no "Set Target" label.

### Navigation persistence
	- [x] **Set 2 weight reverts to session target after navigating away and back** — Set 1 shows Session Target (pulls from last workout, going up 5lbs). Set 2 shows Set Target (matches rest timer, shows last set info, going up 5lbs). Both work during continuous workout. But navigating away (Settings tab → back to Live Workout) caused two things to break: elapsed time resets to 0; Set 2 actual weight reverts to session target instead of set target. Fixed: L274 `useEffect` now uses current `logs` when they exist for the exercise (latest log as seedSet), falling back to `lastSessionByExercise` only on fresh workout start. `workoutStart` persisted to localStorage and restored on remount.
	- [x] **Rest timer lost on nav away/back** — Fixed: `startRest()` now saves end time to localStorage; mount effect restores it; `clearRestTimer()` + `endWorkout()` + `cancelWorkout()` clean up.

## Features / Wishlist

### Social
- [ ] Friend system — add friends in-app, see their workout activity
- [ ] Share workouts — share completed workout summaries with friends
- [ ] Status — set and view workout/status updates (lifting, resting, etc.)

### Prebuilt Templates
- [x] **Redesign questionnaire flow** — Replace "build_mode" choice (template vs custom builder) with streamlined Training Profile: capture goals, equipment, training history, experience level. Goals map directly to progression model. Remove automatic workout generation from questionnaire path. Done in `439c55f`.
- [ ] **Remove automatic workout builder** — DELETE `POST /api/trainer/generate` endpoint (still live in code — used by AI coach `generate_workout` tool). Retire `QuestionnaireScreen.tsx` template-generation logic, remove build_mode toggle. Questionnaire now only saves profile data to `fitness_profile`.
- [x] **Shared prebuilt templates** — Create backend library of structured workouts available to ALL users. Done in `439c55f` — prebuilt template model replaces automatic builder.
- [x] **Template selector UI** — After questionnaire completes, show prebuilt template gallery instead of auto-generated workout. Done in `439c55f`.

### Notifications
- [ ] Push notifications — workout reminders, rest timer alerts, coach messages

### Progression Architecture (Block Periodization)
||- [~] Phase 2: Library cleanup and classification — COMPLETE. 1359/1359 exercises classified (100%). Database fully classified with 32 columns including base_movement, hitt_worthy, warmup_type, primary_equipment. Equipment categories refined from 8→17: bodyweight, dumbbell, barbell, cable, machine, resistance_band, stretching, kettlebell, plates, stability_ball, medicine_ball, rope, cardio, roller, sledge, tire, arms_forearm. Empty categories core_abs and hitt_cardio removed. Deleted 10 poor-quality exercises (7 POV duplicates, 1 female variant, 2 towel rows). Movement pattern sweep complete: 43 patterns total including grip and hip_abduction_adduction. Frontend equipment toggle system built and working: Settings screen has 17 equipment category checkboxes with "Select All", equipment filtering in TemplateEditorScreen and CustomWorkoutBuilderScreen using primary_equipment from backend API. Coach progression toggle added: ON (default) = coach controls all progression, exercise cards clean; OFF = user controls progression at workout and exercise level. Muscle groups consolidated (upper/lower arms→Arms, upper/lower legs→Legs). Deload override toggle removed. → `ReleaseNotes/progression_tasks.md`
- [ ] Phase 3: Onboarding wizard + user profile schema
- [ ] Phase 4: Model picker engine (`model_picker` function)
- [ ] Phase 5: Frontend UI (block pill, rep targets, deload states)
- [ ] Phase 6: Data sync & deployment (Mac DB, TS types)

## Modifications / Tweaks

### Coach messages
- [ ] Change "This workout" to "Next workout" in all coaching messages (backend `rules.py` + frontend `rules.ts`)

### Weight display
- [ ] Audit all frontend weight display paths for consistent kg/lbs conversion (start_weight, draft prefill, `getNextSetTarget()`, coach prescription inputs, recap screens)
- [ ] **Allow user to override weight** — coach suggests +5lbs progression, but user can enter custom weight for the set. Needed for exercises where gym doesn't have intermediate dumbbell sizes (e.g., lateral raises where 12.5lbs isn't available). Backend progression stays +5lbs default; frontend UI adds override option.

### Layout / UI
- [ ] **Coach tab layout** — header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently the header scrolls out of sight, chatbox scrolls, conversation box also scrolls.
