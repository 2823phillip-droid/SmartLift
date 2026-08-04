---
last_updated: 2026-08-04
created: 2026-07-31
tags: [trainer, questionnaire, backend, deploy, decisions]
related: backend-db.md, auth.md, decisions.md, deploy.md
---

# Trainer-Generated Workout & Meal Plan Schema

This file is the source of truth for the questionnaire data model, backend endpoints, and generation rules for trainer-created workouts and optional meal plans.

## Questionnaire Structure

Single section — Training Profile. Body metrics and nutrition are out of scope for current release.

### Section 1 — Training Profile
Preface: "This shapes exercise selection, split structure, volume, and intensity."

| Field | Type | Options | Notes |
|---|---|---|---|
| goal | multi-select chips | strength, hypertrophy, endurance, weight_loss, mobility, general_fitness | |
| equipment | single tabs | bodyweight_only, dumbbells, barbell, machines, resistance_bands, full_gym | |
| workout_modality | single tabs | traditional_weight_training, powerlifting, bodybuilding, hiit, calisthenics, yoga, cardio, crossfit | Maps to `modality_primary` |
| modality_secondary | multi-select chips | cardio, hiit, yoga/mobility, calisthenics, none | |
| modality_mix | single tabs | together, separate_days, mostly_primary, single | |
| workout_location | text | free text | Optional — gym name or "Home" |
| training_history | single tabs | just_starting, under_6_months, 6_to_12_months, 1_to_2_years, 2_plus_years, returning | Used by AI coach for split switch recommendations |
| progression_type | single tabs | linear, double, percentage | Explicit progression method — overrides experience-based default |
| days_per_week | single tabs | 2, 3, 4, 5, 6 | |
| minutes_per_session | single tabs | 20, 30, 45, 60 | |
| experience | single tabs | beginner, intermediate, advanced | Used as fallback if progression_type not set |
| focus | single tabs | full_body, upper_lower_split, push_pull_legs, body_part_split, custom | Split style |
| limitations | multi-select chips | none, shoulder_issues, knee_issues, back_issues, wrist_issues, limited_mobility, high_impact_aversion | |

**Removed fields (out of scope):**
- `age_range` — not needed for workout generation; used only by meal plan which is deferred
- `meal_plan_opt_in`, `diet_type`, `cooking_skill`, `allergies`, `meals_per_day` — nutrition removed from current scope

## Modality Mix Semantics

- `single` — just primary style, no secondary activities
- `together` — primary + secondary activities in the same session (e.g., lifting + cardio in one workout)
- `separate_days` — dedicated days for each activity (e.g., lift Mon/Wed, cardio Tue/Thu)
- `mostly_primary` — primary most days, secondary as occasional add-on

## Progression Type

- `linear` — add weight every session (default for beginners)
- `double` — add reps first, then add weight (default for intermediates)
- `percentage` — based on a max lift (default for advanced)

Explicit `progression_type` from questionnaire overrides the experience-based default in `progression.py`:
```python
progression_type = getattr(profile, "progression_type", None) or _EXPERIENCE_PROGRESSION.get(profile.experience, "linear")
```

## Split Styles

- `full_body` — every session hits all major muscle groups
- `upper_lower_split` — alternating upper and lower days
- `push_pull_legs` — three day types rotating
- `body_part_split` — chest/tris, back/bis, legs, shoulders, arms rotation
- `custom` — AI coach builds week_schedule

## Backend Storage

- Table: `users`
- Column: `fitness_profile` (JSONB, nullable)
- Stores the full questionnaire payload as a single JSON object
- Updated by `PUT /api/profile/fitness`
- Read by `POST /api/trainer/generate` as default values; request payload can override per generation

## Endpoints

### GET /api/profile/fitness
Returns current user profile for questionnaire pre-fill.

### PUT /api/profile/fitness
Request body mirrors questionnaire answer structure. Saves to `users.fitness_profile` JSONB.

Response:
```json
{
  "goal": ["strength", "mobility"],
  "equipment": "dumbbells",
  ...
}
```

### POST /api/trainer/generate
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
    "name": "Generated Workout - 2026-08-04",
    "description": "...",
    "groups": [...]
  },
  "meal_plan_draft": null
}
```

Note: `meal_plan_draft` is always `null` until nutrition flow is built.

## Generation Rules

### Workout Draft
1. Filter exercise library by equipment and limitations
2. Select template based on `focus` + `modality_primary`
3. Fill slots with exercises matching movement/tier/equipment filters
4. Volume (sets/reps) determined by goals + experience
5. Progression type set by explicit `progression_type` or experience fallback
6. Minutes/session caps total work + rest
7. Seeded randomness for exercise selection within filters

### Slot-Based Templates (10 templates)
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

### Body Part Split Rotation
When `focus == "body_part_split"` and days_per_week > 5:
- Rotates through: Chest+Triceps → Back+Biceps → Legs → Shoulders → Arms
- Each day uses the corresponding template
- 6 days = one full rotation + chest/tris repeat

### Meal Plan Draft
**Not generated in current release.** `generate_meal_plan()` returns `None`.
Code preserved in `progression.py` for when nutrition is re-enabled.

## AI Coach Layer (future)

The AI coach is NOT part of workout generation. Its responsibilities:
- Explain questions and guide users through the questionnaire
- Reconcile conflicting or ambiguous answers
- Build `week_schedule` dict for mixed-modality weeks (e.g., {"monday": "bodybuilding", "tuesday": "hiit", ...})
- Recommend split/progression switches based on `training_history`
- Update `fitness_profile` and trigger re-generation when user accepts a switch

The backend receives the final structured `week_schedule` and generates workouts deterministically.

## Frontend UX

- Step-through: one question per screen with progress indicator
- Single-select options render as tabs
- Multi-select options render as chips
- Text inputs for free-form answers
- Pre-select defaults where sensible
- Save profile on completion so next session pre-fills

## User Model Migration

In `backend/main.py` `_run_migrations()`:
- `fitness_profile` JSONB column already exists
- No schema changes needed for questionnaire redesign

## Open Decisions

- Should generated workout auto-save as a template, or return as unsaved draft? Current: unsaved draft, user accepts to save.
- AI coach `week_schedule` format — currently a flat dict of day→modality. May need time-of-day support for "lift in morning, cardio in evening" patterns.
- Nutrition questionnaire — when re-enabled, body metrics section returns, plus diet/cooking/allergy questions.
