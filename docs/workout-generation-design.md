# Workout Generation Design

## 1. Questionnaire Input Space

### Fixed inputs
- `days_per_week`: 2, 3, 4, 5, 6
- `minutes_per_session`: 20, 30, 45, 60
- `focus`: `body_part_split`, `full_program`, `upper_lower`, `push_pull_legs`
- `workout_modality`: `traditional_weight_training`, `bodybuilding`, `powerlifting`, `hiit`, `cardio`
- `modality_secondary`: multi-select, `cardio`, `hiit`, `none`
- `cardio_timing`: `part_of_workout`, `separate_day`
- `cardio_type`: multi-select, `steady_state`, `hiit`, `distance`, `walking`
- `cardio_days_per_week`: 1–7 (only when `cardio_timing == separate_day`)
- `equipment`: multi-select, `barbell`, `dumbbells`, `cable`, `machines`, `resistance_bands`, `bodyweight`, `kettlebells`
- `limitations`: multi-select or none
- `experience`: `beginner`, `intermediate`, `advanced`

## 2. Session Structure by Time Budget

Available minutes = `minutes_per_session`

### <= 30 min
- Warmup: 0 min (assumed)
- Strength: 1 compound + 1 accessory, 2–3 sets
- Cardio finisher: 5–10 min if selected
- Total exercises: 2–3 + optional cardio

### 30–45 min
- Strength: 2–3 compounds + 1–2 accessories, 3 sets
- Cardio finisher: 5–10 min if selected
- Total exercises: 3–5 + optional cardio

### 45–60 min
- Strength: 3–4 compounds + 2–3 accessories, 3–4 sets
- Cardio finisher: 10–15 min if selected
- Total exercises: 5–7 + cardio

### > 60 min (future)
- Volume up: +1 accessory, +1 set per exercise
- Optional second finisher block

## 3. Weekly Split Templates by Focus

### body_part_split (5 days)
1. Chest & Triceps
2. Back & Biceps
3. Shoulders
4. Legs & Core
5. Arms

6-day variant: repeat weakest body part (usually Arms or Legs) as Day 6
4-day variant: combine Arms into Chest/Back days or drop Arms day

### full_program (2–3 days)
Full body each day, different emphasis per day

### upper_lower (4 days)
1. Upper A
2. Lower A
3. Upper B
4. Lower B

### push_pull_legs (6 days)
1. Push A
2. Pull A
3. Legs A
4. Push B
5. Pull B
6. Legs B

## 4. Cardio Placement Rules

### part_of_workout
- Each lifting day gets a cardio finisher block at the END
- Duration: 10 min (<=30 sessions), 15 min (>30 sessions)
- Type: first choice from `cardio_type`; fall back to walking if none selected
- Run/walk alternation: if user has running in cardio_type, alternate run/walk across days; default to walking if only walking selected

### separate_day
- Lifting days: NO cardio
- Dedicated cardio days added to week schedule
- Cardio day structure: single modality, single duration block
- Cardio session length: user-selected `cardio_session_minutes`
- Default cardio day count: 2 if unset; cap at `days_per_week` so total days ≤7

## 5. Day Template Format

Each day template is a list of **Slots**.

```python
class SlotSpec:
    name: str
    movement_pattern: List[str]   # e.g. ["push_flat", "pull_row", "hinge"]
    count: Tuple[int, int]         # min, max exercises for this slot
    equipment_preference: Optional[str]  # preferred equipment family
    set_target: Tuple[int, int]
    rep_target: Tuple[int, int]
    rest_seconds: int
    muscle_groups: List[str]
```

## 6. Body Part Split Day Templates

### Chest & Triceps
```
Chest Compound (flat)      1-2  barbell   4x6-8   150s
Chest Compound (incline)   1-2  dumbbell  3x8-10  90s
Chest Isolation            1-2  cable     3x10-12 60s
Tricep Compound            1-2  cable     3x8-10  90s
Tricep Isolation            2-3  cable     3x10-12 60s
Cardio Finisher             1   any       1x10-15 0s
```
Total: 5–7 exercises + cardio

### Back & Biceps
```
Back Compound (vertical)   1-2  cable     4x6-8   120s
Back Compound (horizontal)  1-2  barbell  4x6-8   120s
Back Accessory              1-2  cable     3x8-10  75s
Bicep Compound              1-2  barbell  3x8-10  90s
Bicep Isolation              2-3  dumbbell 3x10-12 60s
Cardio Finisher             1   any       1x10-15 0s
```
Total: 5–7 exercises + cardio

### Shoulders
```
Overhead Press              1-2  barbell  4x6-8   120s
Lateral Raise               2-3  dumbbell 3x10-12 75s
Rear Delt                   2-3  dumbbell 3x10-12 75s
Front Delt                  1-2  dumbbell 3x10-12 75s
Traps / Upper Back          1-2  barbell  3x8-10  90s
Cardio Finisher             1   any       1x10-15 0s
```
Total: 5–7 exercises + cardio

