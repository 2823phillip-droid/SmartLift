---
last_updated: 2026-10-05
created: 2026-07-31
tags: [trainer, questionnaire, backend, deploy]
related: backend-db.md, auth.md, decisions.md, deploy.md, memory/deploy.md
---

# Trainer-Generated Workout & Meal Plan Schema — DEPRECATED as of 2026-10-05

## Status Change (2026-10-05)

The automatic workout builder flow (`POST /api/trainer/generate`) is being **retired**. The questionnaire and prebuilt template selection model replaces the auto-generated approach. This document still contains all historical schema details below for reference, but new work follows the redesigned flow described in `trainer-redesign.md`.

---

# Trainer-Generated Workout & Meal Plan Schema (Historical)

This file is the source of truth for the historical questionnaire data model, backend endpoints, and generation rules for trainer-created workouts and optional meal plans. **The automatic builder is retired; see `trainer-redesign.md` for the new flow.**

## Historical Questionnaire Structure

Single section — Training Profile. Body metrics and nutrition are out of scope for current release.

### Section 1 — Training Profile (Historical)
Preface: "This shapes exercise selection, split structure, volume, and intensity."

| Field | Type | Options | Notes |
|---|---|---|---|
| goal | multi-select chips | strength, hypertrophy, endurance, weight_loss, mobility, general_fitness | |
| equipment | single tabs | bodyweight_only, dumbbells, barbell, machines, resistance_bands, full_gym | |
| workout_modality | single tabs | traditional_weight_training, powerlifting, bodybuilding, hiit, cardio | Maps to `modality_primary` |
| modality_secondary | multi-select chips | cardio, hiit, none | |
| modality_mix | single tabs | together, separate_days, mostly_primary, single | |
||| cardio_timing | single tabs | none, warmup_10, warmup_15, warmup_20, finisher_15, finisher_20, hiit_finisher, separate_day | When cardio happens |
||| incorporated_cardio_type | single tabs | none, hiit, steady_state, walking, distance, mixed | Cardio type attached to lifting days (together/mostly_primary) |
||| cardio_type | single tabs | none, hiit, steady_state, walking, distance, mixed | Cardio type for dedicated cardio days |
||| cardio_days_per_week | single tabs | 0-7 | Number of dedicated cardio days (separate/mostly_primary only) |
| workout_location | text | free text | Optional — gym name or "Home" |
| training_history | single tabs | just_starting, under_6_months, 6_to_12_months, 1_to_2_years, 2_plus_years, returning | Used by AI coach for split switch recommendations |
| progression_type | single tabs | linear, double, percentage | Explicit progression method — overrides experience-based default |
| experience | single tabs | beginner, intermediate, advanced | Used as fallback if progression_type not set |
| days_per_week | single tabs | 2, 3, 4, 5, 6 | |
| minutes_per_session | single tabs | 20, 30, 45, 60 | |
| build_mode | single tabs | template, custom | Template = auto-generate; Custom = guided builder |
| focus | single tabs | full_body, upper_lower_split, push_pull_legs, body_part_split | Split style (only asked in template mode) |
| limitations | multi-select chips | none, shoulder_issues, knee_issues, back_issues, wrist_issues, limited_mobility, high_impact_aversion | |

**Removed fields (out of scope):**
- `age_range` — not needed for workout generation; used only by meal plan which is deferred
- `meal_plan_opt_in`, `diet_type`, `cooking_skill`, `allergies`, `meals_per_day` — nutrition removed from current scope

## Historical Modality Mix Semantics

- `single` — just primary style, no secondary activities
- `together` — primary + secondary activities in the same session (e.g., lifting + cardio in one workout)
- `separate_days` — dedicated days for each activity (e.g., lift Mon/Wed, cardio Tue/Thu)
- `mostly_primary` — primary most days, secondary as occasional add-on

## Historical Progression Type

- `linear` — add weight every session (default for beginners)
- `double` — add reps first, then add weight (default for intermediates)
- `percentage` — based on a max lift (default for advanced)

