# Investigation: Exercise `is_compound` classification

**Date:** 2026-09-27
**Status:** Investigation in progress — no changes committed

## Problem statement

All exercises in the app defaulted to 6 reps and linear progression, regardless of whether they were compound lifts (squat, bench, deadlift) or isolation work (curls, raises, extensions). The intended behavior is:
- Compounds → 6-8 reps, linear progression
- Isolations → 8-12 reps, double progression

## Root cause

The `is_compound` column **did not exist** in the `exercise_library` database table. The Pydantic response schema `ExerciseLibraryOut` hardcoded `is_compound: bool = True` as a default, so every exercise was treated as compound regardless of what it actually was.

```python
# Before (main.py line 418):
is_compound: bool = True   # hardcoded default — always True

# After:
is_compound: Optional[bool] = None   # reads from DB column
```

## What was changed (in investigation)

### 1. `backend/models.py` — ExerciseLibrary model

**Change:** Added `is_compound` column to the SQLAlchemy model.

```python
# Added at line 141:
is_compound = Column(Boolean, default=True, nullable=False, index=True)
```

**Why:** The ORM model needs to map the new DB column so SQLAlchemy can read/write it.

**Rollback:** Remove the line. The column will still exist in the DB but the ORM will ignore it.

---

### 2. `backend/main.py` — ExerciseLibraryOut Pydantic schema

**Change:** Line 418, changed from `bool = True` to `Optional[bool] = None`.

```python
# Before:
is_compound: bool = True

# After:
is_compound: Optional[bool] = None
```

**Why:** With `from_attributes = True`, Pydantic reads from the DB column. The old `= True` default masked the missing column — even if the column existed with value `False`, Pydantic would still return `True` if the attribute wasn't set. Now it always reflects what's in the DB.

**Rollback:** Change back to `is_compound: bool = True`.

---

### 3. `backend/classify_exercises.py` — NEW FILE (classifier script)

**What:** A one-time Python script that:
1. Adds the `is_compound` column to the DB via raw SQL (`ALTER TABLE`) if it doesn't exist
2. Iterates over all 1384 exercises in `exercise_library`
3. Classifies each as compound or isolation using heuristics based on `name`, `muscle_group`, and `equipment`
4. Writes the result back to the DB

**Classification rules (summary):**
- **Isolation (is_compound=False):** cardio, stretching/mobility, waist/core/ab exercises, neck, calves, wrist/forearm, all biceps curls, all triceps extensions, lateral/front/rear delt raises, shrugs, face pulls, reverse flies, chest flyes, leg extensions, leg curls, hip abduction/adduction, calf raises, pec deck, cable crossover
- **Compound (is_compound=True, default):** squats, deadlifts, bench press, overhead press, rows, pull-ups, dips, lunges, leg press, clean/snatch/jerk, push-ups, hip thrusts (barbell)

**Result:** 542 compound / 842 isolation

**Rollback:** Delete the file. The DB column remains. To undo the classification, run `UPDATE exercise_library SET is_compound = 1` (resets everything to compound, which was the old behavior).

---

### 4. `backend/workout.db` — Database migration

**Change:** Two operations on the SQLite DB:
1. `ALTER TABLE exercise_library ADD COLUMN is_compound BOOLEAN DEFAULT 1` — adds the column
2. `UPDATE exercise_library SET is_compound = 0 WHERE <classification says isolation>` — 842 rows updated to `False`

**Current state:**
```
is_compound=0 (isolation): 842 exercises
is_compound=1 (compound):  542 exercises
```

**Rollback:** `UPDATE exercise_library SET is_compound = 1` — resets all to compound (old behavior). Then optionally `ALTER TABLE exercise_library DROP COLUMN is_compound` to remove the column.

**Note:** This DB file must be synced to the Mac via rsync, otherwise the Mac will have the old DB without the column.

**Mac DB state (verified):** The Mac's `workout.db` does **not** have the `is_compound` column yet. It needs to be synced from the Linux machine or migrated separately.

```bash
# Sync from Linux to Mac
rsync -av /home/phillip2823/workout-logger/backend/workout.db macbook:~/workout-logger/backend/workout.db
```

**Warning:** If the Mac has been running with the old code, its DB may have user data since the last sync. Check before overwriting.

