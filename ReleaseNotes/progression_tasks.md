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

## PHASE 2: Library Cleanup (Prerequisites)

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

## Current Status (Updated 2026-10-08)

**exercise_v2.db**: Created at `backend/exercise_v2.db` (10MB, 1359 rows). Safe copy of `workout.db` for classification work. **Fully classified and in sync with workout.db.** Backend production Postgres on Fly.io also has all 32 columns with 1359 exercises migrated and verified.

**classify_exercises.py**: Built at `backend/classify_exercises.py`. Keyword-based classifier covering 43 movement patterns. Reads exercise_library from DB, classifies each exercise, writes results to `classification_results.json`. **Re-run with fixes: kickback correction, band exercise keywords, shoulder_external_rotation cleanup, cable squatting curl fix, pattern sweep corrections.**

**Classification accuracy**: 1359/1359 classified (100%), 0 exercises pending manual classification.

**movement_pattern column**: Added to both `exercise_v2.db` and `workout.db`. Fully populated (1359/1359). All 69 band exercises classified by movement pattern, not equipment. 43 patterns total (including new `grip` and `hip_abduction_adduction`).

**Equipment categories**: 17 categories now, "other" eliminated. New categories added: plates, cardio, stretching, roller, sledge, tire, arms_forearm. Empty categories core_abs and hitt_cardio removed. "Gym Weights" preset = plates + dumbbells + barbells (convenience toggle). Deleted 10 poor-quality exercises (7 POV duplicates, 1 female variant, 2 towel rows). 1359 exercises remain.

**New columns added (this session)**:
- `base_movement` TEXT: 33 unique base movements (back_squat, front_squat, bench_press, deadlift, row, pull_up, bicep_curl, tricep_extension, dip, mobility, etc.)
- `hitt_worthy` INTEGER: 585/1359 flagged (43%). Excludes warmup/cool_down/mobility/pure isolation. Core carries (prehab role) included.
- `warmup_type` TEXT: 157 exercises classified. Values: dynamic (26), static (55), activation (67), general (9).

**Movement pattern sweep (this session)**: 16 pattern corrections + 2 new patterns (grip, hip_abduction_adduction) = 43 patterns. 1 misclassification fixed (cable squatting curl). Rear axe kick reclassified as dynamic warmup.

**Frontend changes (this session)**:
- Equipment toggle system: SettingsScreen has 17 equipment category checkboxes with "Select All" button. Equipment filtering in TemplateEditorScreen and CustomWorkoutBuilderScreen filters by primary_equipment from backend API response. localStorage synced for immediate updates without navigation.
- Coach progression toggle: New setting in SettingsScreen ("Coach Progression", ON by default). When ON: exercise cards in TemplateEditorScreen show clean UI (no progression toggle, no "Set all progression" buttons). When OFF: full progression UI visible (per-exercise progression toggle + "Set all progression" buttons for workout-level control).
- Muscle groups consolidated: upper arms + lower arms → "Arms", upper legs + lower legs → "Legs". Filter dropdown now shows 8 groups: Back, Chest, Shoulders, Arms, Legs, Core, Neck, Cardio.
- Deload override toggle removed from exercise cards.
- Routine type selector (Strength/HIIT/Active Rest) retained — used when creating/updating templates.

**Final library state**:
- 1359 exercises, 32 columns, fully classified
- Exercise roles: 492 accessory, 396 isolation_technical, 31 main_compound, 272 secondary_compound, 11 cool_down, 69 prehab_activation, 88 warmup
- Movement types: 545 compound, 153 helper, 661 isolation
- Equipment: 17 categories, all verified and corrected
- Movement patterns: 43 total, all populated
- HIT-worthy: 585 exercises (43%)
- Warmup type: 157 exercises classified

**Next steps** (all DONE):
1. [DONE] Fix unclassified exercises — 0 remaining
2. [DONE] Apply movement_pattern to exercise_v2.db
3. [DONE] Verify v2 classifications — spot-checked, all categories correct
4. [DONE] Add `movement_pattern` column + migration to production Postgres on Fly.io
5. [DONE] Run classification against production (migrated 1359 exercises, 0 errors)
6. [DONE] Update working `workout.db` to match production (added 3 columns, migrated data)
7. [DONE] Update `movement_type` and `exercise_role` columns — helper/mobility identification complete
8. [DONE] Drop `coach_relevance_rank` column — utility questionable, removed from exercise_v2.db
9. [DONE] Add `base_movement` column — 33 unique base movements identified
10. [DONE] Add `hitt_worthy` column — 585 exercises flagged
11. [DONE] Add `warmup_type` column — 157 exercises classified
12. [DONE] Movement pattern sweep — 16 corrections + 2 new patterns
13. [DONE] Build equipment toggle system — Settings UI + frontend filtering + backend API
14. [DONE] Add coach progression toggle — Settings UI + frontend conditional rendering
15. [DONE] Consolidate muscle groups — frontend filter cleanup
16. [DONE] Remove deload override toggle — simplify exercise cards
