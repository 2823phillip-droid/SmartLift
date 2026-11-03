# TODO
last_updated: 2026-10-19 (afternoon)

## Current State (as of this update)

- **Git HEAD:** `96bb12f` — "docs: update MEMORY-INDEX status to 45c5868, document session targets UnboundLocalError fix"
- **Build:** Nov 1, synced to iOS at `frontend/ios/App/App/public/assets/index-DzR_LrvL.js`
- **Deploy status:** Backend deployed to Fly (commits through `96bb12f`). Health OK.
- **Progression system:** Phase 4 COMPLETE, Phase 5 Foundation logic redesign COMPLETE. All changes deployed:
  - Foundation 2 removed — single 6-week foundation phase with 60% load threshold
  - Linear baseline removed as block mode (Strength A/B/C implement linear progression)
  - Strength Peak/C model added (3-5 reps, 1 week, linear progression)
  - Coach Progression toggle + manual phase selector added
  - Auto-advance now load-gated (6 weeks + 60% load, not just time)
  - All models return identical structure with personalized Set 2+ coaching messages
  - Session targets fix: removed local `from datetime import timezone` that shadowed global import causing UnboundLocalError (session targets + auto-expand now working)
    - Phase-agnostic logic functions (calculate_weighted_avg_weight, calculate_next_session_weight, analyze_session, build_session_target_message, build_set_target_message)
    - Session target uses ALL sets from last session, weighted average logic, reps=10
    - Set 2+ messaging: generic message using build_set_target_message(), stays at same weight mid-session
    - Target shows rep_cap (10) as goal to progress
    - Architecture: frontend decoupled from phase logic — works with "flip of a switch" between models

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

|| Phase | Block | Weeks | Reps (Compound) | Reps (Isolation) | Progression (Compound) | Progression (Isolation) |
||-------|-------|-------|-----------------|------------------|------------------------|--------------------------|
|| 1 | Foundation | 6 | 8-10 (start at 10) | 8-10 (start at 10) | Double | Double |
|| 2 | Hypertrophy | 4 | 10-12 | 10-12 | Double | Double |
|| 3 | Strength A | 3 | 8-10 (linear) | 8-10 | Linear | Double |
|| 4 | Strength B | 2 | 6-8 (linear) | 6-8 | Linear | Double |
|| 5 | Strength Peak | 1 | 3-5 (linear) | 3-5 | Linear | Double |
|| 6 | Maintenance | 1-2 | 10-12 | 10-12 | None (RPE 5) | None (RPE 5) |

**Key decisions:**
- Foundation: all exercises start at 10 reps (rep_cap), double progression for all, 6 weeks + 60% load threshold for auto-advance
- Linear Baseline removed as block mode — Strength A/B/C implement linear progression in their own compute() methods
- Hypertrophy: all double progression, 4 weeks
- Strength A/B/C: linear progression for compounds, double for isolations. A (3 weeks, 8-10 reps), B (2 weeks, 6-8 reps), C/Peak (1 week, 3-5 reps, 120s rest, "hard" workload)
- Maintenance: RPE 5 cap, -20% weight if overloaded
- Coach Progression toggle: ON (default) = auto-advance with weeks + load check. OFF = manual phase selector in settings
- Session targets fix: removed local `from datetime import timezone` that shadowed global import causing UnboundLocalError

### Foundation Phase Logic Work (Phase 5 — COMPLETE — LATEST KNOWN GOOD POINT)

#### Context
After deploying Phase 4, user tested Chest & Triceps workout on 2026-10-21 and found 6 issues with session targets and coaching messages. Investigation revealed the Foundation phase needs a more sophisticated logic than what was built in Phase 4. All issues related to session target/Set 2+ messaging have been fixed and deployed.

#### 6 Bugs Found (2026-10-21 Chest & Triceps)

1. **Re-entry message leaks to Set 2** — "Re-entering the foundation block after time away" appears on Set 2, but should only apply to Set 1. FIXED (commit ea25108).
2. **Foundation 15% reduction not visible** — Session target shows "continuing with 100 lbs" but doesn't convey the reduction context. CONFIRMED CORRECT — reduction IS applied (120→100 lbs).
3. **Stay/increase/decrease branching missing** — Session target should branch based on last session vs current session comparison (stay vs increase vs decrease). IMPLEMENTED via weighted average logic.
4. **Incline at 6 reps (below Foundation 1 range of 8-10)** — Set 1 Incline at 6 reps. NOT YET INVESTIGATED — FoundationModel sets rep_floor=8, rep_cap=10.
5. **"Cannot save changes when trying to edit a set"** — Frontend error when editing sets. NOT YET ADDRESSED.
6. **"Need to find arsenal strength fly machine"** — Missing exercise reference. NOT YET ADDRESSED.

