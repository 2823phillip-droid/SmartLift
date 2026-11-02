# PROGRESSION ARCHITECTURE — Implementation Task List

## MODEL HANDOFF (READ THIS FIRST)

This file describes the complete exercise library upgrade required for Coach AI to make quality decisions. The goal: transform raw ExercisDB seed data into a structured, coach-ready reference table where every exercise has accurate classifications so the coach can reason about programming logic (compound vs isolation, equipment tier matching, training target relevance, joint stress limits).

### Current State (exercise_library in workout.db)

Backend DB: `/Users/phillipwalters/Projects/askeo/repo/backend/workout.db` (dev copy on Mac; production is Postgres on Fly.io)

||- **1359 rows** × **32 columns** total. `UNIQUE(name)` on the name column. Primary key = id. Deleted 10 poor-quality exercises (7 POV duplicates, 1 female variant, 2 towel rows). 1359 exercises remain.
|- **is_compound**: **546 True / 813 False** — fully classified. Compounds correctly identified (squats, deadlifts, presses, rows, pull-ups, hip thrusts, glute bridges, etc.). Note: 301 exercises upgraded from isolation to compound when `hip_compound` pattern was added (glute bridges, hip thrusts, kickbacks recategorized). Movement pattern sweep fixed 1 misclassification (cable squatting curl compound→isolation).
|- **movement_type**: **545 compound / 153 helper / 661 isolation** — all three values populated. Helper category includes mobility work (warmup) and structural/prehab work (planks, dead bugs, Pallof press, face pulls, glute bridges). No longer missing mobility/helper. Phase 2 fixes: cable squatting curl reclassified compound→isolation.
|- **exercise_role**: **7 roles populated. Refined from 502 main_compound → 31 main_compound.** Current distribution: 492 accessory / 396 isolation_technical / 31 main_compound / 272 secondary_compound / 11 cool_down / 69 prehab_activation / 88 warmup. Main compounds reduced from 502 to 31 by selecting canonical versions per equipment type (barbell, dumbbell, machine, bodyweight) for each movement pattern. Secondary_compound expanded for variations with different emphasis. Accessory absorbed everything else (specialized, machine, band, plyometric, miscategorized). Tricep reclassifications: barbell close-grip bench press moved to push_tricep_compound as main_compound; skull press moved to tricep_isolation as isolation_technical; 7 dip/assisted exercises moved to accessory. Phase 2 fixes: 5 tricep kickbacks (dumbbell) secondary_compound→isolation_technical, 3 calf raises (machine) secondary_compound→isolation_technical. Rear axe kick (id=1339) reclassified accessory→warmup (dynamic warmup).
|- **primary_equipment**: **Normalized and populated.** 17 categories, "other" eliminated entirely. Breakdown: bodyweight (297), dumbbell (295), barbell (177), cable (159), machine (144), resistance_band (70), stretching (67), kettlebell (42), plates (41), stability_ball (31), medicine_ball (14), rope (11), cardio (6), roller (2), sledge (1), tire (1), arms_forearm (1). "Gym Weights" preset = plates + dumbbells + barbells (convenience toggle). Empty categories core_abs and hitt_cardio removed. The raw `equipment` field still holds original comma-separated strings — `primary_equipment` is the cleaned version.
|- **movement_pattern**: **FULLY POPULATED (1359/1359, 100%).** Granular movement taxonomy (43 patterns) that describes what the exercise does at the movement level, independent of equipment. Present in both `exercise_v2.db` and `workout.db`. All exercises classified including 69 band exercises (classified by movement, not equipment). Movement pattern sweep complete: 16 pattern corrections applied (rear delt rows, chest presses, tricep exercises, front raise, back extension, lateral raise, overhead press, med ball throws, grip exercise) + 2 new patterns created (grip, hip_abduction_adduction) = 43 patterns total. New patterns: `grip` (lever gripper hands, 1 exercise), `hip_abduction_adduction` (5 hip abduction/adduction exercises).
- **classify_exercises.py**: **BUILT and functional, re-run with fixes.** Located at `backend/classify_exercises.py`. Uses keyword-based classification with ~40 movement patterns. Reads from DB, writes results to `classification_results.json`. Current accuracy: 1368/1368 classified (100%), 0 exercises pending. Fixes applied: kickback misclassification (5 tricep kickbacks moved from hip_compound to tricep_isolation), band exercise keywords expanded, shoulder_external_rotation cleaned up (removed hip rotation keywords).

### Required Schema Changes

Schema columns already exist in `exercise_library`. What's needed is data completion, not more migrations:

1. **`movement_type` gap**: Add `mobility` and `helper` values. Currently every row is either `compound` or `isolation`. Exercises like planks, bird-dogs, Pallof presses, glute bridges need `movement_type=helper` (not isolation). This is the single most important data gap for the coach.
2. **`exercise_role` gap**: Add `warmup` role. Also resolve the 16 `isolation_technical` + `compound` cross-assignment inconsistencies.
3. **`joint_stress_flags` completion**: Fill remaining 166 blank rows with known joint stress patterns.
5. **Equipment normalization**: The raw `equipment` field still has 34+ string formats. `primary_equipment` is already normalized (16 categories, "other" eliminated) — either use that or complete the normalization of the raw field.
6. **similar_exercises collapse (Phase 2.2, DEFERRED):** Identify canonical versions of ~64 POV duplicate groups, mark variants `program_worthy=False`. **Intentionally deferred** — see Remaining Gaps note.

### movement_pattern Column (v2 DB only — NOT in working workout.db yet)

`movement_pattern` is a new TEXT column with a CHECK constraint that limits values to a fixed set of ~40 granular movement patterns. It describes what the exercise *does* at the movement level, independent of equipment — this is the key attribute the coach uses for substitution, slot matching, injury filtering, and ordering.

**Why it earns its place:** The coach's four core operations all depend on it:
- **Selection** — match a slot's required movement pattern to available exercises
- **Substitution** — find exercises with the same movement pattern but different equipment
- **Injury filtering** — exclude exercises with conflicting joint_stress_flags for a user's injury
- **Ordering** — sequence exercises by movement pattern to avoid overlapping joint stress

**Pattern taxonomy (40 patterns):**

*Push isolation:* push_flat_isolation (chest fly, pec deck, pullover), push_vertical_isolation (lateral raise, front raise, upright row), push_tricep_isolation (pushdown, skull crusher, tricep extension), push_tricep_compound (close-grip bench, dip)
*Pull isolation:* pull_bicep_isolation (curls — barbell, dumbbell, cable, hammer, preacher, etc.), reverse_curl (overhand grip curls), pull_vertical_compound (pull-up, chin-up, lat pulldown), pull_horizontal_compound (rows — bent over, seated, cable, machine, etc.), pull_vertical_isolation (straight arm pulldown), pull_horizontal_isolation (rear delt fly, face pull), pull_shrug (shrugs)
*Squat/isolation:* squat_compound (back squat, front squat, goblet squat, leg press, etc.), squat_isolation (leg extension), squat_bodyweight (bodyweight squat)
*Hinge/hip:* hinge_compound (deadlift, RDL, good morning, clean, snatch, etc.), hinge_isolation (leg curl, hyperextension), hip_compound (hip thrust, glute bridge, kickback, etc.)
*Push compound:* push_flat_compound (bench press, dumbbell press, cable chest press, etc.), push_incline_compound (incline press, incline dumbbell, etc.), push_decline_compound (decline press, decline dumbbell, etc.), push_vertical_compound (overhead press, military press, Arnold press, Bradford press, thruster, etc.), push_up (push-up, planche, muscle-up, handstand, etc.)
*Core:* core_anti_extension (plank, dead bug, rollout, hollow body, etc.), core_anti_rotation (Pallof press, Russian twist, cable wood chop, etc.), core_flexion (crunch, sit-up, cable crunch, neck harness work, etc.), core_circumduction (hanging leg raise, leg raise, captain's chair, etc.), core_carries (farmer's walk, suitcase carry, bottoms-up, etc.), core_circumduction (hanging leg raise, etc.)
*Mobility/helper:* mobility_hip (hip flexor stretch, pigeon, frog stretch, etc.), mobility_shoulder (shoulder dislocate, chest stretch, doorway stretch, etc.), mobility_spine (cat-cow, child's pose, cobra, spine twist, etc.), mobility_ankle (ankle mobility, calf stretch, runner's stretch, etc.), mobility_wrist (wrist circle, wrist mobility, wrist stretch, etc.), shoulder_external_rotation (external rotation, band rotation, etc.), scapular_retraction (scapular pull-up, prone Y/T/I raise, etc.)
|*Other:* calf_raise (standing calf raise, seated calf raise, leg press calf, etc.), lunge_compound (lunge, split squat, walking lunge, etc.), boxing (boxing combinations), cardio_plio (jump squat, burpee, box jump, jump rope, etc.), Olympic lifting (snatch, clean, jerk — tracked separately), strongman (tire flip, atlas stone, yoke walk, etc.), grip (lever gripper hands, hand grip exercises), hip_abduction_adduction (cable hip adduction, lever hip abduction/adduction, side lying hip adduction, side plank hip adduction)

**The 11 remaining unclassified exercises (in classification_results.json):**
- balance board → mobility_ankle
- barbell lying lifting (on hip) → needs manual review (likely mobility_hip or core)
- cable decline one arm press → push_decline_compound (keyword added but not matching — needs investigation)
- dumbbell incline breeding → push_incline_compound (keyword added but not matching — "breeding" may be a typo for "pressing")
- dumbbell one arm reverse wrist curl → wrist_curl (keyword exists but not matching)
- exercise ball alternating arm ups → push_up
- exercise ball hug → push_up
- exercise ball one leg prone lower body rotation → push_up
- isometric wipers → core_flexion
- swimmer kicks v. 2 (male) → core_flexion

