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
|||- [~] Phase 2: Library cleanup and classification — COMPLETE. 1359/1359 exercises classified (100%). Database fully classified with 32 columns including base_movement, hitt_worthy, warmup_type, primary_equipment. Equipment categories refined from 8→17. Frontend equipment toggle system built and working. Coach progression toggle added. Muscle groups consolidated. Deload override toggle removed. Questionnaire auto-updates equipment settings. → `ReleaseNotes/progression_tasks.md`
|- [ ] Phase 3: Onboarding wizard + user profile schema + block state
|||- [ ] 3.1: Questionnaire flow (existing — `QuestionnaireScreen.tsx` + `config/questionnaire.ts`)
|||- [ ] 3.2: Create `block_state` table/schema — stores user's current block mode, week number, start date, phase
|||- [ ] 3.3: Link questionnaire → block state — when beginner selected, auto-create Foundation block (week 1/6)
|||- [ ] 3.4: Block advancement logic — advance week, advance block, auto-switch on stall
|||- [ ] 3.5: User profile schema update — add block_state reference, goals, experience level, equipment
|- [ ] Phase 4: Model picker engine (`model_picker` function)
|||- [ ] 4.1: Implement `model_picker(exercise, history, block_state)` → returns (rep_floor, rep_cap, increment_rule)
|||- [ ] 4.2: Unit test model_picker for each block type (Foundation, Linear, Hypertrophy, Strength A/B, Deload)
|||- [ ] 4.3: Add `POST /api/progression/calculate` endpoint — takes exercise + history, returns next weight/reps
|||- [ ] 4.4: Add `POST /api/progression/advance` endpoint — advance block or week
|||- [ ] 4.5: Test Double Progression logic — verify rep cap → weight increase → rep reset works
|- [ ] Phase 5: Frontend UI (block pill, rep targets, deload states)
|||- [ ] 5.1: Add block pill to workout screen — "Foundation Block • Week 3/6"
|||- [ ] 5.2: Add rep target display — "Target: 8-10 reps" on exercise cards
|||- [ ] 5.3: Add progression indicator — visual cue when user hits rep cap (ready to increase weight)
|||- [ ] 5.4: Settings to view/change block mode — see current block, manually advance
|- [ ] Phase 6: Data sync & deployment
|||- [ ] 6.1: Run migrations on production Postgres (block_state table, etc.)
|||- [ ] 6.2: Deploy progression endpoints
|||- [ ] 6.3: Frontend type updates (block state types, progression response types)
|||- [ ] 6.4: End-to-end testing (see Phase 3 in progression_tasks.md for test plan)
|- [ ] Phase 7: Coach engine polish (Active Coach Logic Layer)
|||- [ ] 7.1: Coach messages for block switches, progression changes
|||- [ ] 7.2: Handle mid-block goal changes
|||- [ ] 7.3: Injury/limitation adjustments
|||- [ ] 7.4: Rest timer integration by block
|||- [ ] 7.5: Foundational health integration (sleep, nutrition, mobility)

## Modifications / Tweaks

### Coach messages
- [ ] Change "This workout" to "Next workout" in all coaching messages (backend `rules.py` + frontend `rules.ts`)

### Weight display
- [ ] Audit all frontend weight display paths for consistent kg/lbs conversion (start_weight, draft prefill, `getNextSetTarget()`, coach prescription inputs, recap screens)
- [ ] **Allow user to override weight** — coach suggests +5lbs progression, but user can enter custom weight for the set. Needed for exercises where gym doesn't have intermediate dumbbell sizes (e.g., lateral raises where 12.5lbs isn't available). Backend progression stays +5lbs default; frontend UI adds override option.

### Layout / UI
- [ ] **Coach tab layout** — header dead-pinned at top edge on every tab (no safe-area gap, no header drift); chatbox static; only conversation box scrolls inside coach tab. Outer tab should not scroll. Desired: more like Slack. Currently the header scrolls out of sight, chatbox scrolls, conversation box also scrolls.
