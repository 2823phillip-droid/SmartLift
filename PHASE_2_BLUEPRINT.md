# PHASE 2 BLUEPRINT: `exercise_library` Schema & Questionnaire Mapping

## PART A: Updated `exercise_library` Table Schema

These are the exact columns to add via migration. They are grouped by **how the Coach Engine uses them**. Existing fields (`id`, `name`, `equipment`, `muscle_group` etc.) remain unchanged and serve as base keys.

### PHASE 1: Context Gating (Stops garbage from ever being selected)
*Intersects against user profile before picking anything.*

| Column | Type | Allowed Values / Constraints | Coach Engine Workflow Use |
| :--- | :--- | :--- | :--- |
| `primary_equipment` | `TEXT` | `barbell` \| `dumbbell` \| `cable` \| `machine` \| `bodyweight` \| `resistance_band` \| `kettlebell` \| `other` | **Root Filter.** Drops exercises that match the user's stated environment (Gym vs Home PT). |
| `coach_relevance_rank` | `SMALLINT` | `0` to `4` (Integer, default 2) | **Quality Threshold.** Rank 3-4 are core mass builders. Rank 0-1 are niche/PT-only. Coach enforces `WHERE rank >= X` based on user environment. |
| `movement_type` | `TEXT` | `compound` \| `isolation` \| `mobility` \| `helper` | **Progression Rule.** Compounds get Double Progression weight bumps (5lbs). Isolations stay same or get lighter bump (2.5lbs). Mob/Helper excluded from Strength block. |
| `is_compound` | `BOOLEAN` | `True` \| `False` | **Fast Engine Filter.** Assigns `sets/reps` targets and `weight_increment_limit`. |

### PHASE 2: Sequencing & Workout Architecture (Fixes Wrong Order)
*Dictates workout flow and hierarchy.*

| Column | Type | Allowed Values / Constraints | Coach Engine Workflow Use |
| :--- | :--- | :--- | :--- |
| `exercise_role` | `TEXT` | `prehab_activation` \| `main_compound` \| `secondary_compound` \| `accessory` \| `isolation_technical` \| `cool_down` | **Ordering Key.** Defines the sequence: pre-hab → main compound → secondary/compounds → accessory → isolation → cooldown. Fixes "triceps before bench". |
| `movement_pattern` | `TEXT` | `push_horizontal` \| `push_vertical` \| `pull_horizontal` \| `pull_vertical` \| `hinge` \| `squat_pattern` \| `core_stab` \| `unilateral` | **Symmetry Check.** Ensures balanced session builds (e.g., prevents 4x horizontal push without a single vertical pull). Forces inclusion of antagonist patterns. |
| `systemic_fatigue_load` | `SMALLINT` | `1` to `5` (Integer) | `1`=Local fatigue, `3`=Moderate CNS drain, `5`=Max systemic (Heavy dead/squat). | **CNS Management.** Prevents stacking too much CNS work. Won't pair heavy hinge + deep squat in one block unless periodized correctly. |
| `volume_capacity_limit` | `TEXT` | e.g., `"8x12"`, `"4x30"`, `"unlimited"` (Sets x Reps) | **Junk Volume Capper.** Tells engine when an exercise hits structural failure. Stops adding reps past that point per session. |

### PHASE 3: Safety & Biomechanics (Enforces Rep-Cap Logic)
*Prevents destructive jumps and joint blowout.*

