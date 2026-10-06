# Release Notes — Exercise Library & Progression System

**Date:** 2026-09-27
**Status:** Ready for review — not yet scheduled for implementation
**Author:** Askeo backend + frontend investigation

---

## Overview

This document captures all work needed to clean up and properly structure the exercise library, progression system, and ghost data in the workout-logger app. Work is organized into three phases: **Foundation** (already done), **Cleanup** (data hygiene), and **Progression Architecture** (new features).

---

## Phase 1: Foundation (completed)

### 1.1 Exercise classification column
- **What:** Added `is_compound` (Boolean) column to `exercise_library` table
- **Where:** `backend/models.py` (ExerciseLibrary model), `backend/main.py` (ExerciseLibraryOut, ExerciseEntryOut schemas)
- **Status:** Done — column exists in DB, populated with 542 compound / 842 isolation
- **Script:** `backend/classify_exercises.py` — heuristics-based classifier using name, muscle_group, equipment. Rules documented in script comments.

### 1.2 Response builders updated
- **What:** All exercise response endpoints now pull `is_compound` from linked `exercise_library`
- **Endpoints updated:**
  - `GET /api/exercises` (list user's exercises)
  - `GET /api/templates/{id}/exercises`
  - `GET /api/exercise-library` (library search) — returns `is_compound` now
- **Frontend type:** `ExerciseEntryOut` in `frontend/src/types.ts` has `is_compound?: boolean`

### 1.3 Frontend reps target logic
- **What:** Frontend already uses `is_compound` to decide reps targets: compounds → 6 reps, isolations → 8 reps
- **Where:** `ActiveWorkoutScreen.tsx` (~15 places), `SortableExerciseCard.tsx`
- **Status:** Logic is in place — will work once `is_compound` flows through API correctly

### 1.4 TODO restructure
- **What:** TODO.md reorganized into Bugs to fix / Bugs fixed (by release) / Features / Modifications
- **Status:** Done, committed, synced to Mac

---

## Phase 2: Library Cleanup

### 2.1 Program_worthy toggle + "Show all exercises" setting
- **Problem:** All 1384 library entries are `program_worthy=True`. The exercise picker shows everything, making it unusable.
- **Solution:**
  1. Add app setting `show_all_exercises` (default: false)
  2. Backend `GET /api/exercise-library` filters by `program_worthy=True` when setting is off
  3. When setting is on, returns all exercises
- **Fields needed:**
  - `backend/main.py`: add `show_all` query param to `search_exercise_library` endpoint
  - `backend/main.py`: `GET /api/settings` or new endpoint for app settings
  - `frontend`: settings toggle UI + localStorage or settings API persistence
  - `frontend/api.ts`: pass `show_all` param in `searchExerciseLibrary` call

### 2.2 POV duplicate collapse
- **Problem:** 64 groups of duplicate exercises (same movement, different camera angle/gif). Example: sled 45° leg press appears 4 times (front, back, side, wide stance).
- **Solution:** For each duplicate group, mark POV variants as `program_worthy=False`. Keep the canonical version.
- **How to identify:**
  - Name pattern: contains `(back pov)`, `(side pov)`, `v.2`, `v.3`, `(on stability ball)`, `(with towel)`, etc.
  - ExerciseDB `similar_exercises` JSON: entries linked with score 100.0 and `same_equipment_alternative` type
  - ExerciseDB `substitutions` JSON: same pattern
- **Safety:** Only mark as `program_worthy=False` — never delete. Reversible.

### 2.3 Ghost template cleanup
- **Problem:** 7 of 10 templates are empty (no exercises). Templates 7, 8, 9 have placeholder exercises with `reps_target=0`. Template 5 "Chest" has 87 sessions but empty template.
- **All 10 templates were built for testing purposes** — they are not real workout data. The user did not start using this app until ~2 months ago. Any session data from pre-app usage is test/placeholder nonsense, not actual training history.
- **Current template state:**

| ID | Name | Exercises | Sessions | Status |
|----|------|-----------|----------|--------|
| 1 | Push Test A | 0 | 2 | test ghost |
| 2 | Back | 0 | 2 | test ghost |
| 3 | Shoulders | 0 | 6 | test ghost |
| 4 | StrongLifts 5x5 | 0 | 0 | test ghost |
| 5 | Chest | 0 | 87 | test data (empty template, user only started ~2 months ago) |
| 6 | Push Day A | 0 | 0 | test ghost |
| 7 | Back | 1 (3/4 sit-up) | 0 | placeholder, reps=0 |
| 8 | Chest | 2 (3/4 sit-up, 45 deg side bend) | 2 | placeholder, reps=0 |
| 9 | Planet workout | 2 (band calf raise x2) | 2 | placeholder, reps=0 |
| 10 | Push Day A | 0 | 0 | test ghost |

- **Action: delete ALL templates and their associated data.** None of these are user training history. 87 sessions over 5 years on an empty template when the user only started using this app 2 months ago is clearly testing artifact. Clean slate.

### 2.4 Exercise entry data quality
- **Problem:** All 5 existing exercise entries have `reps_target=0`, `start_weight=0`. They're placeholders, not usable workouts.
- **Solution:** Either delete them (they're test data in templates 7, 8, 9 which we're deleting anyway) or set proper defaults. Since templates 7, 8, 9 are being deleted, the entries go with them.

---

## Phase 3: Progression Architecture

### 3.1 Per-exercise progression model assignment
- **Problem:** Every exercise defaults to linear progression with 6 reps. Compounds and isolations should use different models.
- **Design:**
  - **Compounds** (squat, bench, deadlift, OHP, rows, pull-ups): linear progression, 6-8 rep targets. Can switch to double progression if plateaued.
  - **Isolations** (curls, extensions, raises, flyes, leg extensions, calf raises): double progression, 8-12 rep targets. Stay on double progression by default.
  - **Helper activities** (warm-ups, mobility, activation, band walks): no progression, no reps target.
- **Fields needed:**
  - `ExerciseEntry` or `ExerciseLibrary`: `progression_type` (already exists, default "linear")
  - New: `is_helper_activity` boolean on `ExerciseLibrary` (and possibly `ExerciseEntry`)
- **Implementation:**
  - Add `is_helper_activity` column to `ExerciseLibrary` (and `ExerciseEntry` if entries need override)
  - Frontend: skip reps_target rendering, skip progression logic for helper exercises
  - Frontend: UI treatment — muted styling, no target pill, no progression indicator
  - Classifier: add heuristic to mark warm-up/mobility/activation/band-walk exercises as helper

### 3.2 Model picker
- **Problem:** Need a function that decides which progression model each exercise uses based on type + history.
- **Design:**
  ```
  model_picker(exercise, history, is_compound, is_helper_activity) -> (model, params)
  ```
  - If `is_helper_activity`: return `null` (no model)
  - If `is_compound`: return `linear` with compound params (6-8 reps, 5lb increments)
  - If `!is_compound` (isolation): return `double` with isolation params (8-12 reps, weight increments)
  - History analysis: if compound plateaued, proposer suggests switching to double (AI coach surfaces this)
- **Status:** Not started. Architecture discussed, no code.

### 3.3 AI coach progression suggestions
- **Problem:** When a compound plateaus, the AI should propose a model switch (not auto-apply).
- **Design:**
  - Backend: `evaluate_phase_effectiveness()` already exists in `rules.py` (evaluates linear/double/percentage/autoregulated)
  - Extend to per-exercise analysis: evaluate each compound's history for plateau signals
  - New endpoint or extend existing: `GET /api/coach/progression-suggestions` returns per-exercise suggestions
  - Frontend: notification/banner when suggestion exists — "Bench press plateaued 3 weeks. Want to try double progression?"
  - User action: accept → updates `ExerciseEntry.progression_type`; dismiss → no change
- **Status:** Not started. `evaluate_phase_effectiveness()` exists but is global (one phase for all exercises). Needs per-exercise extension.

### 3.4 Rep target defaults by exercise type
- **Problem:** All exercises get 6 reps. Isolations should target 8-12.
- **Status:** Partially done. Frontend uses `is_compound ? 6 : 8` (line 225, 354, 426, etc. in ActiveWorkoutScreen.tsx). This gives isolations 8 reps — a reasonable starting point for double progression. The 8-12 range can be tuned later.
- **Remaining:** Ensure `reps_target` flows from library/entry defaults through to prescription computation, not just the initial-load heuristic.

---

## Phase 4: Data Sync & Deployment

### 4.1 Mac DB sync
- **Problem:** Mac `workout.db` does not have `is_compound` or `is_helper_activity` columns. Mac library has no classification.
- **Solution:** Rsync Linux `workout.db` to Mac after all schema changes + classification are complete. OR run migration script on Mac separately.
- **Risk:** Mac may have user data since last sync (no set logs exist, so low risk, but verify).
- **Mac DB current state:**
  - 1384 exercises, all `program_worthy=True`
  - No `is_compound` column
  - No `is_helper_activity` column
  - Same 10 templates, same 5 placeholder exercises

### 4.2 Exercise library media
- **Status:** All 1384 entries have GIF URLs. No videos, no images. All have instructions (ExerciseDB data).
- **Note:** GIFs are stored on Linux filesystem at `backend/exercisedb_gifs/`. Need to verify these exist on Mac or are synced.

---

## Priority ordering (proposed)

**P0 — Must do before next real workout:**
1. Library cleanup: POV duplicate collapse + mark unused as `program_worthy=False` (or "Show all" toggle)
2. Delete ALL ghost templates and their data (clean slate)
3. Mac DB sync (columns + classification + cleanup)

**P1 — Before progression system is usable:**
4. `is_helper_activity` field + frontend integration
5. Rep target defaults confirmed working via `is_compound` (partially done)

**P2 — Progression architecture:**
6. Model picker function
7. Per-exercise progression type assignment
8. AI coach suggestion workflow

---

## Open questions for user

1. **Library cleanup approach:** "Show all exercises" toggle, or mark `program_worthy=False` on unused entries? Or both?

2. **Ghost templates:** DELETE ALL — 87 sessions over 5 years on an empty template when the user only started using this app 2 months ago is testing artifact. Clean slate.

3. **POV duplicates:** Collapse all POV variants to `program_worthy=False`? Any POV variants you'd want to keep (e.g., incline bench vs flat bench are different exercises, not POV)?

4. **Helper activities:** Do you want `is_helper_activity` now, or later? What exercises count as helpers in your workouts?

5. **Implementation sequence:** Do P0 first (cleanup + sync), then P1 (helper flag), then P2 (progression architecture)? Or bundle P0+P1 together?

6. **ExerciseEntry override:** Should exercise entries have their own `is_compound` / `is_helper_activity` override, or always inherit from `ExerciseLibrary`?

7. **Template 5 (Chest):** DELETE ALL — 87 sessions over 5 years on an empty template when the user only started using this app 2 months ago is testing artifact. Clean slate.

8. **Exercise library source:** The library comes from ExerciseDB (seeded via `sync_exercise_library` endpoint). When we mark entries as `program_worthy=False`, will a re-sync overwrite our changes? Need to check if sync preserves manual edits.