---

## Response builders — current state

These are the backend endpoints that return exercise data to the frontend. They need to include `is_compound` from the linked `exercise_library`.

| Endpoint | Line | is_compound in response? |
|---|---|---|
| `GET /api/exercises` (list user's exercises) | 1308 | ✅ Yes — line 1327 pulls from `e.exercise_library.is_compound` |
| `GET /api/templates/{id}/exercises` | 1333 | ✅ Yes — line 1352 pulls from `e.exercise_library.is_compound` |
| `GET /api/exercise-library` (library search) | 1360 | ❌ **Missing** — does not include `is_compound` in `ExerciseLibraryOut` construction (lines 1366-1375) |
| `POST /api/exercises` (create) | 1274 | ⚠️ Returns raw `ExerciseEntry` — no `is_compound` from library (entry has no direct column) |
| `PUT /api/exercises/{id}` (update) | 1285 | ⚠️ Same as create — returns raw entity |
| Workout library / generation endpoints | ~4002+ | ❓ Not yet checked |

**Gap identified:** `search_exercise_library` (line 1360) doesn't pass `is_compound` to `ExerciseLibraryOut`. When the app searches the library to add an exercise, it won't know if it's compound or isolation.

---

## Frontend — current state

### API types (`frontend/src/api.ts`)

- `RuleRequestIn.is_compound?: boolean` — line 456 — already exists, optional
- `ExerciseEntryOut` type — needs verification that it has `is_compound`

### ActiveWorkoutScreen.tsx — how `is_compound` is used

The frontend already has the logic to use `is_compound` for reps targets. Multiple spots use:

```typescript
reps_target: target.is_compound ? 6 : 8
```

Found at lines: 225, 354, 417, 426, 521, 531, 731, 746, 860, 868

Also used for `is_compound` prop passthrough: lines 361, 434, 539, 739, 868

**Key question:** Where does `exercise.is_compound` come from on the frontend? It should come from the `GET /api/templates/{id}/exercises` response. If that response now includes `is_compound` (which it does — line 1352), and the frontend `ExerciseEntryOut` type includes it, then the fix should flow through automatically once the backend is deployed.

---

## What still needs investigation

1. **Frontend TypeScript types** — Does `ExerciseEntryOut` in `frontend/src/types.ts` (or wherever it's defined) have `is_compound?: boolean`? If not, TypeScript will ignore it even if the API returns it.

2. **`search_exercise_library` response gap** — Line 1360 builder doesn't include `is_compound`. Need to decide if this matters (it's used when adding exercises from the library picker).

3. **Workout generation / library endpoints** — Lines ~4002+ (`WorkoutLibraryExerciseOut`) not yet checked.

4. **Mac DB sync** — The Mac has its own `workout.db`. The column + classification needs to be synced there, or the Mac will behave differently.

5. **`ExerciseEntry` model** — Does `ExerciseEntry` (the workout template exercise) have its own `is_compound`? Currently it doesn't — it gets it from the linked `exercise_library`. This means if an exercise entry is created without linking to the library, it defaults to compound. Should exercise entries carry their own `is_compound` override?

---

## Decision points (not yet resolved)

1. **Should exercise entries store their own `is_compound`**, or always inherit from `exercise_library`? Currently they inherit. If a user manually changes an exercise's classification, where does that live?

2. **`search_exercise_library` gap** — Is it important that the library search returns `is_compound`? When you add an exercise from the library, does the app immediately use `is_compound` for reps targets, or does it wait until the exercise is in a template?

3. **Reps target default** — The frontend currently uses `is_compound ? 6 : 8` as the reps target default. The discussion was that isolations should target 8-12 (double progression). Is `8` the right default, or should it be higher (10-12)?

4. **Classifier review** — The 842 isolation classifications haven't been manually spot-checked beyond the ~30 exercises we verified. There may be misclassifications in the long tail (e.g., "barbell bent arm pullover" classified as isolation — debatable).

---

## How to test after deployment

1. Open the app, load a workout with mixed compound + isolation exercises
2. Check that compounds show "6 reps" target and isolations show "8 reps" target
3. Verify the classification is reflected in the exercise detail / library picker
4. Check that progression type defaults correctly (linear for compounds, double for isolations)
