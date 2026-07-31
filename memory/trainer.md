---
last_updated: 2026-07-31
created: 2026-07-31
tags: [trainer, questionnaire, backend, deploy, decisions]
related: backend-db.md, auth.md, decisions.md, deploy.md
---

# Trainer-Generated Workout & Meal Plan Schema

This file is the source of truth for the questionnaire data model, backend endpoints, and generation rules for trainer-created workouts and optional meal plans.

## Questionnaire Structure

Three sections. Sections 2 and 3 are only shown if the user opts into trainer generation.

### Section 1 — Body Metrics (for TDEE/macro math)
Preface: "We use this to calculate your calorie and macro targets for meal plans."

| Field | Type | Options | Notes |
|---|---|---|---|
| weight_kg | single | numeric input | "Prefer not to answer" = null |
| height_cm | single | numeric input | "Prefer not to answer" = null |
| sex | single | male, female, other | "Prefer not to answer" = null |
| activity_level | single | sedentary, light, moderate, active, very_active | Maps to TDEE multipliers |

TDEE multipliers:
- sedentary: 1.2
- light: 1.375
- moderate: 1.55
- active: 1.725
- very_active: 1.9

### Section 2 — Training Profile

| Field | Type | Options |
|---|---|---|
| goal | multi-select | strength, hypertrophy, endurance, weight_loss, mobility, general_fitness |
| equipment | single | bodyweight_only, dumbbells, barbell, machines, resistance_bands, full_gym |
| age_range | single | under_25, 26-40, 41-55, 56+ |
| days_per_week | single | 2, 3, 4, 5, 6 |
| minutes_per_session | single | 20, 30, 45, 60 |
| experience | single | beginner, intermediate, advanced |
| focus | single | full_body, upper_lower_split, push_pull_legs, custom |
| limitations | multi-select chips | none, shoulder_issues, knee_issues, back_issues, wrist_issues, limited_mobility, high_impact_aversion |

Preface: "This shapes exercise selection, split structure, volume, and intensity."

### Section 3 — Nutrition Opt-In

| Field | Type | Options | Notes |
|---|---|---|---|
| meal_plan_opt_in | single | yes, no | Gate for meal plan generation |
| diet_type | single | omnivore, vegetarian, vegan, pescatarian, keto_friendly, paleo_friendly | Only asked if opt-in yes |
| cooking_skill | single | quick_simple, moderate, elaborate | Only asked if opt-in yes |
| allergies | multi-select chips | none, nuts, dairy, gluten, soy, shellfish, eggs | Only asked if opt-in yes |
| meals_per_day | single | 2, 3, 4, 5, 6 | Only asked if opt-in yes |

Preface: "We use this to build meal plans matched to your training targets. No calorie tracking required."

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
    "name": "Generated Workout - 2026-07-31",
    "description": "...",
    "groups": [...]
  },
  "meal_plan_draft": {
    "name": "Meal Plan - 2026-07-31",
    "targets": { "calories": 2200, "protein_g": 130, "carbs_g": 200, "fat_g": 72 },
    "days": [...]
  } | null
}
```

Note: `meal_plan_draft` is `null` if `meal_plan_opt_in` is false or body metrics are missing.

## Generation Rules

### Workout Draft
1. Filter ExerciseDB by equipment and limitations
2. Split exercises across days based on days_per_week and focus:
   - full_body: compound lifts + accessories each day
   - upper_lower_split: alternating upper/lower
   - push_pull_legs: 3-day rotation or packed variant
3. Volume (sets/reps) determined by goal and experience:
   - strength: 3-5 sets, 3-6 reps
   - hypertrophy: 3-4 sets, 8-12 reps
   - endurance: 2-3 sets, 12-20 reps
   - weight_loss: 3-4 sets, 10-15 reps
4. Experience multiplier: beginner lower volume, advanced higher volume
5. Minutes/session: cap total work + rest to fit session
6. Seeded randomness for exercise selection within filters

### Meal Plan Draft
1. Only generated if `meal_plan_opt_in` is true AND body metrics present
2. TDEE = BMR × activity_level multiplier
   - Mifflin-St Jeor BMR
     - male: (10 × weight_kg) + (6.25 × height_cm) − (5 × age_midpoint) + 5
     - female: (10 × weight_kg) + (6.25 × height_cm) − (5 × age_midpoint) − 161
     - age_midpoint: under_25=22, 26-40=33, 41-55=48, 56+=60
3. Goal adjustment:
   - weight_loss: TDEE − 400
   - maintenance: TDEE
   - weight_gain: TDEE + 400
   - For multi-goal, use the dominant training goal or weighted average
4. Macros by goal:
   - strength / hypertrophy: 2.0 g protein/kg, 4.0 g carbs/kg, 0.8 g fat/kg
   - weight_loss / endurance: 2.2 g protein/kg, 2.5 g carbs/kg, 0.8 g fat/kg
   - general_fitness: 1.6 g protein/kg, 3.5 g carbs/kg, 0.9 g fat/kg
5. Missing body metrics → return goal-templated macro estimate without TDEE precision
6. Meal structure based on diet_type, cooking_skill, allergies, meals_per_day

## Frontend UX

- Step-through: one question per screen with progress indicator
- Show "This is why we ask" preface per section
- Single-select options render as tabs
- Multi-select options render as chips
- Pre-select defaults where sensible (e.g., 3 days/week, 30 min, "no limitations")
- "Prefer not to answer" available for all body metric fields
- Save profile on completion so next session pre-fills

## User Model Migration

In `backend/main.py` `_run_migrations()`:
- ALTER TABLE `users` ADD COLUMN `fitness_profile` JSONB

## Open Decisions

- Should generated workout auto-save as a template, or return as unsaved draft? Current design: unsaved draft, user accepts to save.
- Should this endpoint return random but seeded workouts, or fully deterministic? Current design: seeded randomness.
- Meal plan templates: where do recipes/meals come from? TBD — external API, static library, or admin-managed.