### v2 Database Workflow

The working `workout.db` must not be broken during this process. The workflow is:

1. **Copy**: `workout.db` → `exercise_v2.db` (done: `backend/exercise_v2.db`, 10MB)
2. **Add columns**: `movement_pattern` TEXT with CHECK constraint added to v2
3. **Run classification**: `python3 classify_exercises.py` reads from v2, writes `classification_results.json`
4. **Apply results**: The JSON output maps each exercise to its movement_pattern — these updates get applied to v2
5. **Verify**: Spot-check exercises across patterns, verify compound/isolation alignment, verify mobility/helper identification is correct
6. **Migrate to production**: Once v2 is validated, run the same ALTER TABLE + classification against the Fly.io Postgres `exercise_library` table
7. **Update working DB**: After production migration is confirmed, update the local `workout.db` to match (or replace it with the v2 copy)
8. **Cleanup**: Remove `exercise_v2.db` once migration is confirmed

|- **Files involved:**
- `backend/exercise_v2.db` — working copy (10MB, 1359 rows, has movement_pattern column)
- `backend/classify_exercises.py` — classification script
- `backend/classification_results.json` — classification output (1359 classified, 0 pending)
- `backend/exercisedb_data.json` — read-only ExerciseDB source (1359 exercises, deployed to Fly.io)

### Band Exercise Filtering Rule (for Phase 7 Coach Engine)

**Problem:** Band exercises (69 total, `primary_equipment = 'resistance_band'`) are niche equipment. Most gym users don't have bands, and most gyms don't stock them. The coach should NOT recommend band exercises by default.

**When band exercises ARE appropriate:**
- User's equipment profile includes bands ("bands only," "home gym with bands")
- PT/rehab context (user has injury flags, coach prescribing rehab movements)
- User explicitly requests band work

**When band exercises are NOT appropriate:**
- Default gym user (barbell/dumbbell/machine availability, no bands in profile)
- General programming without specific band context

**Implementation:** Coach's exercise selection logic should check `primary_equipment` against user's equipment profile. If user doesn't have `resistance_band` available, filter band exercises out of the recommendation pool. For warmup contexts, band warmup exercises (pull-aparts, dislocations) also require bands — substitute with bodyweight alternatives if unavailable.

### Remaining Gaps That Could Affect Phase 7

1. **similar_exercises / POV collapse (Phase 2.2, DEFERRED):** All 1368 rows have `similar_exercises` populated. ~64 groups of potential variant duplicates exist. **Intentionally skipped** — the ExerciseDB similarity data isn't well-suited for finding true POV duplicates, and the coach can deduplicate at recommendation time. Revisit if coach spamming variations becomes a real problem.

2. **Equipment toggle system (Phase 2.1, NOT started — new approach):** Instead of program_worthy, we're building an equipment toggle system. 16 categories now exist: bodyweight, dumbbell, barbell, cable, machine, resistance_band, stretching, kettlebell, stability_ball, medicine_ball, plates, rope, cardio, core_abs, hitt_cardio, arms_forearm. "Gym Weights" preset = plates + dumbbells + barbells. Backend endpoint + frontend settings UI needed to let users toggle categories on/off. The coach should filter exercises based on user's enabled equipment categories.

3. **Ghost template cleanup (Phase 2.3, not started):** Empty templates (1, 2, 3, 4, 6, 10) and placeholder exercises with `reps_target=0` still present.

### Output Format Expectations

The model should return its work as:
- A JSON file mapping `name` → `{is_compound: bool, movement_type: str, exercise_role: str, primary_equipment: str, joint_stress_flags: str}` for every row in workout.db that needs changes.
- OR a SQL script that applies updates directly to the `exercise_library` table.

### Key Decision Rules (for is_compound classification)

These are the heuristics the model should use when classifying exercises:

1. **Multi-joint + major muscle group targeting = compound**: Squats, deadlifts, bench press, rows, pull-ups, overhead press always count as compounds even if done with limited equipment (e.g., bodyweight squat is still a compound movement).
2. **Single-joint + isolated muscle = isolation**: Bicep curls, lateral raises, tricep extensions — one joint moves, one primary muscle works.
3. **Functional or stability work that crosses the compound/isolation line**: Exercises like planks, bird-dogs, and Pallof presses are neither pure compounds nor isolations; they should be marked `movement_type=helper` with `is_compound=false` but still be prioritized for core training goals.
4. **Equipment does NOT determine compound/isolation** — a bodyweight squat is still a compound even without barbell, and an assisted machine pushdown would still be isolation despite having equipment.

### What the Coach Does With This Data

The exercise library feeds directly into the progression engine (`model_picker` function) and the coach agent in Phase 7. Without accurate classifications:
- The coach cannot tell you whether to do squats before lateral raises (order/sequencing logic depends on movement_type/is_compound).
- It cannot recommend alternative exercises when your equipment doesn't match (e.g., no barbell → suggest goblet squat instead of back squat using primary_equipment + substitution data).
- It misassigns rep targets by treating compounds like isolations or vice versa.
- Weight increment suggestions lack grounding — compounds need different increment patterns than isolations due to joint stress and fatigue load (systemic_fatigue_load is already populated for all exercises, so the model can use this as an additional signal).

---

## SESSION TARGET FIX — Phase 0 (COMPLETE — 2026-10-14)

**Goal:** Get the session-targets endpoint working so the frontend displays coaching messages for the active workout.

**Status:** COMPLETE and VERIFIED on device.

**What was fixed:**
- [x] Session-targets returning 0 exercises — FIXED (use session.template.exercises)
- [x] 500 — NameError: WorkoutSessionExercise not defined — FIXED
- [x] 500 — ImportError: cannot import WorkoutSessionExercise — FIXED
- [x] 500 — `exercise_entry.library_id` AttributeError — FIXED (`exercise_entry.exercise_library_id`)
- [x] 500 — `exercise.sets_target` AttributeError — FIXED (`exercise_entry.sets_target`)
- [x] 500 — `exercise.name` AttributeError — FIXED (`exercise_entry.name`)
- [x] 500 — `exercise_entry.is_compound` AttributeError — FIXED (`exercise.is_compound` on ExerciseLibrary)
- [x] 500 — `prescription.suggested_weight` AttributeError (dict, not object) — FIXED (bracket access)
- [x] 500 — `prescription.rep_floor` AttributeError — FIXED (bracket access)
- [x] 500 — `prescription.rep_cap` AttributeError — FIXED (bracket access)
- [x] Backend error logging — `/app/logs/session_targets_error.log` on server (full traceback + session_id + user_id)
- [x] Frontend model-agnostic tracking — `source` field on Prescription type (`local` vs `backend`)
- [x] Frontend "Local fallback" badge — amber badge when source=local
- [x] Generic coaching message — "This is the coach notes for Foundation." — VERIFIED on device
- [x] Session targets not finding last session logs — FIXED (use all exercise_entry_ids from exercise_library, commit 06f1e9a)
- [x] Session targets including cancelled sessions — FIXED (filter by ended_at.isnot(None), commit c535123)

**User sees now:** Session Target card shows coaching messages from the backend. Weight and reps from model_picker. Full chain verified: backend endpoint → frontend fetch → prescription update → UI render.

**Remaining from this phase:** Coaching message is generic. Phase 2 will make it model-specific with last-session data.

**Root Cause of Current Issue (Barbell Deadlift showing 45 lbs):**

---

## PHASE 1: Model-Agnostic Frontend (COMPLETE — 2026-10-14)

**Goal:** Frontend renders whatever the model returns. Zero hardcoded model-specific logic in TypeScript.

**Status:** COMPLETE

**What was done:**
- Removed hardcoded Foundation override from `logSet` (lines 950-957 in ActiveWorkoutScreen.tsx)
- Fixed Set 2+ coaching message display — prescriptions now updated when exercise is done (not just when not done)
- Verified no other `foundation`-specific checks in frontend (only legitimate initial values in QuestionnaireScreen and fallback prescription_type)
- Removed ALL local prescription computation from frontend:
  - expandExercise fallback (local computePrescription call)
  - getNextSetTarget fallback (local computePrescription call)
  - logSet fallback (local computePrescription call)
- Fixed race condition between progression fetch and auto-expand (state → ref for autoExpandComplete flag)

**Result:** Frontend is model-agnostic. It uses whatever `prescriptions[exercise.id].coaching_message` contains — from the backend only, no local computation.

---

## PHASE 2: Backend Model Classes (COMPLETE — 2026-10-14)

**Goal:** Create actual model classes in `backend/progression.py` — one per block mode. Each model has a `compute()` method that returns a full prescription. Start with simple "This is the X model." coaching messages to prove the architecture works.

**Why this is next:** The frontend's `rules.ts` has the real progression logic (`doubleRule`, `linearRule`, etc.) and coaching message generation. The backend `model_picker` only returns 5 raw values. We need the models to exist in the backend before `model_picker` can delegate to them, and before `session_targets` can use model-generated coaching messages.

**Approach (per user):**
1. Look at how the linear model works in the frontend's `rules.ts` (`linearRule` function) — this is the reference for what a working model looks like
2. Build a `LinearModel` class in `progression.py` with a `compute()` method
3. Set coaching message to "This is the Linear model." (simple, just to prove it works)
4. Copy to Foundation, Hypertrophy, Strength A, Strength B, Maintenance
5. Verify frontend renders each model correctly by manually selecting each block mode
6. Then add detailed session target / set target logic per model

**What each model's `compute()` returns:**
```python
{
    "suggested_weight": float,
    "rep_floor": int,
    "rep_cap": int,
    "coaching_message": str,  # e.g. "This is the Foundation model."
    "block_name": str,         # e.g. "Foundation Block"
    "should_increase": bool,
    "increment": int,
}
```

