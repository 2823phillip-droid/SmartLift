---
last_updated: 2026-10-15
created: 2026-10-15
tags: [progression, architecture, glossary, reference]
related: progression_tasks.md, decisions.md
---

# Progression System Glossary

This document clarifies the progression system architecture. The key insight: **logical components are separate, but physically co-located in one file.**

---

## FILE: `backend/progression.py`

**What it is:** A single Python file containing all progression logic.

**Why one file:** Convenience — all progression-related code in one place. Makes it easy to see the full picture.

**What it contains:**
- Model classes (FoundationModel, LinearModel, HypertrophyModel, etc.)
- `model_picker` function
- Helper functions (`_get_top_set`, `_effective_increment`, etc.)
- Constants (`BLOCK_REP_TARGETS`, etc.)

**Rule:** When reading progression.py, mentally separate the logical components even though they're in the same file.

---

## FUNCTION: `model_picker`

**Location:** `backend/progression.py` (near the bottom, ~line 3269)

**Role:** Model selector and proxy.

**What it does:**
1. Determines which model to use based on `block_mode`
2. Instantiates that model class
3. Calls the model's `compute()` method
4. Returns the model's prescription

**Signature:**
```python
def model_picker(
    exercise: dict,
    history: list,
    block_state: dict | None = None,
    *,
    block_mode: str = None,
    week_number: int = 1,
    reps_target: int | None = None,
    increment: int | None = None,
    is_set_target: bool = False,
) -> dict:
```

**Key insight:** `model_picker` does NOT contain progression logic. It's a thin wrapper that delegates to the model.

**Analogy:** Think of `model_picker` as a receptionist who routes your call to the right department. The receptionist doesn't solve your problem — they connect you to someone who does.

---

## MODEL CLASSES

**Location:** `backend/progression.py` (spread throughout the file, each class is a separate section)

**Role:** Each model contains its own progression logic.

**What they do:**
- Implement block-specific progression rules
- Calculate `next_weight`, `next_reps`, `should_increase`, etc.
- Generate `coaching_message` and `block_name`

**Current models:**
| Model | Block Mode | Purpose |
|-------|------------|---------|
| `FoundationModel` | `foundation` | Form, slow eccentrics, no max effort, 8-10 reps |
| `LinearModel` | `linear_baseline` | Linear progression for beginners |
| `HypertrophyModel` | `hypertrophy` | Volume focus, 10-12 reps, double progression |
| `StrengthAModel` | `strength_a` | Strength phase A |
| `StrengthBModel` | `strength_b` | Strength phase B |
| `MaintenanceModel` | `maintenance` | Deload, RPE 5, -20% load |

**Each model's `compute()` method:**
```python
def compute(
    self,
    exercise: dict,
    history: list,
    block_state: dict | None = None,
    *,
    block_mode: str,
    week_number: int = 1,
    reps_target: int | None = None,
    increment: int | None = None,
    context: dict | None = None,
) -> dict:
```

**Returns:**
```python
{
    "suggested_weight": float,
    "rep_floor": int,
    "rep_cap": int,
    "coaching_message": str,
    "block_name": str,
    "should_increase": bool,
    "increment": int,
    "next_reps": int,  # May or may not be present
}
```

---

## ENDPOINTS THAT USE THE PROGRESSION SYSTEM

### `POST /api/progression/calculate`

**File:** `backend/main.py`

**Purpose:** Get updated prescription after logging a set.

**Flow:**
1. Receives `exercise_library_id`, `session_id`, `prev_set_data`
2. Fetches exercise from DB
3. Fetches history (set logs) from DB
4. Fetches block_state from DB
5. Calls `model_picker(exercise_dict, history, block_state_dict, ...)`
6. Returns prescription

**Key parameters passed to model_picker:**
- `exercise_dict` — exercise data (id, name, is_compound, etc.)
- `history` — list of set logs (most recent first)
- `block_state_dict` — {block_mode, week_number}
- `reps_target` — from BLOCK_REP_TARGETS (rep_floor or rep_cap depending on compound)
- `increment` — from BLOCK_REP_TARGETS

### `POST /api/coach/session-targets`

**File:** `backend/main.py`

**Purpose:** Get initial prescription when starting a workout.

**Flow:**
1. Receives `session_id`
2. Fetches workout session from DB
3. For each exercise in the session template:
   - Fetches exercise from DB
   - Fetches history (set logs) from DB (across ALL completed sessions)
   - Calls `model_picker(exercise, history, block_mode, week_number, reps_target, increment)`
   - Returns prescription

**Key difference from calculate:** Session targets fetches history across ALL completed sessions, not just the current session. This is so it can find the most recent completed session for each exercise.

---

## KEY CONCEPTS

### `block_mode`

**What:** The current progression "lane" the user is in.

**Values:** `foundation`, `linear_baseline`, `hypertrophy`, `strength_a`, `strength_b`, `maintenance`

**Where stored:** `BlockState` table in DB (user_id, block_mode, week_number, start_date)

**How used:** `model_picker` uses `block_mode` to determine which model class to instantiate.

### `history`

