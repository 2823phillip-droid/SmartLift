---
last_updated: 2026-10-07
created: 2026-10-07
tags: [trainer, prebuilt-templates, questionnaire, ai-coach]
related: trainer.md, ai-coach-capabilities.md, Askeo.md, TODO.md
---

# Prebuilt Template Selection Flow

## Status

Active. Replaces the automatic workout builder flow retired in `439c55f`.

## Overview

The questionnaire no longer auto-generates a workout. Instead:

1. User completes **Training Profile** questionnaire (goals, equipment, experience, limitations)
2. Profile is saved to `users.fitness_profile` via `PUT /api/profile/fitness`
3. User is shown a **prebuilt template gallery** — curated workout templates available to all users
4. User selects a template → immediately starts logging their first session with it

The AI coach's `generate_workout` tool still works and is used when a user asks to build or generate a workout on demand. The retirement only affected the questionnaire→auto-workout path.

## Training Profile (questionnaire)

Captures user state for template matching and progression. Saved to `users.fitness_profile` as JSON.

Fields (from `intake.py` `UserProfile`):
- `goals` — list of goals (strength, hypertrophy, general_fitness, etc.)
- `focus` — `full_body`, `upper_lower_split`, `push_pull_legs`, `body_part_split`
- `equipment` — `bodyweight_only`, `home_gym_basic`, `full_gym`
- `experience` — `beginner`, `intermediate`, `advanced`
- `limitations` — list of injury/limitation flags
- `days_per_week` — 2-6
- `minutes_per_session` — 20-60
- `modality` — `traditional_weight_training`, `bodybuilding`, `powerlifting`, `hiit`, `cardio`
- `modality_mix` — `single`, `together`, `separate_days`, `mostly_primary`
- `cardio_timing`, `cardio_type`, `incorporated_cardio_type`, `cardio_days_per_week`
- `units_preference` — `imperial`, `metric`

The questionnaire no longer asks `build_mode` (template vs custom builder). That field is removed.

## Prebuilt Template Library

**Backend:** Shared catalog of workout templates available to all users. Not user-specific.

**What a template contains:**
- Name (e.g., "Push Day", "Legs", "Full Body Power")
- Exercise set with progression logic: sets, reps, target weight curves
- Slot-based structure (compounds first, accessories after, isolations last)

**Endpoint:** `GET /api/templates/library` serves the full catalog (to be implemented — see TODO.md).

**Current state:** The `439c55f` commit implemented the prebuilt template *model* — the concept and the frontend template selector UI. The backend shared template library endpoint (`GET /api/templates/library`) is the remaining work to fully realize the shared template catalog.

## AI Coach Tools (unchanged)

- `generate_workout` — still live. Used when user asks to build/generate a workout. Calls `build_full_draft()` → `progression.generate_workout()`.
- `modify_workout` — still live. Used when user asks to modify/adjust/swap exercises in their current prescription.

Both tools respect user profile constraints (equipment, limitations, goals). The retirement of the automatic builder does not affect these tools.

## What Changed vs Old Flow

| | Old (automatic builder) | New (prebuilt templates) |
|---|---|---|
| Questionnaire → workout | Auto-generates via `POST /api/trainer/generate` | No auto-generation; user picks from gallery |
| Build mode toggle | `template` vs `custom` | Removed |
| Template source | Generated on the fly from `progression.py` templates | Curated prebuilt library (shared, app-wide) |
| AI coach `generate_workout` | Available | Still available — used on demand, not by questionnaire |

## Related

- `trainer.md` — historical reference for the old automatic builder flow (archived, do not use for new work)
- `ai-coach-capabilities.md` — AI coach tool definitions (`generate_workout`, `modify_workout`)
- `TODO.md` — "Remove automatic workout builder" item tracks deletion of `POST /api/trainer/generate` (still open)
- `Askeo.md` — endpoint reference
