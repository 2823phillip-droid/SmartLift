# TODO
last_updated: 2026-10-19 (afternoon)

## Current State (as of this update)

- **Git HEAD:** `5702796` — "fix: normalize phase in session-targets endpoint"
- **Build:** latest build synced to iOS at `frontend/ios/App/App/public/assets/`
- **Deploy status:** Backend deployed to Fly (commit `5702796`). Health OK.
- **Progression system:** COMPLETE
  - BlockState phase: String (foundation_1, foundation_2, hypertrophy, strength_a, strength_b, strength_peak, deload)
  - Transition function: resolve_model_transition with 8 rules + PHASE_TRANSITION_MULTIPLIERS
  - Phase advancement triggers: min_weeks per phase, can_advance_phase, get_next_phase
  - Auto-advance in calculate endpoint
  - Model comparison logic in calculate + session-targets (detects model mismatch, applies transition)
  - Phase normalization in get_block_state + session-targets (converts "1" → "foundation_1")
  - Weight rounding: _round_to_nearest_5 helper
  - Coaching messages: production-ready
  - Session target: includes last session recap + today's target + "why"
  - FOUNDATION pill: on PreWorkoutScreen

## Vision (Finished Product)

A progression-powered workout system:

- **Progression engine** — 7 phases (Foundation, Linear Baseline, Hypertrophy, Strength A/B/Peak, Maintenance), transitions between phases, double/linear progression logic, personalized based on user history
- **Web interface** — build and plan workouts, view progression, manage phases, exercise library with videos, routine management
- **iOS app** — execute workouts, set logging, rest timer, session targets, phase context (FOUNDATION pill)
- **Apple Watch** — companion for execution (quick logging, rest timer, current set info)
- **Exercise library** — 1384 exercises from ExerciseDB (GIFs), custom videos for gaps (created by user over time), eventual replacement of all ExerciseDB GIFs
- **Android + Android Watch** — future, after iOS/web/Watch are solid

**Why this is worth building:**
- Most workout apps don't have a real progression system
- MuscleWiki has exercise videos + workout builder, but no progression engine
- Askeo's differentiator is the progression system + personalization + coaching tied to progression

## Progress Markers

**Done:**
- [x] Progression engine (models, transitions, phase advancement)
- [x] Phase normalization (numeric → descriptive)
- [x] Model comparison logic (detects model mismatch, applies transition)
- [x] Weight rounding to nearest 5 lbs
- [x] iOS app functional (workout execution, logging, session targets)
- [x] FOUNDATION pill on Ready screen
- [x] Session target with last session recap + "why"
- [x] Coaching messages production-ready
- [x] Exercise library (1384 exercises from ExerciseDB)
- [x] Phase details table (weeks, reps split, progression models)

**Next (this year):**
- [ ] Web interface (workout builder, progression view, exercise library, routine management)
- [ ] Apple Watch companion (quick logging, rest timer, current set)
- [ ] Custom videos for missing exercises (lever leg press, standing OHP, smith machine hip thruster, warmup exercises)
- [ ] End-to-end testing from Xcode (user testing)

**Later (after core is solid):**
- [ ] Replace ExerciseDB GIFs with custom videos (gradual, over time)
- [ ] Android app
- [ ] Android Watch

## Phase Plan

### Completed
1. Phase 0: DONE — session-targets endpoint fixed
2. Phase 1: DONE — frontend model-agnostic
3. Phase 2: DONE — build backend model classes (6 models in progression.py)
4. Phase 3: DONE — model_picker delegates to models, session_targets uses model prescriptions
5. Phase 4: DONE — Progression system complete:
   - BlockState phase granularity (string phases)
   - Transition function (resolve_model_transition)
   - Phase advancement triggers (can_advance_phase, min_weeks)
   - Auto-advance in calculate endpoint
   - Model comparison logic (calculate + session-targets)
   - Phase normalization (get_block_state + session-targets)
   - Weight rounding (_round_to_nearest_5)
   - All models handle phase parameter
   - Coaching messages production-ready
   - Session target with last session recap + why
   - FOUNDATION pill on Ready screen
   - Probe fix (/healthz)

### Phase Details

| Phase | Block | Weeks | Reps (Compound) | Reps (Isolation) | Progression (Compound) | Progression (Isolation) |
|-------|-------|-------|-----------------|------------------|------------------------|--------------------------|
| 1 | Foundation | 6 | 8-10 (start at 10) | 8-10 (start at 10) | Double | Double |
| 2 | Linear Baseline | 2-3 | 8-10 → 6-8 | 8-10 | Linear | Double |
| 3 | Hypertrophy | 6 | 10-12 | 10-12 | Double | Double |
| 4 | Strength A | 3 | 8-10 (linear) | 8-10 | Linear | Double |
| 5 | Strength B | 2 | 6-8 (linear) | 6-8 | Linear | Double |
| 6 | Strength Peak | 1 | 4-6 (linear) | 4-6 | Linear | Double |
| 7 | Maintenance | 1-2 | 10-12 | 10-12 | None (RPE 5) | None (RPE 5) |

**Key decisions:**
- Foundation: all exercises start at 10 reps (rep_cap), double progression for all
- Linear Baseline & Strength: compound = linear (add weight each session, reps find their level), isolation = double (work within rep range first)
- Hypertrophy: all double progression
- Strength A/B/Peak: linear for compound (pushing limits), double for isolation

## GIF/Video Creation

