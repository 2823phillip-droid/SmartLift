# Exercise Library Cleanup — Investigation

**Date:** 2026-09-27
**Status:** Ready for review

## Current state

### Library
- **1384 total exercises** in `exercise_library`
- **542 compound** / **842 isolation** (classified by `classify_exercises.py`)
- **1381 (99.8%) never referenced** by any exercise entry
- Only 3 library entries are linked to actual exercise entries:
  - `3/4 sit-up` (id=1, isolation, waist)
  - `45° side bend` (id=2, isolation, waist)
  - `band single leg calf raise` (id=78, isolation, lower legs)

### Exercise entries (in templates)
- **5 exercise entries** across 10 templates
- **3 unique names** (3/4 sit-up appears in 2 templates, band single leg calf raise in 1)
- **0 set logs** — no workout sessions have been logged yet
- Most templates (7 of 10) have 0 exercises — they were created but never populated

### Duplicates (same exercise, different POV/gif)
ExerciseDB stores multiple camera-angle variants as separate entries with `similar_exercises` JSON linking them. Example — sled 45° leg press family (6 entries):
- `sled 45° leg press` (id=1154) — main/front view
- `sled 45° leg press (back pov)` (id=1155) — same exercise, back view
- `sled 45° leg press (side pov)` (id=1156) — same exercise, side view
- `sled 45° leg wide press` (id=1157) — same machine, wider stance
- `sled 45 degrees one leg press` (id=1152) — single-leg variant
- `sled 45° calf press` (id=1153) — different movement (calves, not legs)

The `similar_exercises` field on each entry lists the canonical version with score 100.0 and the POV variants as "same_equipment_alternative" with score 100.0. This is our dedup key — we can use it to collapse POV duplicates.

### Other duplicate groups (from earlier scan)
64 groups of near-duplicate names. Most are:
- POV variants: "v.2", "v.3", "(back pov)", "(side pov)", "(on stability ball)"
- Gender variants: "(male)", "(female)" — same exercise
- Minor equipment variations: "(with towel)", "(with rope attachment)", "(with arm blaster)"
- Spelling/naming variants: "step up lunge" vs "step-up lunge", "close grip press" vs "close-grip press"

## Problem

When building a workout, you're searching through 1384 exercises to find the handful you'd actually use. Most are:
- POV duplicates of exercises you already have
- Obscure variations you'd never pick (e.g., "assisted prone hamstring", "arms apart circular toe touch")
- Bodyweight/calisthenics exercises that don't match your training style
- Exercises for equipment you don't have

This makes the exercise picker useless — too much noise.

## Proposed approach

### Phase 1: Mark unused as non-program-worthy (safe, reversible)
Set `program_worthy=False` on all library entries that are not referenced by any exercise entry AND not in a "keep" list.

This hides them from the exercise search/picker without deleting data. If you later want an exercise back, you set `program_worthy=True` on it.

**Start with a "keep" list** of exercises that are:
- Already referenced by your exercise entries (3 entries)
- Common compound lifts you'd realistically use
- Common isolation exercises for your muscle groups

### Phase 2: Collapse POV duplicates
For each group of POV variants (identified by `similar_exercises` or name patterns like "(back pov)", "(side pov)", "v.2"):
- Keep the canonical/main version
- Mark the POV variants as `program_worthy=False`

This cuts the library significantly without losing exercise variety.

### Phase 3: User review of remaining library
After phases 1-2, the library should be a manageable size (probably 100-200 exercises). You review the remaining ones and mark any you'd never use as `program_worthy=False`.

## What "keep" might look like

### Compounds (default keep)
- All barbell/dumbbell/kettlebell/multi-joint versions of:
  - Squat variants (back squat, front squat, goblet, hack, split, lunge, step-up)
  - Deadlift variants (conventional, Romanian, stiff-leg, trap bar, rack pull, good morning)
  - Bench press variants (flat, incline, decline, close-grip)
  - Overhead press variants (standing, seated, dumbbell press, Arnold press)
  - Pull-up / chin-up variants
  - Row variants (bent-over, pendlay, cable, machine, dumbbell)
  - Dips (chest/triceps)
  - Hip thrust / glute bridge (barbell)
  - Power clean / power snatch (if you want Olympic lifts)

### Isolations (select by muscle group)
- **Chest:** cable fly, dumbbell fly, pec deck, cable crossover
- **Back:** pullover, face pull, reverse fly, shrugs
- **Shoulders:** lateral raise, front raise, rear delt fly, upright row
- **Biceps:** all curl variants (barbell, dumbbell, cable, machine, hammer, concentration, preacher)
- **Triceps:** pushdown, skull crusher, overhead extension, kickback
- **Legs:** leg extension, leg curl, calf raise (all variants), hip abduction/adduction
- **Core:** cable crunch, weighted crunch, hanging leg raise, ab rollout, russian twist, plank variations

### Probably exclude by default
- Bodyweight/calisthenics that aren't in your style (push-up variants beyond basic, plyometrics, cardio)
- Stretching/mobility (these are warm-up, not workout exercises — handled by `is_helper_activity` if we add it)
- Obscure machines/exercises for equipment you don't have
- Highly specific variations you'd never program

## Questions for you

1. **Keep vs hide:** Do you want to hide the unused 1381 entries entirely (set `program_worthy=False`) or delete them? Hide is safer — reversible. Delete is permanent.

2. **POV duplicates:** Should we collapse the POV variants (back pov, side pov, v.2) to just the main entry? Or keep a few for exercises where the angle matters (e.g., incline bench vs flat bench are different exercises, not POV variants)?

3. **"Keep" list:** Does the compound/isolation list above look right as a starting point, or would you cut more/less? 

4. **Helper activities:** Separate from this — do you want a `is_helper_activity` flag for warm-ups, mobility, activation, band walks, etc. that show up in a workout but don't get reps targets or progression? This is a different cleanup concern.

5. **Template cleanup:** Most of your 10 templates are empty. Want to clean those up too, or leave them for now?
