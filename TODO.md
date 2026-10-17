# TODO
last_updated: 2026-10-14 (evening)

## Current State (as of this update)

- **Git HEAD:** `4f7fb8c` — "debug: add log statement at beginning of logSet to confirm it's being called"
- **Build:** latest build (Oct 14 15:58), synced to iOS at `frontend/ios/App/App/public/assets/`
- **Deploy status:** Backend deployed to Fly (commit `d7746a8`). Health OK.
- **SetLog.block_mode:** ADDED — SetLog now captures the active block_mode when sets are logged (models.py + main.py). Backend automatically sets it from the user's current BlockState. Enables per-exercise, per-session model tracking for transition detection.
- **Session-targets endpoint:** FIXED — now queries ALL completed sessions' logs (like calculate does), not just the last completed session.
- **Frontend next_reps:** FIXED — frontend now uses `next_reps` from the API response instead of calculating it.
- **LogSet calculate call:** FIXED — logSet now calls the calculate endpoint after logging each set to get the updated prescription for the next set.

## Root Cause Analysis (Barbell Deadlift showing 45 lbs)

**FIXED (commit bed7358):**
The session-targets endpoint was querying the last completed session OVERALL, not the last completed session for the same template. This caused incorrect weights when switching between different workouts.

**FIX:**
Changed session-targets to query ALL completed sessions' logs for each exercise (like calculate does), not just the last completed session.

**Current issue (NOT FIXED):**
Barbell Deadlift shows 120 lbs for Set 1 (correct), but Set 2 shows 120 lbs × 11 reps instead of 120 lbs × 8 reps.

**Root cause:**
The frontend was calculating `next_reps` based on `should_increase`:
- If `should_increase`: `rep_cap + 1 = 11` (wrong)
- Else: `rep_floor = 8` (correct)

The Foundation model returns `next_reps = 8` (always reset to floor), but the API wasn't returning it.

**Fix (commit b680efb):**
Added `next_reps` to both API responses (calculate and session-targets). Frontend now uses `next_reps` from the API instead of calculating it.

**Still not working:**
The logSet function should call the calculate endpoint after logging Set 1 to get the updated prescription for Set 2. We added this (commit ef7b115), but the "logSet called" log is not appearing in Safari.