#### Session Target Message Structure (Set 1)
- Generic across all phases (same template, different values)
- "Last time we did [exercise] on [date] — [full set breakdown]. Today, we're [continuing/increasing/decreasing] to [weight] lbs for [reps] reps. [why]"
- coaching_message is phase-specific from model
- Uses ALL sets from last session (not just most recent)
- Weighted average logic for next session weight
- Reps always 10 for Foundation

#### Set 2+ Coaching Message (Set Target)
- Generic across all phases — same structure, different values
- "Last set: [weight] lbs × [reps] reps [effort]. [Hold/Increase] to [next_weight] lbs. Target: [rep_cap] reps."
- Values from progression logic, message structure same for all phases
- Stays at same weight mid-session (no weight increase between sets)
- Phase context comes from Set 1 coaching_message, not Set 2+
- Target shows rep_cap (10) as the goal to progress

#### Foundation-Specific Logic Implemented

1. **Double progression within session:** User can self-progress weight between sets (e.g., Set 1: 135, Set 2: 140, Set 3: 145). Handled via weighted average of all weights used.

2. **Effort-weighted average:** For calculating next session's starting weight, use a weighted average where weights with effort closer to target_effort (6 for Foundation) count more. Formula: `factor = 1 / (abs(effort - target_effort) + 1)`. Only count sets that hit target reps.

3. **Rep gate:** All sets must hit target reps to progress. If any set misses, stay at same weight (or drop to weighted avg of successful sets).

4. **Starting weight for next session:**
   - Normal session (same weight all sets): weighted_avg + increment
   - Self-progression session (different weights): weighted_avg of all weights used
   - If missed target on any set: weighted_avg of successful sets only (may be lower)

5. **Effort context in messaging:**
   - First set effort 8-10 → flag as potentially too heavy, suggest drop
   - First set effort 4-7 → "right in the zone", stay
   - First set effort 1-3 → "felt light", suggest increase
   - Later sets effort increase is normal (fatigue) — don't flag unless unusual

6. **Phase goal messaging:** "The goal of this phase is to hit 10 reps on ALL sets at the SAME weight, with effort ~6 on the first set. Once you can do that, move up 5 lbs."

#### Architecture for Reusability (COMPLETE)

Build phase-agnostic logic functions that accept phase parameters:

```python
# Phase parameters (Foundation example)
FOUNDATION_PARAMS = {
    "target_reps": 10,
    "target_effort": 6,
    "increment": 5,
    "phase_goal": "all sets at same weight, hit 10 reps, effort ~6 on first set",
    "phase_name": "Foundation",
    "rep_floor": 8,
    "rep_cap": 10,
}

# Phase-agnostic functions
def calculate_weighted_avg_weight(sets_data, target_reps, target_effort):
    # Weights × effort factors, only successful sets
    ...

def calculate_next_session_weight(sets_data, target_reps, target_effort, increment):
    # Rep gate + weighted avg or avg + increment
    ...

def build_session_target_message(sets_data, next_weight, params):
    # Same structure, phase-specific text from params
    ...

def build_set_target_message(prev_set, current_weight, params, is_set_target=False):
    # Same structure, phase-specific guidance from params
    # is_set_target=True: stay at same weight mid-session
    ...
```

To add Hypertrophy support: define HYPERTROPHY_PARAMS, call same functions. No logic changes needed.

#### Implementation Tasks (COMPLETED)