**Current `model_picker` returns (for reference):**
```python
{
    "rep_floor": int,
    "rep_cap": int,
    "increment": float,
    "suggested_weight": float,
    "should_increase": bool,
}
```

**Sub-tasks:**

### 2.1: Read the frontend's linearRule as reference
- `frontend/src/rules.ts:445-550` — `linearRule` function
- Shows the full progression logic: weight calculation, hold conditions (form, reps, effort), coaching message generation
- This is the reference for what a complete model compute() looks like

### 2.2: Build LinearModel in progression.py
- Create `LinearModel` class with `compute(exercise, history, block_state, last_session_data=None, previous_set_data=None)` method
- Implement the linear progression logic from `linearRule`
- Return full prescription including `coaching_message: "This is the Linear model."`
- Return `block_name: "Linear Baseline Block"`

### 2.3: Build FoundationModel
- Create `FoundationModel` class
- Foundation-specific logic: rep_floor=8, rep_cap=10, RPE 4-6, no max effort, slow eccentrics
- Start with `coaching_message: "This is the Foundation model."`
- Return `block_name: "Foundation Block"`

### 2.4: Build remaining models (Hypertrophy, Strength A, Strength B, Maintenance)
- Each model gets its own class with block-specific logic
- Start with simple coaching messages: "This is the Hypertrophy model.", etc.
- Return appropriate `block_name` for each

### 2.5: Verify all models render correctly
- Manually set `block_mode` to each value in the database
- Verify frontend displays correct weight, reps, and "This is the X model." coaching message for each
- This proves the frontend correctly calls each model

**Acceptance criteria:**
- [ ] LinearModel, FoundationModel, HypertrophyModel, StrengthAModel, StrengthBModel, MaintenanceModel all exist in `progression.py`
- [ ] Each model has a `compute()` method returning full prescription
- [ ] Each model returns `coaching_message` and `block_name`
- [ ] Coaching messages are model-specific ("This is the X model.")
- [ ] Frontend renders correct weight, reps, and coaching message for each model when manually selected

---

## PHASE 3: Model_Picker Refactor + Session Targets Use Model Prescription (AFTER Phase 2)

**Goal:** `model_picker` becomes a thin selector that delegates to the model classes. `session_targets` endpoint uses the model's prescription (not hardcoded message).

**Current `model_picker`:** Returns 5 raw values. Has its own inline logic for computing `suggested_weight` and `should_increase`.

**Target `model_picker`:** Picks which model to use based on `block_mode`, delegates to that model's `compute()`, returns the model's prescription.

**Sub-tasks:**

### 3.1: Update model_picker to delegate to models
- `model_picker(block_mode, exercise, history, ...)` → picks model class by `block_mode` → calls `model.compute()` → returns model's prescription
- Model_picker no longer computes `suggested_weight` or `should_increase` inline — the models do that

### 3.2: Update session_targets endpoint
- Currently: calls `model_picker`, then hardcodes `f"This is the coach notes for {block_name}."`
- New: calls `model_picker`, uses `prescription["coaching_message"]` and `prescription["block_name"]` from the model
- Endpoint no longer composes its own message

### 3.3: Remove hardcoded coaching message from endpoint
- The endpoint's `block_name_map` and `f"This is the coach notes for {block_name}."` logic is removed
- All model-specific content comes from the models

**Acceptance criteria:**
- [ ] model_picker delegates to model classes
- [ ] session_targets uses model's coaching_message and block_name
- [ ] No hardcoded coaching messages in the endpoint

---

## PHASE 4: Frontend Uses model_picker's Prescription (AFTER Phase 3)

**Goal:** Frontend stops computing prescriptions locally. Uses `model_picker`'s prescription for both session targets and per-set coaching messages.

**Current frontend flow:**
1. Fetch session targets → apply `coaching_message` to `prescriptions` state
2. On set log: call local `computePrescription` (from `rules.ts`) → update `prescriptions` state with local coaching message
3. Display `prescriptions[exercise.id].coaching_message` in card

**Target frontend flow:**
1. Fetch session targets → apply `coaching_message` from backend (already works)
2. On set log: call backend `model_picker` (or use the prescription from session targets update) → update `prescriptions` state with model's coaching message
3. Display `prescriptions[exercise.id].coaching_message` in card (already works — same UI)

**Sub-tasks:**

### 4.1: Replace local computePrescription with model_picker call
- Currently: `logSet` calls local `computePrescription` with `progression_type: "double"`
- New: `logSet` calls backend `model_picker` (or a new endpoint) to get the prescription
- The prescription includes `coaching_message` from the model

### 4.2: Remove local progression logic from frontend (long-term)
- `rules.ts` progression logic (doubleRule, linearRule, etc.) becomes unused
- Frontend only renders what the backend models return

**Acceptance criteria:**
- [ ] Frontend uses model_picker's prescription for per-set coaching messages
- [ ] Coaching messages are model-specific (not generic doubleRule messages)
- [ ] No hardcoded model logic in frontend

---

## PHASE 5: Detailed Per-Model Logic (AFTER Phase 4)

**Goal:** Each model has its own detailed session target and set target logic. Coaching messages reflect the model's philosophy.

**Current state:** Models return "This is the X model." (placeholder)

**What gets added per model:**

### Foundation Model
- Set 1: "In your last [routine] session, for [exercise], you did [weight] lbs × [reps] reps. This Foundation block, we're starting at [suggested_weight] lbs and shooting for 8-10 reps with no max effort (RPE 4-6). Focus on slow eccentrics (3-second lowering phase)."
- Set 2+: "You hit [reps] reps with [effort} effort. [Hold/Increase] weight. Remember: no max effort — stay at RPE 4-6. Focus on core bracing and slow eccentrics."

### Linear Model
- Set 1: "In your last [routine] session, for [exercise], you did [weight] lbs × [reps] reps. This Linear Baseline block, we're starting at [suggested_weight] lbs and shooting for 8-10 reps. Let the reps slide down naturally as weight increases."
- Set 2+: "You hit [reps] reps. [Hold/Increase] weight. Linear progression: add weight each session, let reps find their level."

### Hypertrophy Model
- Set 1: "In your last [routine] session, for [exercise], you did [weight] lbs × [reps] reps. This Hypertrophy block, we're starting at [suggested_weight] lbs and shooting for 10-12 reps. Volume focus — hit the top of the range before adding weight."
- Set 2+: "You hit [reps] reps. [Hold/Increase] weight. Hypertrophy: volume is the goal. Hit 12 reps before increasing."

### Strength A/B, Maintenance Models
- Similar model-specific messages

**Acceptance criteria:**
- [ ] Each model generates detailed coaching messages reflecting its philosophy
- [ ] Set 1 messages include last-session data
- [ ] Set 2+ messages reference the previous set's performance
- [ ] Cross-model weight transitions work (different model → weight adjusted)

---

## PHASE 6: Onboarding Wizard + Block State (NOT STARTED)

**Goal:** Capture user state so the progression engine knows which "lane" to drive.

- Onboarding wizard (Goals, Experience Level, Physical Metrics, Equipment Access, Injury)
- User profile schema (block_state, goals, experience level, equipment)
- Link questionnaire → block state (beginner → Foundation block)
- Block advancement logic (week threshold + Load Meter)

---

## PHASE 7: Block State + Model Rotation Logic (NOT STARTED)

**Goal:** Block state tracks current block. Model_Picker rotates between models based on rotation logic.

- Rotation triggers: Load Meter, Time, Number of Completed workouts, Manual change
- Block cycle: Foundation → Linear Baseline → Hypertrophy → Strength A → Strength B → Maintenance → loop
- Model_Picker uses rotation logic to decide which model to use
- Block state persisted in database

---

## PHASE 8: Coach Engine Polish (NOT STARTED)

**Goal:** Active Coach Logic Layer — intelligent coaching that understands progression models.

- Coach messages for block switches, progression changes
- Mid-block goal changes
- Injury/limitation adjustments
- Rest timer integration by block
- Foundational health integration (sleep, nutrition, mobility)

---

## PHASE 9: Data Sync & Deployment (NOT STARTED)

**Goal:** Get all schema changes, logic updates, and UI releases to production.

- Migrations on production Postgres
- Deploy progression endpoints
- Frontend type updates
- End-to-end testing

---

## Current Focus

**Right now (Phase 5 — Foundation Logic Redesign COMPLETE — LATEST KNOWN GOOD POINT):**
All Phase 5 changes deployed and working. Foundation phase simplified to single 6-week phase with 60% load threshold. Foundation 2 and linear_baseline removed as block modes. Strength Peak/C model added. All models return identical structure with personalized Set 2+ coaching messages. Coach Progression toggle with manual phase selector working. Session targets + auto-expand fixed (UnboundLocalError resolved). Auto-advance now load-gated (6 weeks + 60% load).

**Phase summary:**
1. Phase 0: DONE — session-targets endpoint fixed
2. Phase 1: DONE — frontend made model-agnostic
3. Phase 2: DONE — backend model classes built (Linear, Foundation, Hypertrophy, Strength A/B, Maintenance) with compute() methods
4. Phase 3: DONE — model_picker refactor + session_targets uses model prescriptions (endpoint uses prescription["coaching_message"])
5. Phase 4: COMPLETE — Progression system complete (BlockState phase granularity, transitions, phase advancement, auto-advance, coaching messages)
6. Phase 5: COMPLETE — Foundation logic redesign (phase-agnostic functions, Foundation 2 removed, linear_baseline removed, Strength Peak/C added, all models with personalized Set 2+ messages, coach progression toggle, session targets fix)
7. Phase 6: NOT STARTED — onboarding + block state
8. Phase 7: NOT STARTED — block state + model rotation
9. Phase 8: NOT STARTED — coach polish
10. Phase 9: NOT STARTED — deployment