### Legs & Core
```
Primary Squat               1-2  barbell  4x6-8   150s
Hip Hinge                   1-2  barbell  3x8-10  120s
Leg Accessory (quad)        1-2  machine  3x10-12 90s
Leg Accessory (hamstring)   1-2  machine  3x10-12 90s
Calf / Tibial               1-2  machine  3x12-15 60s
Core                        1-2  bodyweight 3x10-15 60s
Cardio Finisher             1   any       1x10-15 0s
```
Total: 5–7 exercises + cardio

### Arms
```
Tricep Compound              1-2  barbell  3x8-10  90s
Tricep Isolation            2-3  cable     3x10-12 60s
Bicep Compound              1-2  barbell  3x8-10  90s
Bicep Isolation              2-3  dumbbell 3x10-12 60s
Forearm / Grip              1-2  dumbbell 3x10-12 60s
Cardio Finisher             1   any       1x10-15 0s
```
Total: 5–7 exercises + cardio

## 7. Slot-to-Exercise Mapping Rules

For each slot, exercises are chosen in this priority order:

1. Match movement pattern exactly
2. Match equipment preference if possible
3. Avoid duplicate movement pattern within same day
4. Avoid excessive overlap in secondary muscles (e.g., don’t pick 3 chest compounds + 1 tricep compound + 1 tricep isolation + 1 tricep isolation)
5. Prefer tier-1 canonical exercises when available
6. Exclude `automated=False` exercises from auto-selection

### Movement Patterns
- `push_flat`: flat bench press variants
- `push_incline`: incline press variants
- `push_vertical`: overhead press variants
- `push_isolation`: chest flyes, tricep extensions, lateral raises
- `pull_vertical`: pulldowns, pull-ups
- `pull_horizontal`: rows
- `pull_isolation`: bicep curls, rear delt raises
- `hinge`: deadlifts, RDLs, glute bridges
- `squat`: squat variants, leg press, lunges
- `leg_quad`: leg extensions, sissy squats
- `leg_hamstring`: leg curls, RDLs
- `leg_calf`: calf raises
- `core`: ab exercises
- `tricep_compound`: close-grip press, dips
- `tricep_isolation`: pushdowns, extensions, skull crushers
- `bicep_compound`: rows, pull-ups (secondary bicep)
- `bicep_isolation`: curls
- `shoulder_overhead`: overhead press variants
- `shoulder_lateral`: lateral raises
- `shoulder_rear`: rear delt work
- `shoulder_front`: front raises
- `trap_upper_back`: shrugs, upright rows, rear delt rows

## 8. Time-Based Volume Scaling

### 20 min session
- Max 3 slots + optional cardio
- Each slot: 1 exercise, 2 sets
- Cardio: 5 min

### 30 min session
- Max 4 slots + optional cardio
- Each slot: 1 exercise, 2–3 sets
- Cardio: 5–10 min

### 45 min session
- Max 5–6 slots + cardio
- Each slot: 1 exercise, 3 sets
- Cardio: 10–15 min

### 60 min session
- All slots filled, 3–4 sets
- Cardio: 15 min

Slot selection is truncated from the template based on time. Lower-body days keep squat/hinge/core even if slots must be cut.

## 9. Cardio Type Mapping

- `steady_state`: treadmill run/walk, bike, elliptical, rowing
- `walking`: treadmill walk, brisk walk
- `hiit`: sprint intervals, circuit intervals
- `distance`: longer steady-state run (future: 5k/10k progression)

When `part_of_workout`:
- Cardio finisher = steady-state by default
- Alternate run/walk across week if both available
- HIIT cardio = 10 min interval block instead of steady-state

When `separate_day`:
- Cardio day = single modality matching preference
- Distance training = steady-state at user’s selected distance pace

## 10. Equipment Handling

Missing equipment → substitute from available list:
- No barbell → dumbbell or machine variant
- No dumbbells → barbell or machine or bodyweight
- No cable → dumbbell or machine
- No machines → barbell, dumbbell, bodyweight, cable

Substitution priority: barbell → dumbbell → cable → machine → bodyweight → bands

## 11. Limitation Handling

- `Shoulder Issues`: avoid behind-neck press, upright rows, overhead tricep extensions; replace with safer variants
- `Knee Issues`: avoid deep squats, leg extensions, walking lunges; replace with leg press, RDL, hip thrusts
- `Back Issues`: avoid bent-over rows, deadlifts, good mornings; replace with machine rows, chest-supported rows, partial deadlifts
- `Wrist Issues`: avoid barbell curls, close-grip bench; replace with dumbbell or machine variants
- `Limited Mobility`: avoid overhead press behind head, deep squats; reduce range-of-motion variants
- `High-Impact Aversion`: avoid running, jumping; walking or bike only

## 12. Implementation Order

1. Fix `cardio_timing` handling: part_of_workout inserts cardio finisher into each lifting day
2. Redesign slot specs for each body part day (replace generic push/pull with specific movement patterns)
3. Build slot-to-exercise mapper with pattern matching and equipment preference
4. Add volume scaler based on `minutes_per_session`
5. Add day type rotation for 5-day body part split
6. Add 4-day and 6-day variants
7. Add limitation substitution rules
8. Add equipment substitution rules