Explicit `progression_type` from questionnaire overrides the experience-based default in `progression.py`:
```python
progression_type = getattr(profile, "progression_type", None) or _EXPERIENCE_PROGRESSION.get(profile.experience, "linear")
```

## Historical Split Styles

- `full_body` — every session hits all major muscle groups
- `upper_lower_split` — alternating upper and lower days
- `push_pull_legs` — three day types rotating
- `body_part_split` — chest/tris, back/bis, legs, shoulders, arms rotation

## Historical Workout Naming Rules

- No day numbers for identical structures (e.g., "Upper Body" not "Day 1").
- A/B/C suffixes only when the same muscle group repeats within the same week.
- Upper/Lower split start order: match modality priority.
   - Powerlifting/strongman: start Lower first (squat/bench focus).
   - All other modalities (bodybuilding, general, etc.): start Upper first.
- AI coach may recommend split switches after N months; user accepts before applying.

## Historical Workout Generation Rules

- Fewer exercises, more sets for compounds. More exercises, fewer sets for accessories.
- Lift budget = session minutes - cardio minutes - warmup minutes.
- Slot 1: flat/incline/decline barbell bench only.
- Slot 2: barbell or dumbbell bench/incline/decline.
- CHEST_DAY = 3 chest slots.
- CHEST_TRICEPS adds 2 tricep slots (5 total).
- Transition: same area 30s, different area 60s.

## Historical Gym Types

- `full_gym` — barbell, dumbbell, cable, machines
- `planet_fitness` — limited barbell, primarily machines/dumbbells
- `home_gym_basic` — dumbbells, resistance bands, limited equipment
- `bodyweight_only` — no equipment

## Historical Reverse Exercise Rules

- Not all reverse exercises are bad — surgical exclusions only.
- Reverse lunge and reverse fly are standard exercises, not excluded by default.
- Exclude reverse exercises only when they conflict with a specific limitation (e.g., knee issues → exclude reverse lunge).
- Exclusion rules must be surgical, not blanket bans.

## Historical Builder Draft Persistence

- Workout builder draft must persist across tab switches.
- Cancel exits without clearing draft.
- Accept saves the workout as a template.

## Historical ExerciseDB

- ExerciseDB is the licensed exercise library source.
- GIFs stored at `180/` and `360/` angle folders.
- Frontend uses `program_worthy` tagging + tag-based exercise picker.

## Historical Custom Builder Flow (Deprecated)

When `build_mode == "custom"`:
- Questionnaire skips `focus` entirely
- On complete, routes to `CustomWorkoutBuilderScreen`
- User picks split structure (full body / upper-lower / PPL / body part)
- App auto-creates day tabs based on `days_per_week`
- Per day: user selects muscle group/focus, searches exercise library, adds exercises
- Exercises can be manually reordered within each day
- User saves → creates templates + exercises in backend → routes to Workouts tab

## Historical Backend Storage

- Table: `users`
- Column: `fitness_profile` (JSONB, nullable)
- Stores the full questionnaire payload as a single JSON object
- Updated by `PUT /api/profile/fitness`
- Read by `POST /api/trainer/generate` as default values; request payload can override per generation

## Historical Endpoints

### GET /api/profile/fitness (Deprecated)
Returns current user profile for questionnaire pre-fill.

### PUT /api/profile/fitness (Historical Use)
Request body mirrors questionnaire answer structure. Saves to `users.fitness_profile` JSONB.

Response:
```json
{
   "goal": ["strength", "mobility"],
   "equipment": "dumbbells",
   ...
}
```

### POST /api/trainer/generate ⚠️ RETIRED
Request: optional overrides merged with saved profile.
```json
{
   "goal": ["strength"],
   ...
}
```

Response:
```json
{
   "workout_draft": {
     "name": "Generated Workout - 2026-08-06",
     "description": "...",
     "groups": [...]
   },
   "meal_plan_draft": null
}
```