*Must complete before Phase 3 logic can function.*

- [x] **2.0: Add classification columns to `exercise_library`**
      - [x] Migration: Add `is_compound` boolean, `movement_type` enum (compound/isolation/mobility/helper), `equipment` string (add if missing). *COLUMNS EXIST in DB schema.*
      - [x] Columns added: `is_compound`, `movement_type`, `primary_equipment`, `exercise_role`, `joint_stress_flags`, `systemic_fatigue_load`, `structural_safety_score`.
      - [x] **classify_exercises.py**: **BUILT and re-run with fixes** at `backend/classify_exercises.py`. Keyword-based classifier with 43 movement patterns. Reads exercise_library from DB, classifies each exercise, writes results to `classification_results.json`. Current accuracy: 1359/1359 classified (100%), 0 exercises pending. Fixes applied: kickback misclassification corrected (5 tricep kickbacks moved from hip_compound to tricep_isolation), band exercise keywords expanded, shoulder_external_rotation cleaned up (removed hip rotation keywords, narrowed "band shoulder" to "band shoulder mobility"), cable squatting curl reclassification (compound→isolation), pattern sweep corrections.
      - [x] **movement_pattern column**: NEW granular movement taxonomy column. 43 patterns covering all major movement categories (push/pull/squat/hinge/hip/core/mobility in all their variations). **FULLY POPULATED: 1359/1359 (100%).** Present in both `exercise_v2.db` and `workout.db`. All band exercises classified by movement pattern, not equipment. See `movement_pattern` column below for full details.
      - [x] **movement_type completion**: **COMPLETE.** 545 compound + 153 helper + 661 isolation. Helper category includes mobility (warmup) and structural/prehab work (planks, dead bugs, Pallof press, face pulls, glute bridges). All mobility/helper exercises reclassified out of isolation. Phase 2 fix: cable squatting curl reclassified compound→isolation.
      - [x] **exercise_role completion**: **COMPLETE.** Refinement from 502 main_compound → 31 main_compound. Added `warmup` role (88 exercises for mobility). Expanded `prehab_activation` to 69 exercises. Main compounds reduced by selecting canonical versions per equipment type (barbell, dumbbell, machine, bodyweight) for each movement pattern. Secondary_compound expanded for variations with different emphasis. Accessory absorbed everything else (specialized, machine, band, plyometric, miscategorized). Distribution: 492 accessory / 396 isolation_technical / 31 main_compound / 272 secondary_compound / 11 cool_down / 69 prehab_activation / 88 warmup. Phase 2 fixes: 5 tricep kickbacks (dumbbell) secondary_compound→isolation_technical, 3 calf raises (machine) secondary_compound→isolation_technical. Rear axe kick (id=1339) reclassified accessory→warmup.
|- [DEFERRED] **2.1: Equipment toggle system (replacing program_worthy)** — Design phase. 17 equipment categories exist (bodyweight, dumbbell, barbell, cable, machine, resistance_band, stretching, kettlebell, plates, stability_ball, medicine_ball, rope, cardio, roller, sledge, tire, arms_forearm). "Gym Weights" preset = plates + dumbbells + barbells. Backend endpoint + frontend settings UI needed to let users toggle categories on/off. The coach should filter exercises based on user's enabled equipment categories. This replaces the program_worthy concept which was removed from the DB.
      - [ ] Backend: Add `show_all_exercises` app setting (`default: False`).
      - [ ] Backend: `GET /api/exercise-library` endpoint filters by `program_worthy=True` when false, fetches all when true.
      - [ ] Frontend: Settings toggle to expose hidden exercises (defaults OFF).
- [DEFERRED] **2.2: Collapse POV and duplicate exercises** — Intentionally skipped. The ExerciseDB `similar_exercises` data isn't well-suited for finding true POV duplicates. Revisit if coach spamming variations becomes a problem.

|- [x] **2.3: Ghost template cleanup** — Deleted templates 1, 2, 3, 4, 6, 10. Deleted 5 placeholder exercises (reps_target=0) from templates 7, 8, 9. Template 5 (Chest) deleted (was junk data, 87 empty sessions). Remaining templates: 7 (Back), 8 (Chest), 9 (Planet workout).
- [x] **2.3.1: Remove empty equipment categories** — Removed core_abs (0 exercises) and hitt_cardio (0 exercises) after their exercises were reclassified to actual equipment categories (bodyweight, plates, roller, sledge, tire). 17 categories remain.
- [ ] **2.4: Validate ExerciseEntry overrides**
      - [ ] Migration: Add optional override columns `override_is_compound` or similar if users need to flip an exercise's classification manually in their saved workouts.

---

## PHASE 2.5: Structural Integrity (Foundation Block)

*Solves pre-hab, core bracing, and tendon/ligament conditioning before heavy loading.*
*Auto-assigned to `Total Beginner` or `Returning >6 months off` onboarding states; can be manually selected by anyone (e.g., older lifters, post-injury).*

- [ ] **2.50: Pre-hab / Structural Exercise Classification**
      - [ ] **BLOCKED BY 2.0 completion.** Need `movement_type=helper` and `exercise_role=prehab` (or `warmup`) values in the DB before this can function.
      - [ ] Tag exercises like Planks, Dead Bugs, Bird Dogs, Pallof Press, Glute Bridges, and Face Pulls as `movement_type='helper'` and `exercise_role='prehab'` or `'warmup'`. These are structural prerequisites, not performance lifts. Currently these are all classified as `isolation` — needs correction.
      - [ ] **Partially addressed by movement_pattern classification.** The `classify_exercises.py` script identifies these exercises by their movement_pattern (core_anti_extension for planks/dead bugs/rollouts, scapular_retraction for face pulls, hip_compound for glute bridges, etc.). The movement_pattern column in `exercise_v2.db` already has these classified. What remains is to update the `movement_type` and `exercise_role` columns in the working `workout.db` to reflect these classifications — this is a data application step, not a classification step.
      - [ ] They do NOT track linear progression (they never "level up" by adding weight). Track for **time under tension** (e.g., hold for 60s) or high-rep volume (e.g., 3x15 glute bridges).
- [ ] **2.51: Foundation Block Configuration**
      - [ ] Migration: Add `block_mode = 'foundation'` to user profile schema. Dedicated 6-week block designed to build stabilizer strength, connective tissue resilience, and motor learning *before* rolling into Hypertrophy or Strength blocks.
      - [ ] Backend: Auto-default `block_mode='foundation'` for any user whose experience level is `Total beginner` OR who has been offline / inactive for >6 months. Manually override-able in profile settings.
      - [ ] Frontend: Display a distinct "Foundation Block • Week X/6" pill at the top of workout screen, similar to Hypertrophy or Strength pills, but with muted/subtle styling. Include structural integrity sub-pills ("Pre-hab", "Mobility", "Slow Tempo").
- [ ] **2.52: Foundation Block Rep Targets & Weight Caps**
      - [ ] Backend logic: Compounds during the Foundation block are strictly capped at RPE 4–6 (leaving 3-4 reps in the tank). No absolute failure allowed on heavy lifts. This protects tendons and the central nervous system from premature burnout while still providing mechanical tension for muscle adaptation.
      - [ ] Backend logic: Heavy compounds replaced or modified to safer variants (e.g., Back Squats → Goblet Squats; Barbell RDLs → Kettlebell Deadlifts; OHP → DB Shoulder Press). Ensures form is correct before adding heavy loads.
      - [ ] Backend logic: Hypertrophy / Double Progression applies naturally to accessories and isolations, but with a focus on slow eccentrics (e.g., 3-second lowering phase) to build connective tissue without blowing out the CNS.
- [ ] **2.53: Auto-injection of Pre-hab into Workouts**
      - [ ] Backend logic: The workout generator automatically injects 5–10 minutes of Pre-hab / Core exercises at the very top of Leg/Back/Shoulder days *before* any compound lift over a certain weight threshold (e.g., > bodyweight). Example flow: Planks → Bird-dogs → Glute bridges → Mobility stretching.
      - [ ] Backend logic: If a user reports pain or fails their squat target 2x in a row, the coach auto-injects an unscheduled "Core & Mobility" block into their routine and drops working compound weights by 20% until form recovers.
- [ ] **2.54: Frontend Pre-hab UI / Workflow**
      - [ ] Frontend: Separate "Workout Core / Pre-hab" into its own collapsible card at the top of workout screen (before Squats/Bench/DL). Visually distinct from main compound/ accessory lifts to emphasize it is structural work first. During foundation block, this section becomes mandatory until a baseline level of core endurance is achieved.
      - [ ] Frontend: For Foundation Block users, add coaching banners like "Focus on the 3-second lowering phase." or "Core bracing is your priority today — no max effort yet."

---

## PHASE 7: Active Coach Engine & Structured Coaching UI

*A persistent, intelligent layer that understands your backend progression models, explains intent in plain English, and constantly reinforces foundational health habits (stretching/warmups, sleep, nutrition).*

- [ ] **7.0: Active Coach Logic Layer (`coach_agent` module)**
      - Server logic: A rules-engine / prompt system that sits between the backend progression models and the UI. It has full context of the user's `block_state`, historical performance, injury flags, physical metrics, habit data (sleep/nutrition), and workout notes.
      - Core function: `coach_reason(user_history, current_block_state, exercise_log) -> coaching_message`
      - Generates plain-English "Why" explanations for every major shift (e.g., *"We're moving you from Hype to Strength because you hit 12 reps easily three times in a row. This teaches your nervous system to handle the load."*). Explains *every* deload, lane switch, or plateau intervention before it happens.