**Possible causes:**
1. Xcode build not picking up latest changes (user says they clean every time)
2. logSet function not being called (but app IS working — rest timer pops up and moves to next set)
3. Logs being filtered/suppressed in Safari (user says it's set to "All")

**Next steps:**
1. Verify Xcode build is picking up latest changes (check file modification timestamps)
2. Try console.warn instead of console.log to see if it appears
3. Check if button's onClick handler is actually calling logSet
- Before Oct 5, session 125 (Sep 11, Back and Bicep) was the last completed session
- session-targets found session 125 → got deadlift logs → worked correctly
- User was doing Back and Bicep consistently, so the "last completed session overall" happened to be the right one

**Why it broke:**
- User completed session 261 (Oct 5, different template) after the 9-11 Back and Bicep workout
- Now session 261 is the last completed session overall
- session-targets finds session 261 → no deadlift logs → returns 45 lbs

**The calculate endpoint doesn't have this problem:**
- calculate queries ALL user logs for each exercise (not just the last session)
- It finds the most recent logs for each exercise across all completed sessions
- This is the correct behavior and what session-targets should do

**Proper fix:**
Make session-targets query the most recent logs for each exercise across ALL completed sessions (like calculate does), not just the last completed session. This ensures:
- It finds the correct logs for each exercise regardless of which session is "last completed"
- It works when switching between different routines
- It matches what calculate does and what the user experienced before the race condition fix

## Session Target Status (CURRENT)

- [x] Session-targets endpoint returning 0 exercises — FIXED
- [x] 500 errors — FIXED (7 attribute errors resolved)
- [x] "This is the coach notes for Foundation." showing — VERIFIED on device
- [x] Session targets now correctly queries last session logs using all exercise_entry_ids from exercise_library — FIXED (commit 06f1e9a) but INCORRECTLY — finds wrong session
- [x] Session targets filters out cancelled (incomplete) sessions — FIXED (commit c535123)
- [x] Coaching messages come from backend model classes — Phase 2 models built (6 classes in progression.py); Phase 3 will wire session_targets to use them
- [x] Session targets use model-generated coaching messages (not hardcoded) — Phase 3 DONE
- [ ] Session targets queries most recent logs for each exercise across ALL completed sessions (like calculate) — NEXT (root cause fix)
- [ ] Set 1 coaching message pulls from last session data — NEXT (Phase 5)
- [ ] Cross-model weight adjustment on model switch — NEXT (Phase 5). **Status:** Transition system designed (8 transitions mapped). SetLog.block_mode added for tracking. BlockState phase granularity, transition function, and phase advancement triggers still need building. **Design:** `resolve_model_transition(previous_phase, current_phase, prescription)` in progression.py applies weight multipliers per transition pair. Normal cycle: Foundation_1 → Foundation_2 → Hypertrophy → Strength_A → Strength_B → Strength_Peak → Deload → Hypertrophy (loop). Transition #8 (Any → Foundation_1) is re-entry after long break only.
- [ ] Model indicator appears in coach notes header — NEXT (Phase 5)

## What We Just Learned (Drawing file analysis + current state)

The session-targets endpoint works. The frontend displays coaching messages from the backend. The frontend is now model-agnostic (Phase 1 done): it removed all local prescription computation and relies entirely on backend session targets.

**Race condition fixed:** The progression fetch (`fetchExerciseProgression`) was overwriting `draftWeight` after the auto-expand had set it from session targets. The `autoExpandComplete` flag was a state variable (React state updates are async), so `fetchExerciseProgression` still saw `autoExpandComplete=false` and overwrote `draftWeight`. Fixed by changing to a ref (`autoExpandCompleteRef`) — refs are synchronous, so the check immediately sees the updated value.

**Current issue:** Barbell Deadlift shows 45 lbs. Last session was 145 lbs × 6 reps. The 45 is likely the `start_weight` fallback in model_picker (when history is empty or model_picker raises an exception). Need to investigate why history is empty or why model_picker is falling back to start_weight.

**Architecture insight (from Drawing file):** Model_Picker is the single source of truth. Frontend never hardcodes model logic. But for this to work, the models need to exist in the backend first. Model_Picker delegates to models. Models return full prescriptions. Session-targets uses model prescriptions. Frontend uses model_picker's prescriptions.

**Phase order:**
1. Phase 0: DONE — session-targets endpoint fixed
2. Phase 1: DONE — frontend model-agnostic
3. Phase 2: DONE — build backend model classes (6 models in progression.py)
4. Phase 3: DONE — model_picker delegates to models, session_targets uses model prescriptions
5. Phase 4: NEXT — frontend uses model_picker's prescription for per-set messages (partially done — local prescriptions removed, but need to verify model_picker is being used correctly)
6. Phase 5: AFTER Phase 4 — detailed per-model session/set target logic + **Model Transition System** (new)
7. Phase 6-9: Onboarding, block state, rotation, coach polish, deployment

## Bugs to fix

### Session Target Summary — CORE FIX (done, verifying)

- [x] Session-targets endpoint returning 0 exercises — FIXED
- [x] 500 errors (7 attribute errors) — FIXED and verified
- [x] "This is the coach notes for Foundation." showing — VERIFIED on device
- [x] Session targets receive correct coaching messages per model — Phase 3 COMPLETE (models return coaching_message; endpoint uses it)
- [x] Session targets not finding last session logs — FIXED (use all exercise_entry_ids from exercise_library)
- [x] Session targets including cancelled sessions — FIXED (filter by ended_at.isnot(None))
- [x] Race condition: progression fetch overwriting draftWeight after auto-expand — FIXED (state → ref)
- [ ] Barbell Deadlift showing 45 lbs (start_weight fallback) instead of 145-150 lbs (last session + increment) — INVESTIGATING

### Previous bugs (resolved)

- [x] Session-targets 500 — NameError: WorkoutSessionExercise not defined
- [x] Session-targets 500 — ImportError: cannot import WorkoutSessionExercise
- [x] Session-targets returning 0 exercises — FIXED
- [x] Fallback prescription computation causing old linear messages — removed
- [x] logSet function using local computePrescription — patched to use model_picker data
- [x] Foundation coaching messages not showing — FIXED and verified
- [x] Set 2 weight reverts to session target on nav away/back — FIXED
- [x] Rest timer lost on nav away/back — FIXED
- [x] Local prescription computation in expandExercise — REMOVED
- [x] Local prescription computation in getNextSetTarget — REMOVED
- [x] Local prescription computation in logSet — REMOVED
- [x] Race condition between progression fetch and auto-expand — FIXED (state → ref)

### Architecture Decision (from Drawing file discussion)

**Model_Picker as Thin Selector:**
- Model_Picker determines *which* model to use (block_state, load meter, time, workout count, manual) and delegates to that model for ALL data
- Each model has a `compute()` method that returns everything: suggested_weight, rep_floor, rep_cap, coaching_message, block_name, increment_rule, should_increase
- Frontend renders whatever the model returns — zero model-specific if/statements
- Flipping the model = Model_Picker picks a different model = model.compute() returns different data = frontend automatically renders differently
- Session-targets passes last-session data into `Model.compute()` so Set 1 coaching message includes last-session context
- Per-set compute flow passes previous set data into `Model.compute()` for Set 2+ coaching messages

**Set 1 vs Set 2+ Architecture:**
- **Set 1 (Session Target):** Pulls from last session data, uses current model's logic. Model_Picker picks the model, model.compute() returns Set 1 coaching message (incorporating last session weight/reps). Weight and reps from model.compute() response.
- **Set 2+ (Set Target):** Uses Model_Picker logic with previous set data. Per-set compute flow calls model.compute() with previous_set_data. Already partially working via per-set computePrescription + block override in frontend, but should ultimately use model.compute() for the coaching message.

**Cross-Model Transitions:**
- Track previous phase via SetLog.block_mode (per-exercise, per-session) — DONE (SetLog.block_mode added)
- Session-level tagging is too coarse — exercises can use different progression rules within the same session (e.g., lateral raises always double)
- Transition function (`resolve_model_transition` in progression.py) handles weight adjustment on phase change — NOT BUILT
- 8 transitions mapped:
  1. Foundation Phase 1 → Phase 2 (Double → Linear, reps 8-10 → 6-8)
  2. Foundation Phase 2 → Hypertrophy (Linear → Double, reps 6-8 → 10-12)
  3. Hypertrophy → Strength A (Double, 10-12 → 8-10)
  4. Strength A → Strength B (Double, 8-10 → 6-8)
  5. Strength B → Strength Peak (Double, 6-8 → 4-6)
  6. Strength Peak → Deload (Double → None, -20%)
  7. Deload → Hypertrophy (None → Double, small increase)
  8. Any → Foundation Phase 1 (re-entry after long break, decrease)
- BlockState needs granular phase values (foundation_1, foundation_2, strength_peak, etc.) — NOT BUILT
- Phase advancement triggers (week thresholds, performance) — NOT BUILT

## Phase Plan

See `ReleaseNotes/progression_tasks.md` for the full detailed phase breakdown. This TODO tracks the working state.

## Modifications / Tweaks

### Coach messages

- [ ] Change "This workout" to "Next workout" in all coaching messages (backend `rules.py` + frontend `rules.ts`)

### Weight display

- [ ] Audit all frontend weight display paths for consistent kg/lbs conversion
- [ ] Allow user to override weight (coach suggests +5lbs, user can enter custom weight)
- [ ] Investigate why Barbell Deadlift shows 45 lbs (start_weight fallback) instead of 145-150 lbs (last session + increment)

### Layout / UI

- [ ] Coach tab layout — header dead-pinned at top, only conversation box scrolls

## Backlog / Wishlist

### Social

- [ ] Friend system
- [ ] Share workouts
- [ ] Status updates

### Prebuilt Templates

- [ ] Remove automatic workout builder — DELETE `POST /api/trainer/generate` endpoint
- [ ] Retire `QuestionnaireScreen.tsx` template-generation logic

### Notifications

- [ ] Push notifications — workout reminders, rest timer alerts, coach messages

### Coach Tab Layout

- [ ] Header dead-pinned at top edge on every tab; only conversation box scrolls