### Strategy
- Video yourself doing the exercise → Uthana (motion capture) → Bender (avatar animation) → GIF export → add to database
- Do exercises in one pass: create video, then add exercise to database with video URL (no placeholder step)
- Add exercises to database only after video is ready
- Eventually replace ExerciseDB GIFs with custom videos (gradual, over time)

### Warmup Videos (custom)
- [ ] Frankensteins (walk forward, kick leg to opposite hand)
- [ ] Hip rotations (stand, rotate hip in circle)
- [ ] High knees (run in place, knees to chest)
- [ ] Butt kicks (run in place, heels to glutes)
- [ ] Walking lunges (to and back, 10 yards)

### Missing exercises (need custom videos)
- [ ] Lever Leg Press (leverage machine, two legs)
- [ ] Standing OHP (standing overhead press, dumbbell or barbell)
- [ ] Smith Machine Hip Thruster

### Existing exercises (no custom video needed)
- [x] Monster walks (id 1020) — already in DB
- [x] High knee against wall (id 835) — already in DB
- [x] Walking high knees lunge (id 1270) — already in DB

## Still Needed

- [ ] Web interface (workout builder, progression view, exercise library, routine management)
- [ ] Apple Watch companion (quick logging, rest timer, current set)
- [ ] Custom videos for missing exercises (see GIF/Video Creation section)
- [ ] End-to-end testing from Xcode (user testing)
- [ ] Any tuning the user wants after testing

## Bugs to fix

### Current issues
- None currently open — all progression system issues resolved

### Previous bugs (resolved)
- [x] Session-targets 500 — all attribute errors
- [x] Session-targets returning 0 exercises
- [x] Fallback prescription computation causing old linear messages — removed
- [x] logSet function using local computePrescription — patched to use model_picker data
- [x] Foundation coaching messages not showing — FIXED
- [x] Set 2 weight reverts to session target on nav away/back — FIXED
- [x] Rest timer lost on nav away/back — FIXED
- [x] Local prescription computation in expandExercise — REMOVED
- [x] Local prescription computation in getNextSetTarget — REMOVED
- [x] Local prescription computation in logSet — REMOVED
- [x] Race condition between progression fetch and auto-expand — FIXED (state → ref)
- [x] Barbell Deadlift showing 45 lbs — FIXED (start_weight fallback removed, uses last session data)
- [x] Session targets finding wrong session — FIXED (queries all completed sessions' logs)
- [x] Session targets including cancelled sessions — FIXED (filter by ended_at.isnot(None))
- [x] probe() failing — FIXED (use /healthz instead of /settings/api_base)

## What We Just Learned

- The `/api/settings/{key}` endpoint requires auth, so using it for API base probe fails with 401. Use `/healthz` instead — it's a public endpoint that just checks if the API is reachable.
- The FOUNDATION pill belongs on the Ready screen (PreWorkoutScreen), not the Active Workout screen. The Active Workout screen should be clean: header + elapsed time + exercise cards with session target.
- The session target should include the "why" — comparing today's weight/reps to last session to explain why we're doing what we're doing.
- Phase normalization is critical — raw numeric phases ("1", "2") must be converted to descriptive ("foundation_1", "linear_baseline") before passing to resolve_model_transition, or the transition logic won't match.
- Model comparison logic is needed in both calculate and session-targets endpoints — Set 1 (session-targets) and Set 2+ (calculate) both need to detect model mismatch and apply transition.

## Architecture Decision

**Model_Picker as Thin Selector:**
- Model_Picker determines *which* model to use (block_state, load meter, time, workout count, manual) and delegates to that model for ALL data
- Each model has a `compute()` method that returns everything: suggested_weight, rep_floor, rep_cap, coaching_message, block_name, increment_rule, should_increase
- Frontend renders whatever the model returns — zero model-specific if/statements
- Flipping the model = Model_Picker picks a different model = model.compute() returns different data = frontend automatically renders differently
- Session-targets passes last-session data into `Model.compute()` so Set 1 coaching message includes last-session context
- Per-set compute flow passes previous set data into `Model.compute()` for Set 2+ coaching messages

**Set 1 vs Set 2+ Architecture:**
- **Set 1 (Session Target):** Pulls from last session data, uses current model's logic. Model_Picker picks the model, model.compute() returns Set 1 coaching message (incorporating last session weight/reps). Weight and reps from model.compute() response. The session_target field includes last session recap + why.
- **Set 2+ (Set Target):** Uses Model_Picker logic with previous set data. Per-set compute flow calls model.compute() with previous_set_data.

**Cross-Model Transitions:**
- Track previous phase via SetLog.block_mode (per-exercise, per-session) — DONE
- Transition function (`resolve_model_transition` in progression.py) handles weight adjustment on phase change — DONE (8 transitions mapped)
- 8 transitions:
  1. Foundation Phase 1 → Phase 2 (Double → Linear, reps 8-10 → 6-8, +5%)
  2. Foundation Phase 2 → Hypertrophy (Linear → Double, reps 6-8 → 10-12, -10%)
  3. Hypertrophy → Strength A (Double, 10-12 → 8-10, +5%)
  4. Strength A → Strength B (Double, 8-10 → 6-8, +5%)
  5. Strength B → Strength Peak (Double, 6-8 → 4-6, +5%)
  6. Strength Peak → Deload (Double → None, -20%)
  7. Deload → Hypertrophy (None → Double, +5%)
  8. Any → Foundation Phase 1 (re-entry after long break, -15%)
- BlockState phase values: foundation_1, foundation_2, hypertrophy, strength_a, strength_b, strength_peak, deload — DONE
- Phase advancement triggers: week thresholds (min_weeks per phase) — DONE