- [ ] **7.1: Pre-Workout Stretching & Warmup Mandate Screen**
      - UI/Backend: Before every workout is unlocked, the user MUST complete a dynamic warmup/mobility routine (3–5 specific moves matching their planned lifts). Example: Squat day → leg swings, hip openers. Deadlift day → glute bridges, bird-dogs. OHP day → band pull-aparts, thoracic extensions.
      - Backend logic: `block_state` dictates the warmup focus. Foundation block = extra transverse abdominis bracing + core work. Strength block = heavier mobility (wider range of motion). The app locks the 'Start Workout' button until the routine is logged or manually bypassed once per week.
- [ ] **7.2: Post-Workout Static Cool-down & Habit Nudges**
      - UI/Backend: A built-in 5-minute static stretching flow at the end of every workout to prevent DOMS and flush joints for recovery. App suggests specific stretches based on that day's primary lifts (e.g., Chest + back = cat-cow and doorway chest stretch; Legs = hamstring & quad stretches).
      - Habit tracking: Optional checkboxes log Sleep quality, Protein intake, Water consumption post-workout. Coach nudges on missing pieces (e.g., *"You slept 5 hours last night — dropping your bench weight by 10% today to play it safe."*).
- [ ] **7.3: Mid-Plateau / Real-Time Block Adjustments & Failure Nudges**
      - Server logic: The coach actively monitors rep data and auto-intervenes before they injure themselves or quit. If a user fails their target reps twice in a row, the message reads: *"You missed both sets today. I'm lowering this weight by 5lbs next session so we can climb safely again."*
      - Logic also monitors RIR (Reps In Reserve) and subjective fatigue scores. If they report joint pain, the coach auto-injects an unscheduled deload or drops core/bench weights by 20%.
- [ ] **7.4: Structured Coaching UI / Feedback Screens**
      - UI: Dedicated "Coach Notes" or "Weekly Debrief" screen where user reviews why decisions were made (block switches, weight drops, plateau warnings). Includes plain-English history: *"You hit Hype goals! Next up is Strength Block."*
      - UI: In-workout floating tips (optional popups) reminding about form cues and warmup importance. E.g., *"Don't forget to breathe and engage your core before you stand up with that weight."*
- [ ] **7.5: Foundational Health Integration (Sleep / Nutrition / Mobility Dashboard)**
      - UI/Backend: Persistent habit dashboard where users track Sleep (hours), Nutrition (protein/water intake), and Stretching (pre-workout routine completion rate). 
      - Coach logic cross-references these habits with workout performance. E.g., *"Your squat reps dropped 20% this week because sleep was <6hrs. Let's reset your bench weight until you recover."*

---

## PHASE 3: Onboarding & Profile Engine

*Captures user state so the progression engine knows which "lane" to drive.*

- [ ] **3.1: Onboarding Checklist / Wizard**
      - [ ] UI: Build "Select Primary Goals" (`Strength`, `Hypertrophy`, `Maintenance`). User can check all 3 (triggers Hybrid/DUP routing) or pick only one.
      - [ ] UI: Build "Experience Level" selector (`Total Beginner`, `Returning`, `Intermediate`, `Powerlifter`). Maps directly to the starting block model based on experience. Total Beginners are auto-locked into Foundation Block → Linear(1x) → Hype/Strength. Intermediate/Advanced lifters skip Foundation and enter Hypertrophy directly from their first session.
      - [ ] UI: Build "Physical Metrics" (`Weight`, `Height`, `Gender`). Used immediately by client/server baseline calculator.
      - [ ] UI: Build "Equipment Access" (`Full Gym`, `Dumbbells Only`, `Bodyweight/Bands`). Filters exercise library on first workout generation.
      - [ ] UI: Build "Injury History / Limitations" (Optional). Flags bad knees/shoulders to swap heavy lifts for machines/mobility in the first session.
- [ ] **3.2: User Profile & Goal Tracking Schema**
      - [ ] Migration: Add `user_profile` table or extend existing user table with `current_block_start_date`, `primary_focus_mode` (Strength/Hype/Maint), `experience_level`.
      - [ ] Backend: Endpoint `/api/progression/settings` to save the user's goal toggles and block durations.

---

## PHASE 4: Progression Model Engine & Block Logic — SINGLE MODEL, DYNAMIC REP TARGETS

*The core math that decides what weight to hand each user on every workout day.*
*ARCHITECTURE DECISION: There is only ONE progression model in this entire codebase — Double Progression. Rep targets are dictated entirely by the active `block_state` (block mode), not by compound vs isolation lifts. Linear Progression is retired as separate logic; it becomes just a rep-target shift inside Double Progression.*