**What:** List of past set logs for an exercise.

**Format:**
```python
[
    {
        "actual_weight": 120.0,
        "actual_reps": 8,
        "effort": 7,
        "form_quality": 0,
        "completed_at": "2026-09-11T10:47:33.624405+00:00",
    },
    ...
]
```

**Ordering:** Most recent first (from DB query: `order_by(SetLog.completed_at.desc())`)

**Where used:** Passed to model's `compute()` method. Model uses `_get_top_set(history)` to get the most recent set.

### `BLOCK_REP_TARGETS`

**What:** Dictionary mapping block_mode to rep targets and increment.

**Location:** `backend/progression.py`

**Structure:**
```python
BLOCK_REP_TARGETS = {
    "foundation": {
        "rep_floor": 8,
        "rep_cap": 10,
        "increment": 5,
        ...
    },
    "hypertrophy": {
        "rep_floor": 10,
        "rep_cap": 12,
        "increment": 3,
        ...
    },
    ...
}
```

**How used:** Endpoints use `BLOCK_REP_TARGETS` to determine `reps_target` and `increment` to pass to `model_picker`.

### `reps_target`

**What:** The rep target to pass to the model.

**How determined:**
```python
reps_target = exercise.is_compound and preset.get("rep_cap", 8) or preset.get("rep_floor", 8)
```

- Compound exercises: use `rep_cap` (top of range)
- Isolation exercises: use `rep_floor` (bottom of range)

**Why:** Compounds are expected to work at the top of the rep range; isolations at the bottom.

### `increment`

**What:** Weight increment to add when progressing.

**How determined:** `preset.get("increment", 5)`

**Default:** 5 lbs

**Per model:**
- Foundation: 5 lbs
- Hypertrophy: 3 lbs
- etc.

---

## ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    frontend (React/TypeScript)                   │
│  ActiveWorkoutScreen.logSet() → POST /api/progression/calculate │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    backend (FastAPI)                             │
│  calculate endpoint (main.py)                                   │
│  1. Fetch exercise, history, block_state from DB                │
│  2. Build exercise_dict, history list, block_state_dict         │
│  3. Call model_picker(exercise_dict, history, ...)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    backend/progression.py                        │
│  model_picker(block_mode, exercise, history, reps_target, ...) │
│  1. Determine model class from block_mode                      │
│  2. Instantiate model (e.g., FoundationModel())                │
│  3. Call model.compute(exercise, history, ...)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    backend/progression.py                        │
│  FoundationModel.compute(exercise, history, ...)               │
│  1. Get top set from history (_get_top_set)                    │
│  2. Apply Foundation-specific logic                           │
│  3. Return prescription dict                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    backend (FastAPI)                             │
│  calculate endpoint                                             │
│  Return prescription as JSON response                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    frontend (React/TypeScript)                   │
│  ActiveWorkoutScreen.logSet()                                   │
│  1. Receive prescription from calculate endpoint               │
│  2. Update prescriptions state with new weight/reps            │
│  3. Render next set with updated prescription                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## COMMON POINTS OF CONFUSION

### "Is model_picker the model?"

No. `model_picker` is a function that SELECTS and delegates to the model. The model is the class (e.g., `FoundationModel`) that contains the actual progression logic.

### "Why are they in the same file?"

Convenience. All progression logic in one place. When debugging, you can see the full picture without jumping between files.

### "What's the difference between calculate and session-targets?"

- **calculate:** Called AFTER logging a set. Gets updated prescription for the NEXT set. Uses history from current session + previous sessions.
- **session-targets:** Called WHEN STARTING a workout. Gets initial prescription for Set 1. Uses history from ALL completed sessions to find the most recent baseline.

### "What does _get_top_set do?"

Returns the most recent set from history. Used by models to determine the baseline weight/reps for progression calculations.

**Bug that was fixed:** Was returning `history[-1]` (oldest set). Now returns `history[0]` (most recent set).

### "Why does Set 1 sometimes not get an increment?"

The model's logic: add increment only if previous session's last set reps >= current model's rep_cap.

Example:
- Previous session: 115×8 (8 reps)
- Current model: Foundation (rep_cap=10)
- 8 < 10, so no increment. Set 1 = 115.

This is the model's autoregulated progression logic. It only increases weight if you demonstrated you can handle the current weight (by hitting the rep cap).

---

## FILE LOCATIONS

| Component | File | Line (approx) |
|-----------|------|---------------|
| `model_picker` | `backend/progression.py` | 3269 |
| `FoundationModel` | `backend/progression.py` | 2682 |
| `LinearModel` | `backend/progression.py` | (search for `class LinearModel`) |
| `HypertrophyModel` | `backend/progression.py` | (search for `class HypertrophyModel`) |
| `_get_top_set` | `backend/progression.py` | 2503 |
| `_effective_increment` | `backend/progression.py` | 2465 |
| `BLOCK_REP_TARGETS` | `backend/progression.py` | (search for `BLOCK_REP_TARGETS =`) |
| `calculate` endpoint | `backend/main.py` | 2420 |
| `session_targets` endpoint | `backend/main.py` | 3820 |