**Retired 2026-10-05. The questionnaire no longer auto-generates workouts.** Use the new flow: questionnaire → prebuilt template selection → workout logging. See `trainer-redesign.md`.

Note: `meal_plan_draft` is always `null` until nutrition flow is built.

## Historical Generation Rules (Deprecated)

### Workout Draft
1. Filter exercise library by equipment and limitations
2. Select template based on `focus` + `modality_primary`
3. Fill slots with exercises matching movement/tier/equipment filters
4. Volume (sets/reps) determined by goals + experience
5. Progression type set by explicit `progression_type` or experience fallback
6. Minutes/session caps total work + rest
7. Seeded randomness for exercise selection within filters

### Slot-Based Templates (10 Templates — Historical Structure)
Each day template has 5 slots: compound_1, compound_2, accessory_1, accessory_2, isolation_1
- Chest Day: horizontal_push, vertical_push, horizontal_push_accessory, isometric_push, triceps_isolation
- Back Day: vertical_pull, horizontal_pull, horizontal_pull_accessory, isometric_pull, biceps_isolation
- Leg Day: squat, hinge, quad_accessory, ham_accessory, calf_isolation
- Shoulder Day: overhead_press, lateral_raise, rear_delt, trap, biceps_isolation
- Arm Day: triceps_compound, triceps_accessory, biceps_compound, biceps_accessory, forearm_isolation
- Chest+Triceps: chest_day slots + triceps_isolation slot
- Back+Biceps: back_day slots + biceps_isolation slot
- Upper Body: push compound + pull compound + shoulder + arm isolation + core
- Lower Body: squat + hinge + quad_accessory + ham_accessory + calf
- Full Body: overhead_press + hinge + pull + leg_accessory + core

### Body Part Split Rotation (Historical)
When `focus == "body_part_split"` and days_per_week > 5:
- Rotates through: Chest+Triceps → Back+Biceps → Legs → Shoulders → Arms
- Each day uses the corresponding template
- 6 days = one full rotation + chest/tris repeat

### Meal Plan Draft (Never Used)
**Not generated in current release.** `generate_meal_plan()` returns `None`.
Code preserved in `progression.py` for when nutrition is re-enabled.

## Historical AI Coach Layer

The AI coach was NOT part of workout generation. Its responsibilities:
- Explain questions and guide users through the questionnaire
- Reconcile conflicting or ambiguous answers
- Build `week_schedule` dict for mixed-modality weeks (e.g., {"monday": "bodybuilding", "tuesday": "hiit", ...})
- Recommend split/progression switches based on `training_history`
- Update `fitness_profile` and trigger re-generation when user accepts a switch

The backend receives the final structured `week_schedule` and generates workouts deterministically.

## Historical Frontend UX

- Step-through: one question per screen with progress indicator
- Single-select options render as tabs
- Multi-select options render as chips
- Text inputs for free-form answers
- Pre-select defaults where sensible
- Save profile on completion so next session pre-fills
- Conditional question flow:
   - `focus` is skipped in `custom` build mode
   - `modality_mix`, `cardio_timing`, `incorporated_cardio_type`, `cardio_type` are skipped when `modality_secondary == ["none"]`
   - `modality_mix` removes "single" option when cardio/HIIT is selected

## Historical User Model Migration

In `backend/main.py` `_run_migrations()`:
- `fitness_profile` JSONB column already exists
- No schema changes needed for questionnaire redesign

## Questions (Resolved)

- ✅ Should generated workout auto-save as a template, or return as unsaved draft? **Retired.** Replaced with prebuilt template selection flow.
- ✅ AI coach `week_schedule` format — currently a flat dict of day→modality. May need time-of-day support for "lift in morning, cardio in evening" patterns. **Still future.**
- ✅ Nutrition questionnaire — when re-enabled, body metrics section returns, plus diet/cooking/allergy questions. **Deferred.**