- [ ] **4.1: Model Picker Function (`model_picker`)**
      - [ ] Server logic: `def model_picker(exercise, history, block_state)` → returns `(target_reps_floor, target_reps_cap, increment_rule)`.
      - [ ] All blocks use the EXACT same Double Progression logic path: Find the floor (e.g. 8 reps), climb to the cap (e.g. 12 reps), hit both? Add weight, reset rep-floor/cap, repeat.
      - [ ] Rep Floor & Cap are determined strictly by `block_state`:
         - Foundation Block (`block_mode = 'foundation'`): Target 8–10 reps per set. Slow eccentrics, no max effort. Weight only added when hitting ceiling of 10 reps consistently.
         - Linear Baseline Block (total beginners only, *one time only*): Target 8–10 reps on Day 1. Let rep count naturally slide down to 6-8 as weights get heavier. The moment it stalls at 6-8 reps, the Linear block ends and auto-switches to Double Progression for Hype/Strength blocks.
         - Hypertrophy Block (`block_mode = 'hypertrophy'): Target 10–12 reps per set. Hit 12 → add weight +3-5lbs.
         - Strength Block — Phase A (Weeks 1–2 of block): Target 8–10 reps per set. Double Progression from a heavier starting point than Hype blocks ever reached.
         - Str Block — Phase B (Weeks 3–4 of block): Target 6–8 reps per set. Weight has climbed naturally, so the rep target drops to give CNS time to catch up while tension increases.
         - Strength Block — Peak Phase (Final stretch before deload/switch): Target 4–6 reps per set. Double Progression hits maximum mechanical tension before entering Deload phase. Hits both floor and cap triggers auto-deload prompt.
         - Maintenance / Deload Block (`block_mode = 'maintenance'`): Rep targets loosen to 10–12 reps. Strictly capped at RPE 5. No max effort. Loads dropped by ~20% automatically. Reps used for structural flushing, not size or strength gains.
      - [ ] Compound vs Isolation distinction is NO LONGER A PROGRESSION DECIDER — ALL lifts use Double Progression. The only thing that changes is whether the rep target is 4-6 (Peak Strength) or 8-12 (Hypertrophy/Foundation). No more `is_compound` check inside `model_picker`. (Note: Lateral raises still physically cap their weight increments at ~10 due to joint limits, but progression logic itself never changes mode; it just hits weight caps faster).
- [ ] **4.2: Block Periodization Orchestrator**
      - [ ] Server logic / Scheduler: Track the current block and its duration (default: 6 weeks per phase, configurable by user).
      - [ ] Logic: When a block expires (e.g., 6 weeks of Hypertrophy passed or 4 weeks of Strength finished), prompt the user to start the next block in the cycle.
      - [ ] **Full Block Cycle Sequence** (How lanes flow permanently for every user):
         1. Foundation Block (6 weeks) → *Only Total Beginners. All others skip.*
         2. Linear Baseline Block (2–3 weeks) → *Total beginners only, one shot ONLY. Rep targets slide from 8-10 down to 6-8. When stall hits at 6-8, auto-switches to Hypertrophy DP.*
         3. Hypertrophy Block (DP, 10-12 reps target) → *6 weeks. Size and capillary density focus.*
         4. Strength Block — Phase A (DP, 8-10 reps target) → *2 weeks. Mechanical tension climbs while rep floor slides down slowly.*
         5. Strength Block — Phase B (DP, 6-8 reps target) → *2 Weeks. Heavier now. CNS flushes microtrauma from high mechanical loads.*
         6. Deload / Maintenance Block (~20% load cut, ~10-12 rep target RPE 5) → *1–2 weeks.*
      - [ ] After completing Deload/Maintenance, cycle loops back to Step 3 (Hypertrophy). The block sequence repeats indefinitely: Hype → Str PhA → Str PhB → Maint → Hype... repeating. Total Beginners who haven't finished Linear(1x) go straight from Foundation into Linear(1x), then enter Hype/Strength normally for subsequent loops.
      - [ ] If user selected only ONE goal, lock that lane permanently and auto-adjust volume instead of block cycling. (e.g., someone picking "Hypertrophy" stays on `hypertrophy` DP with 10-12 reps forever, only dropping into Deload/ Maint every 6 weeks to flush CNS fatigue.)
      - [ ] If user selected ALL THREE goals, use Daily Undulating Periodization (DUP) logic where block state slides based on weekly cadence. Mon: Hype DP | Wed: Str DP | Fri: Maint. But never random day-to-day lane swaps. The entire lane rotates as one unit across ALL workouts every single week.
- [ ] **4.3: Plateau / Deload Signal Detection**
      - [ ] Server logic: Track signals to suggest weight drops or lane changes.
         - Signal 1: `missed_reps_count >= 2` at the same weight/rep target for consecutive sessions.
         - Signal 2: `volume_flatline_since_days >= 21` (same total sets/weight over a month).
         - Signal 3: Auto-reported RIR or fatigue score indicating overcoaching or joint irritation.
      - [ ] Actions on signal triggered: Prompt user with deload suggestion (`-20% load for the next week to flush joints`) OR lane switch if hitting rep floors consistently (e.g., "Hit 12 reps easily across all sets this week → switch Hypertrophy block into Phase A of Strength").

---

## PHASE 5: Frontend UI & User Experience

*Exposing the backend logic cleanly via screens and dashboards.*

- [ ] **5.1: Onboarding Flow Screens**
      - [ ] Build multi-step wizard exactly matching Phase 3 specs (Goals, Experience Level, Physical Metrics, Equipment Access, Injury). Save all states to new schema / user config table.
- [ ] **5.2: Dashboard UI (Workout View)**
      - [ ] Top Pill: Display active Block Status (`Hypertrophy Block • Week X/6`) based *only* on the block_state pill sent from `block_periodization_orchestrator`. Update dynamically as the week rolls over or a block ends.
      - [ ] Exercise Cards: Show progression indicator using Single Double Progression logic (always rep-floor-climbing). Pill examples: "Hype: Target 10 → 12 reps", "Str PhA: Target 8 → 10 reps", "Maint → ~10 reps RPE5".
      - [ ] Deload UI: When in Maintenance/Deload mode, show greyed-out or lowered default weights with prominent form notes ("Touch & go today — no max effort."). Rep target shows as `~10-12` and instructs focus on slow eccentrics/rep-flushing instead of heavy loads.
- [ ] **5.3: Settings / Profile Screen**
      - [ ] Display all profile settings (Goals, Experience Level, Physical Metrics). Allow user to toggle primary goals off/on for Block Periodization or Hybrid lane routing.
- [ ] **5.4: Progression Charts & History Review**
      - [ ] Exercise history view must visually track Double-P Prog plateaus/step-ups on a rep-weight graph instead of linear growth trends.

---

## PHASE 6: Data Sync & Deployment

*Getting all the schema changes, logic updates, and UI releases out to the Mac.*

- [ ] **6.1: Linux DB Schema Migration**
      - [ ] Run new migrations on `workout.db` (add `user_profile` table). Classification columns already exist — no schema migration needed for Phase 2 fields. Apply Phase 2 classification completion via rebuilt `classify_exercises.py`.
- [ ] **6.2: Mac DB Sync**
      - [ ] Rsync Linux `workout.db` to local Mac instance post-migration. Ensure local `workout.db` picks up new columns and user config tables immediately.
- [ ] **6.3: Frontend Type Generation / TS Updates**
      - [ ] Regenerate types (in `frontend/src/types.ts`) for new `user_profile` objects and Single-DP model outputs. `exercise_library` types need updating to reflect actual current field values (movement_type now has compound/isolation; needs mobility/helper added).
- [ ] **6.4: Deployment & Validation**
      - [ ] Deploy API endpoints (`GET /api/progression/settings`, etc.).
      - [ ] Run test user flows: Confirm Single DP logic correctly routes rep targets based on block_state pills (Hype → 10-12, Str PhA → 8-10, Maint → ~10 reps RPE5). Confirm lateral raises naturally cap weight increments faster due to joint limits in the 6–10 rep range. Confirm Deload loads apply -20% across all lifts correctly.

---

# Summary of User Journeys

1. **New / Total beginner User Onboard**: Fills out goals, physical metrics, injury history → Server saves profile. Auto-locked into Foundation block (4–6 wks) → Linear(1x Baseline Estab)(2–3wks) → Hypertrophy DP(10-12 reps/6wks). First workout starts with conservative estimates based on Phase rules. `model_picker` returns Double Progression rep targets from Day 1 (but rep floor caps are low for the first block only).
2. **Intermediate / Strength-focused User**: Skips Foundation → Enters Hypertrophy DP immediately. Toggles "Str" as a goal → Dashboard updates pill to `Strength Block • Phase A/6`. Reps slide naturally down toward 4-6 by final phase. Isolations follow Double Progression the entire time.
3. **Hypertrophy / Deload User**: Enters Maintenance/deload phase → Dashboard switches pills to `Deload/Maint • Week X/2`. Loads drop automatically (`* 0.8 multiplier`). Rep targets loosen (focus purely on slow eccentrics, structural flushing, and joint health instead of raw size or force).

Task count: ~34 discrete sub-tasks mapping directly to Phases 2–6. Ready for dev queue population.

**Current Status (Updated 2026-10-17)**

**Exercise library**: COMPLETE (1359 exercises, 32 columns, fully classified)

**Session-target fix (Phase 0)**: COMPLETE — endpoint working, verified on device. Additional fixes: session targets now queries ALL completed sessions' logs (like calculate does), filters out cancelled sessions. Session target now includes last session recap (date, weight, reps, effort, notes) + today's target + "why" (compares today's weight/reps to last session).

**Phase 1 (Model-Agnostic Frontend)**: COMPLETE — all local prescription computation removed, frontend relies entirely on backend session targets. Race condition between progression fetch and auto-expand fixed (state → ref).

**Phase 2 (Backend Model Classes)**: COMPLETE — 6 model classes built (Linear, Foundation, Hypertrophy, Strength A/B, Maintenance) with compute() methods.

**Phase 3 (Model_Picker Refactor)**: COMPLETE — model_picker delegates to models, session_targets uses model prescriptions.

**Phase 4 (Progression System — COMPLETED 2026-10-17)**: COMPLETE
- BlockState phase granularity: Integer → String (foundation_1, foundation_2, hypertrophy, strength_a, strength_b, strength_peak, deload)
- Transition function: resolve_model_transition with 8 rules + PHASE_TRANSITION_MULTIPLIERS
- Phase advancement triggers: PHASE_ADVANCE_TRIGGERS (min_weeks per phase), can_advance_phase, get_next_phase
- Auto-advance wired into calculate endpoint (silently advances when week threshold met, resets week to 1, applies transition)
- All 6 models handle phase parameter (FoundationModel phase distinction: foundation_1 = Double 8-10 reps, foundation_2 = Linear 6-8 reps)
- Coaching messages: production-ready for all phases (friendly/inclusive language, "isn't about going heavy" framing)
- Session target: includes last session recap (date, weight, reps, effort, notes) + today's target + "why"
- FOUNDATION pill: on PreWorkoutScreen (Ready screen) showing phase context with coaching message
- Probe fix: /healthz used for API base detection instead of /settings/api_base

**Block state**: COMPLETE — BlockState table with phase (string), week_number, block_mode. Phase sequence: foundation_1 → foundation_2 → hypertrophy → strength_a → strength_b → strength_peak → deload → loop.

**model_picker**: EXISTS (`backend/progression.py`) — returns full prescription including coaching_message, block_name, next_reps. Phase 3 COMPLETE.

**Progression endpoints:**
- `POST /api/progression/calculate` — COMPLETE — uses model_picker, auto-advances when week threshold met, applies transition
- `POST /api/coach/session-targets` — COMPLETE — returns coaching messages using model_picker, session_target field with last session recap + why
- `GET /api/progression/block-state` — COMPLETE — returns current block_state (phase, week_number, block_mode)
- `PATCH /api/progression/block-state/advance` — COMPLETE — advances to next phase with optional new_phase and advance_block flag

**Frontend progression UI:**
- Block pill: COMPLETE — FOUNDATION pill on Ready screen (PreWorkoutScreen) showing block_mode, week_number, coaching_message
- Rep target display: COMPLETE — shows rep floor/rep cap on exercise cards
- Progression indicator: COMPLETE — "Ready to progress" badge when should_increase=true
- Session target coaching messages: COMPLETE — backend returning messages, frontend applies them. All local computation removed.
- Session target with last session recap: COMPLETE — shows last session date, exercise, weight, reps, effort, notes + today's target + why
- Per-set prescription update: COMPLETE — logSet calls calculate endpoint after each set
- Model indicator in coach notes header: COMPLETE — FOUNDATION pill on Ready screen

**Option B — Coach Summary Rebuild:**
- Replaced compute_prescription with model_picker calls in coach_chat endpoint
- Created new session-targets endpoint using model_picker
- Frontend fetches session targets after initial prescription computation
- Fallback prescription computation removed (workout now waits for backend data)
- Local prescription computation removed from expandExercise, getNextSetTarget, and logSet
- Race condition fixed: progression fetch no longer overwrites draftWeight after auto-expand
- Multiple backend bugs fixed in session-targets endpoint
- Latest fix: session-targets uses session.template.exercises (returns exercises even with no sets logged)
- **Current state**: Endpoint working, model-specific coaching messages shown. Session target includes last session recap + why.

**End-to-end testing**: PENDING — user testing from Xcode after probe fix deployed

**API base probe fix**: COMPLETE — probe() now uses /healthz (public endpoint) instead of /settings/api_base (requires auth). This was causing the API base to fall back to https://askeo.fit/api instead of https://smartlift-api.fly.dev/api.

---

## PROGRESSION SYSTEM — ALL PHASES COMPLETE (2026-11-01)

*Full progression system with named phases, transitions, triggers, auto-advance (load-gated), coaching messages, and session targets.*

### What Was Built

**1. BlockState Phase Granularity (Integer → String)**
- Phase column changed from Integer (1-6) to String with explicit phase names
- 6 phases: `foundation_1`, `hypertrophy`, `strength_a`, `strength_b`, `strength_peak`, `deload`
- Phase sequence loop: foundation_1 → hypertrophy → strength_a → strength_b → strength_peak → deload → foundation_1
- foundation_2 removed (single foundation phase only)
- linear_baseline removed as block mode (Strength A/B/C implement linear progression)

**2. Transition Function (resolve_model_transition)**
- Transition rules with weight multipliers:
  1. foundation_1 → hypertrophy: -10% (Double → Double, rep range shift)
  2. hypertrophy → strength_a: +5%
  3. strength_a → strength_b: +5%
  4. strength_b → strength_peak: +5%
  5. strength_peak → deload: -20%
  6. deload → hypertrophy: +5%
  7. Any → foundation_1 (re-entry after long break): -15%
- `PHASE_TRANSITION_MULTIPLIERS` dict in progression.py
- foundation_1 → foundation_2 transition removed (foundation_2 no longer exists)

**3. Phase Advancement Triggers**
- `PHASE_ADVANCEMENT_THRESHOLDS`: min_weeks per phase (foundation_1=6, hypertrophy=4, strength_a=3, strength_b=2, strength_peak=1, deload=1)
- Load-gated: foundation requires 60% load (21-day consistency window via compute_load)
- `can_advance_phase(week_number, phase)` — checks if week >= min_weeks
- `get_next_phase(current_phase)` — returns next phase in sequence
- `get_block_mode_for_phase(phase)` — maps phase to block_mode

**4. Auto-Advance in Calculate Endpoint**
- When `week_number >= min_weeks` for current phase AND load >= threshold for foundation, auto-advance to next phase
- Reset week_number to 1
- Update block_mode via get_block_mode_for_phase
- Apply transition (weight adjustment) if phase changed
- Coach Progression toggle: when "false", skip auto-advance entirely

**5. Model Phase Handling**
- All 6 model compute methods accept optional `phase: str | None = None` parameter
- FoundationModel phase distinction: foundation_1 only (Double 8-10 reps, RPE 4-6)
- Other models accept phase but don't use it yet (reserve for future phase-specific behavior)

**6. Coaching Messages (Production-Ready)**
- All 6 models have detailed coaching messages with friendly/inclusive language ("we", "us")
- Foundation 1: "Foundation phase — building movement quality and connective tissue strength. Use double progression: work within 8-10 reps... This isn't about going heavy — it's about form, control, and getting familiar and comfortable with the weight, as well as getting comfortable with using the app."
- Foundation 2: REMOVED (no longer exists)
- Hypertrophy, Strength A, Strength B, Strength Peak/C, Maintenance: Model-specific messages with personalized Set 2+ coaching based on reps/effort/weight
- Re-entry message (Any → foundation_1): "Re-entering the foundation block after time away. Weight has been reduced by 15%..."

**7. Session Target with Last Session Recap**
- `session_target` field added to SessionTargetResponse
- Includes: last session date, exercise name, weight, reps, effort, notes + today's target + "why" (compares today's weight/reps to last session)
- "Why" logic: if same weight/reps → "continuing at same weight/reps to solidify movement"; if more reps → "more reps at same weight to solidify the movement"; if increasing weight → "increasing weight because you hit the top of the rep range last time"

**8. FOUNDATION Pill (Ready Screen)**
- Added to PreWorkoutScreen (Ready screen), NOT ActiveWorkoutScreen (too busy)
- Shows: block_mode (e.g., "Foundation"), week number, full coaching message
- PHASE_COACHING mapping for all 6 phases
- Fetches block-state via getBlockState()

**9. API Base Probe Fix**
- probe() function was using /settings/api_base (requires auth) → 401 → fallback to wrong API base
- Fixed: probe() now uses /healthz (public endpoint) → correct API base detection

**10. Session Targets Fix (UnboundLocalError — 2026-11-01)**
- **Bug:** `from datetime import timezone` at line 4192 inside `_do_session_targets` function shadowed the global import at line 9
- **Effect:** Python treated `timezone` as a local variable for the entire function. Line 4139 uses `timezone.utc` before the local import executes → `UnboundLocalError`
- **Fix:** Removed the redundant local import. Session targets + auto-expand now working.

### Files Changed

- `backend/models.py` — BlockState.phase: Integer → String
- `backend/main.py` — Pydantic schemas, calculate endpoint auto-advance + transition wiring, advance_block_state block_mode fix, _run_migrations() phase + set_logs.block_mode ALTER COLUMN, session_target building logic, previous_phase_for_transition, coach_progression toggle check, long-gap detection (>6 months → foundation), re-entry coaching message for Set 1, session targets fix (remove local timezone import)
- `backend/progression.py` — resolve_model_transition (transition rules), PHASE_SEQUENCE (foundation_2 removed), PHASE_ADVANCEMENT_THRESHOLDS (foundation_2 removed, foundation_1=6 weeks, strength_a=3 weeks, strength_peak=1 week), can_advance_phase, get_next_phase, get_block_mode_for_phase, FoundationModel phase distinction (foundation_2 removed), all 6 model compute methods with phase param, coaching messages for all models, personalized Set 2+ messages for Hypertrophy/Strength A/B/C, StrengthCModel class, linear_baseline removal from all dicts/sequences/mappings
- `backend/rules.py` — compute_load function (0-100 score, 21-day window) for auto-advance load check
- `frontend/src/pages/PreWorkoutScreen.tsx` — FOUNDATION pill with PHASE_COACHING mapping, block-state fetch
- `frontend/src/pages/ActiveWorkoutScreen.tsx` — session_target display (FOUNDATION pill removed from active screen)
- `frontend/src/pages/SortableExerciseCard.tsx` — session_target display in Session Target pill
- `frontend/src/pages/SettingsScreen.tsx` — Coach Progression toggle description updated, phase selector UI added (dropdown + Set Phase button, shown when coach_progression is "false"), currentPhase/savingPhase state, useEffect to load current phase
- `frontend/src/api.ts` — probe() uses /healthz, getBlockState function, patchBlockState method
- `frontend/src/rules.ts` — Prescription interface added session_target field

### Phase Sequence & Triggers

| Phase | Min Weeks | Load Threshold | Block Mode | Rep Range | Notes |
|-------|-----------|----------------|------------|-----------|-------|
| foundation_1 | 6 | 60% | foundation | 8-10 (Double) | RPE 4-6, no max effort |
| hypertrophy | 4 | — | hypertrophy | 10-12 (Double) | Volume focus |
| strength_a | 3 | — | strength_a | 8-10 (Linear) | Heavier starting point |
| strength_b | 2 | — | strength_b | 6-8 (Linear) | CNS adaptation |
| strength_peak | 1 | — | strength_b | 3-5 (Linear) | Peak mechanical tension, 120s rest, "hard" workload |
| deload | 1 | — | foundation | 8-10 (Double) | -20% weight, RPE 5 cap |

### Transition Multipliers

| From | To | Multiplier |
|------|----|------------|
| foundation_1 | hypertrophy | -10% |
| hypertrophy | strength_a | +5% |
| strength_a | strength_b | +5% |
| strength_b | strength_peak | +5% |
| strength_peak | deload | -20% |
| deload | hypertrophy | +5% |
| Any | foundation_1 | -15% |

### Remaining Work

- End-to-end testing from Xcode (user testing)
- Any tuning the user wants after testing (multipliers, messages, triggers)

### Current Status (2026-11-01)

**Exercise library**: COMPLETE (1384 exercises, 15 columns, fully classified)

**Session-target fix (Phase 0)**: COMPLETE — endpoint working, verified on device. Additional fixes: session targets now queries ALL completed sessions' logs (like calculate does), filters out cancelled sessions. Session target now includes last session recap (date, weight, reps, effort, notes) + today's target + "why" (compares today's weight/reps to last session). Session targets fix (UnboundLocalError): removed local `from datetime import timezone` that shadowed global import.

**Phase 1 (Model-Agnostic Frontend)**: COMPLETE — all local prescription computation removed, frontend relies entirely on backend session targets. Race condition between progression fetch and auto-expand fixed (state → ref).

**Phase 2 (Backend Model Classes)**: COMPLETE — 6 model classes built (Linear, Foundation, Hypertrophy, Strength A/B, Maintenance) with compute() methods. StrengthCModel added (3-5 reps, 1 week, linear progression, 120s rest, "hard" workload).

**Phase 3 (Model_Picker Refactor)**: COMPLETE — model_picker delegates to models, session_targets uses model prescriptions.

**Phase 4 (Progression System — COMPLETED 2026-10-17)**: COMPLETE

**Phase 5 (Foundation Logic Redesign — COMPLETED 2026-11-01)**: COMPLETE — LATEST KNOWN GOOD POINT
- Foundation phase simplified to single 6-week phase with 60% load threshold
- Foundation 2 removed (single foundation phase only, Foundation 1 → Hypertrophy directly)
- Linear baseline removed as block mode (Strength A/B/C implement linear progression)
- Strength Peak/C model added (3-5 reps, 1 week, linear progression, 120s rest, "hard" workload)
- All models return identical structure with personalized Set 2+ coaching messages
- Coach Progression toggle + manual phase selector added (ON=auto-advance with weeks+load, OFF=manual phase selector)
- Auto-advance now load-gated (6 weeks + 60% load, not just time)
- Session targets fix: removed local `from datetime import timezone` causing UnboundLocalError

**Block state**: COMPLETE — BlockState table with phase (string), week_number, block_mode. Phase sequence: foundation_1 → hypertrophy → strength_a → strength_b → strength_peak → deload → loop.

**model_picker**: EXISTS (`backend/progression.py`) — returns full prescription including coaching_message, block_name, next_reps. Phase 3 COMPLETE.

**Progression endpoints:**
- `POST /api/progression/calculate` — COMPLETE — uses model_picker, auto-advances when week threshold + load met, applies transition
- `POST /api/coach/session-targets` — COMPLETE — returns coaching messages using model_picker, session_target field with last session recap + why. FIXED: UnboundLocalError resolved.
- `GET /api/progression/block-state` — COMPLETE — returns current block_state (phase, week_number, block_mode)
- `PATCH /api/progression/block-state/advance` — COMPLETE — advances to next phase with optional new_phase and advance_block flag

**Frontend progression UI:**
- Block pill: COMPLETE — FOUNDATION pill on Ready screen (PreWorkoutScreen) showing block_mode, week_number, coaching_message
- Rep target display: COMPLETE — shows rep floor/rep cap on exercise cards
- Progression indicator: COMPLETE — "Ready to progress" badge when should_increase=true
- Session target coaching messages: COMPLETE — backend returning messages, frontend applies them. All local computation removed.
- Session target with last session recap: COMPLETE — shows last session date, exercise, weight, reps, effort, notes + today's target + why
- Per-set prescription update: COMPLETE — logSet calls calculate endpoint after each set
- Model indicator in coach notes header: COMPLETE — FOUNDATION pill on Ready screen
- Coach Progression toggle + phase selector: COMPLETE — toggle in SettingsScreen, phase selector shown when coach_progression is "false"

**End-to-end testing**: PENDING — user testing from Xcode after session targets fix deployed

**API base probe fix**: COMPLETE — probe() now uses /healthz (public endpoint) instead of /settings/api_base (requires auth). This was causing the API base to fall back to https://askeo.fit/api instead of https://smartlift-api.fly.dev/api.

---

## Foundation Phase Logic Redesign (2026-10-29 — COMPLETE — LATEST KNOWN GOOD POINT)

### Context
After Phase 4 deployment, user tested Chest & Triceps workout (2026-10-21) and found 6 bugs with session targets and coaching messages. Investigation revealed Foundation phase needs more sophisticated logic than Phase 4 provided. All issues related to session target/Set 2+ messaging have been fixed and deployed.

### 6 Bugs Found

1. **Re-entry message leaks to Set 2** — FIXED (commit ea25108, deployed)
2. **Foundation 15% reduction not visible** — CONFIRMED CORRECT (reduction applied)
3. **Stay/increase/decrease branching missing** — IMPLEMENTED via weighted average logic
4. **Incline at 6 reps (below Foundation range)** — NOT INVESTIGATED
5. **"Cannot save changes when editing set"** — NOT ADDRESSED (frontend)
6. **"Need to find arsenal strength fly machine"** — NOT ADDRESSED (exercise lookup)

### Design Requirements

#### Session Target (Set 1) — Generic Across All Phases

- Same template for all phases, values from progression logic
- "Last time we did [exercise] on [date] — [full set breakdown]. Today, we're [continuing/increasing/decreasing] to [weight] lbs for [reps] reps. [why]"
- coaching_message is phase-specific from model
- Uses ALL sets from last session (not just most recent)
- Weighted average logic for next session weight
- Reps always 10 for Foundation

#### Set Target (Set 2+) — Generic Across All Phases

- Same structure for all phases, values from progression logic
- "Last set: [weight] lbs × [reps] reps [effort]. [Hold/Increase] to [next_weight] lbs. Target: [rep_cap] reps."
- Stays at same weight mid-session (no weight increase between sets)
- Phase context comes from Set 1 coaching_message, not Set 2+
- Target shows rep_cap (10) as the goal to progress

#### Foundation-Specific Logic (COMPLETE)

1. **Double progression within session:** Users self-progress weight between sets (Set 1: 135, Set 2: 140, Set 3: 145). Handle via weighted average of all weights used.

2. **Effort-weighted average for next session weight:**
   - Formula: `factor = 1 / (abs(effort - target_effort) + 1)`
   - Only count sets that hit target reps
   - Weights with effort closer to target_effort (6 for Foundation) count more
   - Round to nearest 5

3. **Rep gate:**
   - All sets hit target reps → increase next session
   - Any set misses target → stay (or drop to weighted avg of successful sets)

4. **Starting weight for next session:**
   - Normal session (same weight all sets): weighted_avg + increment
   - Self-progression session: weighted_avg of all weights used
   - If missed target: weighted_avg of successful sets only

5. **Effort context in messaging:**
   - Set 1 effort 8-10 → flag as potentially too heavy, suggest drop
   - Set 1 effort 4-7 → "right in the zone"
   - Set 1 effort 1-3 → "felt light", suggest increase
   - Later sets: effort increase is normal (fatigue), don't flag

6. **Phase goal messaging:**
   - "The goal of this phase is to hit 10 reps on ALL sets at the SAME weight, with effort ~6 on the first set. Once you can do that, move up 5 lbs."

7. **Self-progression reminder:**
   - "In double progression, we keep the same weight for all sets. You worked up to 145 lbs this session — next session, let's start at [weighted_avg] for all sets and build consistency there before moving up."

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
- [x] Update frontend session_target formatting (whitespace-pre-wrap)
- [x] Update set target message to show rep_cap (10) instead of rep_floor-rep_cap (8-10)
- [x] Test with user — verified working

### Design Decisions

1. **Rep-based progression gate** — hit target on all sets → increase. Effort is context, not gate.
2. **Effort-weighted average for starting weight** — weights closer to target_effort count more.
3. **Only count successful sets in avg** — sets that missed target reps don't count.
4. **Phase-agnostic logic, phase-specific params** — same functions work for all phases.
5. **Session target: generic structure + phase-specific coaching_message** — Set 1 has both.
6. **Set 2+ message: generic structure, no phase-specific coaching_message** — phase context from Set 1.
7. **Self-progression handling** — weighted avg of all weights used, rounded to nearest 5.
8. **Target displays rep_cap (10) not rep_floor-rep_cap (8-10)** — 10 is the goal to progress.
9. **Frontend decoupled from phase logic** — passes `is_set_target: true`, displays backend response. Works with "flip of a switch" between models.

### Message Examples

#### Session Target (Foundation) — All Sets Hit Target

"Last time we did Barbell Bench Press on Oct 21, you completed 4 sets:
- 135 lbs × 10 reps E-7
- 135 lbs × 10 reps E-8
- 135 lbs × 10 reps E-8
- 135 lbs × 10 reps E-9

Today, we're increasing to 140 lbs for 10 reps. You hit 10 reps on all sets — you're progressing.

The goal of Foundation is to hit 10 reps on ALL sets at the SAME weight, with effort ~6 on the first set. You hit 10 on all sets at 135 lbs — let's increase to 140 and build consistency there before moving up again."

#### Session Target (Foundation) — Self-Progression, Some Sets Missed

"Last time we did Barbell Bench Press on Oct 21:
- Set 1: 135 lbs × 10 reps E-6
- Set 2: 140 lbs × 10 reps E-7
- Set 3: 145 lbs × 8 reps E-9

Today, we're starting at 135 lbs for 10 reps.

You worked through 135, 140, and 145 lbs this session. You hit 10 reps at 135 and 140, but only got 8 at 145. Here's why we're starting at 135:

The goal of Foundation is to hit 10 reps on ALL sets at the SAME weight, with effort ~6 on the first set. You proved 135 works — let's build consistency there before moving up. Once you hit 10 reps on all sets at 135, we'll move to 140.

Remember: in double progression, we keep the same weight for all sets. You progressed within this session — next session, let's start at 135 for all sets and build consistency."

#### Set Target (Foundation) — First Set Effort 8-10

"Last set: 135 lbs × 10 reps E-9. Stay at 135 lbs — hit this next set at the same weight. Target: 10 reps.

That first set felt heavy (effort 9). Foundation targets effort ~6 on the first set. If you want to build comfort at this weight, stay at 135 and aim for effort ~6 before we increase next session."

#### Set Target (Foundation) — First Set Effort 4-7

"Last set: 135 lbs × 10 reps E-6. Stay at 135 lbs — hit this next set at the same weight. Target: 10 reps.

Good start — effort 6 is right in the Foundation zone. Stay at 135, focus on hitting 10 reps on all sets."

#### Set Target (Foundation) — First Set Effort 1-3

"Last set: 135 lbs × 10 reps E-3. Stay at 135 lbs — hit this next set at the same weight. Target: 10 reps.

That felt light (effort 3). Foundation targets effort ~6. If you felt that was too light, adjust the weight up to where you hit 10 at effort ~6."

#### Set Target (Foundation) — Self-Progression Reminder

"Last set: 145 lbs × 8 reps E-9. Stay at [weighted_avg] lbs — hit this next set at the same weight. Target: 10 reps.

Remember: in double progression, we keep the same weight for all sets. You worked up to 145 this session — next session, let's start at [weighted_avg] for all sets and build consistency there before moving up."

### Test Scenarios

1. **Normal session:** 135 × 4 sets, all 10 reps, efforts 6/8/9/9 → avg effort 8, next: 140
2. **Self-progression, all hit:** 135/140/145 × 10 each, efforts 6/7/9 → weighted avg 140, next: 145
3. **Self-progression, one missed:** 135/140/145, reps 10/10/8, efforts 6/7/9 → weighted avg of 135+140 = 135, next: 135
4. **All missed:** 135 × 4 sets, reps 8/8/8/8 → stay at 135
5. **First set too heavy:** 135 × 10 reps E-9 → flag, suggest drop to 130

### Relationship to Other Phases

This Foundation-specific logic will be parameterized so other phases can reuse:
- **Hypertrophy:** target_reps=12, target_effort=7, same double progression structure
- **Linear:** Different logic (no "all sets at same weight" requirement), will need separate implementation

### Files Modified

- `backend/progression.py` — Add phase-agnostic logic functions, update FoundationModel.compute()
- `backend/main.py` — Update session_targets endpoint, add is_set_target to ProgressionCalculateRequest, add coaching_message to ProgressionCalculateResponse, update calculate endpoint
- `frontend/src/pages/ActiveWorkoutScreen.tsx` — Pass is_set_target=true for Set 2+, use coaching_message from calculate response
- `frontend/src/pages/SortableExerciseCard.tsx` — Add whitespace-pre-wrap for session_target formatting

### LATEST KNOWN GOOD POINT

- **Commit:** `72ca366`
- **State:** Session target and Set 2+ messaging working correctly. Foundation phase logic complete. Architecture supports easy reuse for other phases (Hypertrophy, etc.) by updating only the model/params.
- **To test:** Clean Build Folder in Xcode (Shift+Cmd+K), rebuild, run on iPhone