| Column | Type | Allowed Values / Constraints | Coach Engine Workflow Use |
| :--- | :--- | :--- | :--- |
| `structural_safety_score` | `SMALLINT` | `1` to `5` (Integer) | `1`=High spine/shoulder stress, `3`=Medium, `5/=Joint-friendly stable. | **Structural Gate.** Coach drops anything below score threshold when user logs "lower back hurts". Engine enforces `weight_increment_limit`. |
| `weight_increment_limit` | `FLOAT` | `2.5` \| `5.0` \| `10.0` (lbs or kg depending on DB scale) | **Rep-Cap Enforcement.** Hard-coded ceiling bumps: Delicate joints/supinated grips = +2.5lb. Barbell compounds = +5lb. Blocks +10 jumps automatically. |
| `joint_stress_flags` | `TEXT` | `lumbar_spine`, `cervical_spine`, `knee_patellofemoral`, `shoulder_glenohumeral`, `wrist_extensor`, `hip_flexor` (Comma-Sep) | **Injury Mapping.** If user logs "shoulder clicks", coach instantly filters `joint_stress_flags` containing `shoulder_glenohumeral`. Forces substitution if needed. |
| `balance_impact` | `TEXT` | `bilateral_only` \| `unilateral_recommended` | **Pairing/Activation Logic.** If tagged `unilateral_recommended`, coach forces equal-time sets left/right or pairs it with a counterpart exercise to prevent asymmetry. |

### PHASE 4: Coaching Metadata & Progression Hooks
*Makes the session coach readable, adaptive, and explainable.*

| Column | Type | Allowed Values / Constraints | Coach Engine Workflow Use |
| :--- | :--- | :--- | :--- |
| `coach_notes` | `TEXT` | Pre-built cues: e.g., "3 sec eccentric / drive through heels / chest up / avoid locking out" | **Dynamic Explainer.** LLM reads dynamically. User asks "Why did my squat fail?" → Coach pulls cue and explains *specific form breakdown* based on where reps dropped. |
| `rep_range_optimal` | `TEXT` | `"6-8"` \| `"8-12"` \| `"10-15"` \| `"3-5 peak"` \| "unlimited" | **Phase Alignment Check.** If engine assigns Hypertrophy (8-12) but exercise only has 3 reps/set, Coach warns: "This is a strength-focused movement for this phase." |
| `coach_excluded_reason` | `TEXT` | Optional flags: e.g., "avoid if lumbar disc herniation" \| "requires equipment X" | **Explainable AI.** If coach swaps out an exercise because user logged pain, it can reference exclusion rules instead of generating vague answers. Tracks user history safely. |

---

## PART B: User Questionnaire & `user_profile` Schema

The questionnaire *must* yield strictly structured data so the Coach engine can intersect it against `exercise_library`. No free-text narrative forms. 

### Target DB Table: `user_profiles`
| Column | Type | Constraint / Allowed Values | Coach Engine Workflow Use |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | Primary Key | Links all user data to workout logs. |
| `training_environment` | `TEXT` | `commercial_gym` \| `home_weights` \| `dumbbells_only` \| `bodyweight_calisthenics` \| `pt_clinic` | **Root-level filter.** Dictates which `primary_equipment` tags are valid per session. Gym → drops band/bodyweight rows. Home/DBs → prioritizes free weights, ignores cable-specific moves. |
| `equipment_inventory` | `TEXT` (JSON Array) | `["barbell", "dumbbell", "cable", "bodyweight"]` etc. | **Precision Filter.** Specific equipment owned. User selects "Barbell Rack" but not "Cable Tower", Coach hides lat pulldowns immediately. |
| `current_block_goal` | `TEXT` | `hypertrophy_growth` \| `strength_heavy_compounds` \| `mobility_recovery` \| `general_fitness` | **Triggers Progression Block Logic.** Sets rep targets (8-12, 6-8 @ heavy, etc.), rest times (`default_rest_seconds` modifiers), and double progression rules. |
| `experience_level` | `TEXT` | `beginner` \| `intermediate` \| `advanced_endurance` \| `elite` | **Loads Coach Priority Filter (Relevance Rank).** Beginners/Intermediates = ignore rank 0-1 PT/niche. Advanced/Elite = open range but require specific form cues (`coach_notes`). Limits systemic fatigue load for beginner profiles. |
| `physical_limitations` | `TEXT` (Comma-Sep Flags) | Derived from joint stress flags: `lumbar_spine`, `shoulder_glenohumeral`, `None` | **Hard Safety Gate.** User logs "lower back hurts" before workout → Coach drops anything tagged with `lumbar_spine` or structural safety score ≤2. Swaps out unsafe lifts (e.g., heavy hinges) entirely. |
| `self_reported_confidence` | `FLOAT` / INT (1-10) | 1 to 10 Scale | **Coach Adaptation Logic.** If confidence <4, Coach prioritizes stable machines (`structural_safety_score` >=4), adds more coach_cues, and restricts weight increments to +2.5lb max until they build up reps safely. |

---

### QUESTIONNAIRE FLOW (UI Draft)
All fields must enforce structured outputs. Free-text is only for edge cases and flagged as `manual_review_required`.

**STEP 1: LOGISTICS**
1. *Where do you train?* `[Commercial Gym] [Home with Weights] [Dumbbells Only] [Calisthenics/Bodyweight]`
2. *What gear do you actually have? (Select all that apply)* `[Barbell & Rack] [EZ Bar] [Cables/Tower] [Smith Machine] [Full DB Set up to 50lbs] [Other]` -> Populates `equipment_inventory`.

**STEP 2: GOALS & BASELINE**
3. *Primary goal for the next 6 weeks?* `[Hypertrophy (Growth, 8-12 reps)] [Strength (Heavy Compounds, Powerlifting focus)] [Mobility & Recovery] [General Fitness / Fat Loss]` -> Sets `current_block_goal`.
4. *Experience level?* `[New to lifting (<3mo)] [Intermediate (6mo+ training log)] [Advanced (Years of structured load)]` -> Maps to `experience_level`.

**STEP 3: SAFETY & CONSTRAINTS (CRITICAL)**
5. *Do you have any current injuries or chronic pain areas?* (Strict Multi-Select) `[Lower Back / Spine] [Shoulder Impingement/Cuff] [Knee Patellar/Quadricep] [Wrist Extensor/Grip] [Hip Flexor/Back Glute] [None / Fully Healthy]` -> Populates `physical_limitations` flags. Triggers the hard safety gate that drops unsafe exercises automatically (`joint_stress_flags`).
6. *What does your back/knees feel like today right now?* `[Fresh & Stable] [Slightly Tight/Fatigue] [Painful / Unstable]` -> Modifies `structural_safety_score` threshold for this specific session (e.g., if "Unstable", drops all structural scores <3 for the *current* workout only, forcing machine/bodyweight substitutions).

**STEP 4: COACH OPT-IN**
7. *Do you prefer strict form cues and rep breakdowns on screen?* `[Yes, detailed coach guidance] [No, just show me the workout]` -> Triggers `coach_notes` display logic in Layer 1 Frontend UI.