- [x] Create phase-agnostic logic functions in `backend/progression.py`
- [x] Create `calculate_weighted_avg_weight()` function
- [x] Create `calculate_next_session_weight()` function
- [x] Create `analyze_session()` function
- [x] Create `build_session_target_message()` function
- [x] Create `build_set_target_message()` function with is_set_target param
- [x] Update `session_targets` endpoint in `backend/main.py` to use new logic
- [x] Update `FoundationModel.compute()` Set 2+ messaging via build_set_target_message
- [x] Add `is_set_target` field to ProgressionCalculateRequest
- [x] Add `coaching_message` field to ProgressionCalculateResponse
- [x] Update calculate endpoint to call build_set_target_message for Set 2+
- [x] Update frontend to pass `is_set_target: true` for Set 2+ calls
- [x] Update frontend to use coaching_message from calculate response
- [x] Test with user — verified working
- [x] **Phase 5.1: Foundation 2 removed** — single 6-week foundation phase only. Removed from PHASE_SEQUENCE, PHASE_ADVANCEMENT_THRESHOLDS, FoundationModel.compute(), PHASE_TRANSITION_MULTIPLIERS, get_phase_description_for_ready_screen, get_block_mode_for_phase. Foundation 1 → Hypertrophy directly.
- [x] **Phase 5.2: Foundation auto-advance load-gated** — requires 6 weeks AND 60% load (21-day consistency window via compute_load). Not just time-based. Auto-advance checks both week threshold and load threshold.
- [x] **Phase 5.3: linear_baseline removed as block mode** — removed from BLOCK_REP_TARGETS, BLOCK_SEQUENCE, BLOCK_PHASES, _get_block_name, _get_model_for_block, get_phase_description_for_ready_screen, is_block_complete, NORMALIZE_PHASE, block_mode_to_phase, numeric_to_descriptive, BLOCK_ADVANCEMENT_THRESHOLDS, ADVANCEMENT_SEQUENCE. Strength A/B/C implement linear progression in their own compute() methods.
- [x] **Phase 5.4: Strength Peak/C model added** — new StrengthCModel class (3-5 reps, 1 week, linear progression, 120s rest, "hard" workload). Added to BLOCK_REP_TARGETS, _get_model_for_block, PHASE_ADVANCEMENT_THRESHOLDS (1 week), phase descriptions.
- [x] **Phase 5.5: All models return identical structure with personalized Set 2+ coaching messages** — HypertrophyModel, LinearModel, StrengthAModel, StrengthBModel all updated to return personalized Set 2+ messages based on reps/effort/weight, matching Foundation pattern.
- [x] **Phase 5.6: Coach Progression toggle + manual phase selector** — backend check added to auto-advance (skip when "false"), frontend phase selector added to SettingsScreen (dropdown + Set Phase button, shown when coach_progression is "false"), patchBlockState API method added.
- [x] **Phase 5.7: Session targets fix** — removed local `from datetime import timezone` at line 4192 in `_do_session_targets` that shadowed global import (line 9), causing UnboundLocalError when `timezone.utc` was accessed at line 4139 before the local import executed. Session targets + auto-expand now working.

#### Design Decisions Made

1. **Rep-based progression gate** — hit target on all sets → increase. Effort is context, not gate.
2. **Effort-weighted average for starting weight** — weights closer to target_effort count more.
3. **Only count successful sets in avg** — sets that missed target reps don't count.
4. **Phase-agnostic logic, phase-specific params** — same functions work for all phases with different params.
5. **Session target message: generic structure, phase-specific coaching_message** — Set 1 has both.
6. **Set 2+ message: generic structure, no phase-specific coaching_message** — phase context comes from Set 1.
7. **Self-progression handling** — weighted avg of all weights used, rounded to nearest 5.
8. **Target displays rep_cap (10) not rep_floor-rep_cap (8-10)** — 10 is the goal to progress.
9. **Frontend decoupled from phase logic** — passes `is_set_target: true`, displays backend response. Works with "flip of a switch" between models.

#### Files Modified

- `backend/progression.py` — Added phase-agnostic logic functions (calculate_weighted_avg_weight, calculate_next_session_weight, analyze_session, build_session_target_message, build_set_target_message), updated FoundationModel.compute()
- `backend/main.py` — Updated session_targets endpoint to use new logic, added is_set_target to ProgressionCalculateRequest, added coaching_message to ProgressionCalculateResponse, updated calculate endpoint to call build_set_target_message
- `frontend/src/pages/ActiveWorkoutScreen.tsx` — Updated to pass is_set_target=true for Set 2+, use coaching_message from calculate response
- `frontend/src/pages/SortableExerciseCard.tsx` — Added whitespace-pre-wrap for session_target formatting

#### LATEST KNOWN GOOD POINT

- **Commit:** `96bb12f`
- **State:** All Phase 5 changes deployed and working. Foundation phase simplified to single 6-week phase with 60% load threshold. Foundation 2 and linear_baseline removed as block modes. Strength Peak/C model added. All models return identical structure with personalized Set 2+ coaching messages. Coach Progression toggle with manual phase selector working. Session targets + auto-expand fixed (UnboundLocalError resolved). Auto-advance now load-gated (6 weeks + 60% load).
- **To test:** Clean Build Folder in Xcode (Shift+Cmd+K), rebuild, run on iPhone

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

### Access & Credentials (for AI troubleshooting)

**Order of operations:**
1. Set up LastPass — store production DATABASE_URL and identify all other logins needed
2. Install LastPass CLI (optional but recommended): `brew install lastpass-cli`
3. Then start working on adding/modifying exercises in the production database

**Working now:**
- GitHub SSH key: `~/.ssh/id_ed25519` (ed25519, added to GitHub as auth key)
- Fly.io CLI: `~/.fly/config.yml` (access_token, works for `fly` commands)
- Git remote: `git@github.com:2823phillip-droid/SmartLift.git` (SSH)

**Need to store in LastPass:**
- [ ] **Production DATABASE_URL** — Full Postgres connection string (with password). Currently only visible in Fly.io dashboard (Settings → Secrets → DATABASE_URL). Not exportable via `fly secrets` CLI. Needed to: connect to production Postgres from the studio for troubleshooting, run classification scripts against production, query production data directly, add/modify exercises in production DB.
- [ ] **App auth token** — A valid Bearer token for the iOS app's auth system. Needed to: test API endpoints from terminal (curl, python, etc.) like `GET /api/exercise-library`, `POST /api/coach/session-targets`, `POST /api/exercise-library`. Currently only the iOS app has working auth. Options: (a) log into the app and extract the token from network requests, (b) create a test user via the `/api/auth/signup` endpoint and use that token, (c) add a debug/token endpoint to the backend.
- [ ] **LastPass master password** — If installing `lpass` CLI, the master password is needed to unlock the vault from terminal. Store in LastPass as a secure note (ironic but necessary for CLI access).

**Optional (for future reference):**
- [ ] **GitHub personal access token** — If SSH key ever stops working, a PAT can be used for HTTPS git operations. Not needed now (SSH working).
- [ ] **Other Fly.io secrets** — OpenRouter API key, Nous API key, ADMIN_BOOTSTRAP_SECRET, DEBUG_SECRET. These are already injected into the running app. Only needed if debugging from outside the app environment.

**Reference files (don't modify):**
- `backend/exercisedb_data.json` — Purchased ExercisDB seed (13MB, 1384 exercises). DO NOT MODIFY.
- `backend/exercisedb_gifs/{180,360}/` — Exercise GIFs, served via `/api/exercisedb/gifs/{id}.gif`
- `backend/classify_exercises.py` and related — Scripts that populate auto-tag fields (is_compound, movement_type, primary_equipment, etc.)

---

- [ ] Web interface (workout builder, progression view, exercise library, routine management)
- [ ] Apple Watch companion (quick logging, rest timer, current set)
- [ ] Custom videos for missing exercises (see GIF/Video Creation section)
- [ ] End-to-end testing from Xcode (user testing)
- [ ] Any tuning the user wants after testing

## Bugs to fix

### Current issues

#### Foundation Phase Bugs (2026-10-21 Chest & Triceps)

1. **Re-entry message leaks to Set 2** — "Re-entering the foundation block after time away" appears on Set 2, but should only apply to Set 1. FIXED (commit ea25108).
2. **Foundation 15% reduction not visible** — CONFIRMED CORRECT. Reduction IS applied (120→100 lbs). Session target just needs better messaging.
3. **Stay/increase/decrease branching missing** — Session target should branch based on last session vs current session comparison. PARTIALLY IMPLEMENTED.
4. **Incline at 6 reps (below Foundation 1 range of 8-10)** — Set 1 Incline at 6 reps. NOT YET INVESTIGATED.
5. **"Cannot save changes when trying to edit a set"** — Frontend error when editing sets. NOT YET ADDRESSED.
6. **"Need to find arsenal strength fly machine"** — Missing exercise reference. NOT YET ADDRESSED.

#### Foundation Phase Logic Redesign (Phase 5)

See "Foundation Phase Logic Work (Phase 5 — In Progress)" section above for full details.

- [x] Implement weighted average function for starting weight calculation
- [x] Update session_targets to use new Foundation logic
- [ ] Update Set 2+ messaging with phase-specific guidance
- [ ] Test with user

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