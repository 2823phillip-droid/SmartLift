"""
progression.py

Deterministic workout-generation algorithms.
Each function takes a structured UserProfile and returns a workout draft.
No AI here — this is pure logic that the AI voice layer will wrap later.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from exercise_whitelist import _canonical_name, all_canonical_exercises
from sqlalchemy import or_
from sqlalchemy.orm import Session

from intake import UserProfile


# ---------------------------------------------------------------------------
# Exercise classification
# ---------------------------------------------------------------------------

# Keyword → movement pattern mapping
_KEYWORD_MOVEMENT: Dict[str, str] = {
    # Push
    "bench press": "push",
    "incline press": "push",
    "dumbbell press": "push",
    "chest fly": "push",
    "cable fly": "push",
    "overhead press": "push",
    "military press": "push",
    "arnold press": "push",
    "shoulder press": "push",
    "lateral raise": "push",
    "front raise": "push",
    "tricep": "push",
    "skull crusher": "push",
    "tricep pushdown": "push",
    "dip": "push",
    "push up": "push",
    "chest press": "push",
    "pec deck": "push",
    # Pull
    "pull-up": "pull",
    "chin-up": "pull",
    "barbell row": "pull",
    "dumbbell row": "pull",
    "bent over row": "pull",
    "seated row": "pull",
    "lat pulldown": "pull",
    "bicep": "pull",
    "barbell curl": "pull",
    "dumbbell curl": "pull",
    "hammer curl": "pull",
    "preacher curl": "pull",
    "face pull": "pull",
    "rear delt": "pull",
    "reverse fly": "pull",
    "shrug": "pull",
    "t-bar row": "pull",
    "cable row": "pull",
    "lat raise": "pull",
    "straight arm pulldown": "pull",
    # Plyo / Cardio (must come before squat/lunge so jump squat, etc. match first)
    "burpee": "plyometric",
    "box jump": "plyometric",
    "jump squat": "plyometric",
    "jump lunge": "plyometric",
    "jump rope": "cardio",
    "running": "cardio",
    "cycling": "cardio",
    "rowing": "cardio",
    "elliptical": "cardio",
    "stairmaster": "cardio",
    "battle rope": "cardio",
    "ski erg": "cardio",
    "assault bike": "cardio",
    # Squat
    "squat": "squat",
    "front squat": "squat",
    "goblet squat": "squat",
    "bulgarian split squat": "squat",
    "lunge": "squat",
    "reverse lunge": "squat",
    "leg press": "squat",
    "leg extension": "squat",
    "leg curl": "squat",
    "leg raise": "squat",
    "hip thrust": "squat",
    "step up": "squat",
    "wall sit": "squat",
    # Hinge
    "deadlift": "hinge",
    "romanian deadlift": "hinge",
    "rdl": "hinge",
    "good morning": "hinge",
    "hip thrust": "hinge",
    "glute bridge": "hinge",
    "kettlebell swing": "hinge",
    "back extension": "hinge",
    "hip abduction": "hinge",
    "calf raise": "hinge",
    "seated calf raise": "hinge",
    # Carry / Core
    "plank": "core",
    "crunch": "core",
    "sit-up": "core",
    "russian twist": "core",
    "mountain climber": "core",
    "ab wheel": "core",
    "hanging leg raise": "core",
    "flutter kick": "core",
    "dead bug": "core",
    "pallof press": "core",
    "farmer walk": "carry",
    "suitcase carry": "carry",
    # Yoga / Mobility
    "downward dog": "mobility",
    "warrior": "mobility",
    "sun salutation": "mobility",
    "cat cow": "mobility",
    "pigeon": "mobility",
    "hamstring stretch": "mobility",
    "hip flexor stretch": "mobility",
    "child pose": "mobility",
    "cobra": "mobility",
    "bridge": "mobility",
    "tree pose": "mobility",
    # Isometric
    "wall sit": "isometric",
    "plank": "isometric",
    "side plank": "isometric",
    "glute bridge hold": "isometric",
    "hollow body": "isometric",
    "l-sit": "isometric",
    "handstand": "isometric",
}

# Keyword → modality fitness ranking
_KEYWORD_MODALITY: Dict[str, float] = {
    # Powerlifting keywords
    "powerlift": 0.95,
    " squat": 0.9,
    "bench press": 0.9,
    "deadlift": 0.9,
    " competition": 0.85,
    " 1rm": 0.9,
    "max effort": 0.85,
    # Bodybuilding
    "curl": 0.8,
    "fly": 0.8,
    "raise": 0.75,
    "extension": 0.75,
    "pec": 0.8,
    "bicep": 0.8,
    "tricep": 0.8,
    "lateral raise": 0.8,
    "front raise": 0.8,
    "reverse fly": 0.8,
    "shrug": 0.75,
    "calf": 0.75,
    "isolation": 0.85,
    # HIIT
    "burpee": 0.95,
    "box jump": 0.9,
    "jump squat": 0.9,
    "jump lunge": 0.9,
    "mountain climber": 0.9,
    "battle rope": 0.9,
    "assault bike": 0.9,
    "sprint": 0.85,
    "interval": 0.85,
    "hiit": 0.95,
    "tabata": 0.95,
    "emom": 0.9,
    "amrap": 0.9,
    # Calisthenics
    "pull-up": 0.9,
    "chin-up": 0.9,
    "dip": 0.9,
    "push up": 0.85,
    "muscle up": 0.9,
    "handstand": 0.85,
    "l-sit": 0.85,
    "pistol squat": 0.85,
    "planche": 0.9,
    "front lever": 0.9,
    "back lever": 0.9,
    "bodyweight": 0.7,
    "calisthenics": 0.95,
    # Yoga / Mobility
    "yoga": 0.95,
    "downward dog": 0.9,
    "warrior": 0.9,
    "sun salutation": 0.9,
    "cat cow": 0.9,
    "pigeon": 0.9,
    "hamstring stretch": 0.85,
    "hip flexor stretch": 0.85,
    "child pose": 0.85,
    "cobra": 0.85,
    "tree pose": 0.85,
    "bridge": 0.85,
    "mobility": 0.8,
    "flexibility": 0.8,
    "flow": 0.75,
    "hold": 0.7,
    # Cardio
    "run": 0.9,
    "jog": 0.9,
    "sprint": 0.85,
    "cycling": 0.85,
    "spinning": 0.85,
    "rowing": 0.85,
    "elliptical": 0.8,
    "stairmaster": 0.85,
    "step": 0.75,
    "jump rope": 0.9,
    "cardio": 0.9,
    "hiit": 0.85,
    "zone": 0.7,
    "heart rate": 0.7,
}

# Keyword → difficulty
_KEYWORD_DIFFICULTY: Dict[str, str] = {
    "beginner": "beginner",
    "easy": "beginner",
    "basic": "beginner",
    "incline": "beginner",
    "assisted": "beginner",
    "kneeling": "beginner",
    "intermediate": "intermediate",
    "advanced": "advanced",
    "weighted": "advanced",
    "weighted pull-up": "advanced",
    "weighted dip": "advanced",
    "pistol": "advanced",
    "planche": "advanced",
    "front lever": "advanced",
    "back lever": "advanced",
    "muscle up": "advanced",
    "handstand": "advanced",
    "one arm": "advanced",
    "weighted": "advanced",
}

# Compound-first ordering within a movement bucket
_COMPOUND_RANK: Dict[str, int] = {
    "bench press": 1,
    "incline press": 2,
    "overhead press": 1,
    "barbell row": 1,
    "pull-up": 1,
    "squat": 1,
    "deadlift": 1,
    "leg press": 2,
    "dumbbell press": 2,
    "dumbbell row": 2,
    "lat pulldown": 2,
    "seated row": 2,
    "chest fly": 3,
    "lateral raise": 3,
    "bicep curl": 3,
    "tricep pushdown": 3,
    "leg extension": 3,
    "leg curl": 3,
    "calf raise": 3,
}


def _classify_exercise(ex: Any) -> Dict[str, Any]:
    name_lower = (ex.name or "").lower()
    equipment_lower = (ex.equipment or "").lower()
    muscle = ex.muscle_group or ""

    movement = "core"
    modality_score = 0.5
    difficulty = "intermediate"
    compound_rank = 99

    # Movement pattern from keywords
    for kw, mvm in _KEYWORD_MOVEMENT.items():
        if kw in name_lower:
            movement = mvm
            break

    # Modality fitness
    best_score = 0.0
    best_modality = "weight_training"
    for kw, score in _KEYWORD_MODALITY.items():
        if kw in name_lower or kw in equipment_lower:
            if score > best_score:
                best_score = score
                if "hiit" in kw or "tabata" in kw or "emom" in kw or "amrap" in kw:
                    best_modality = "hiit"
                elif "yoga" in kw or "mobility" in kw or "stretch" in kw or "flexibility" in kw or "flow" in kw or "hold" in kw:
                    best_modality = "yoga"
                elif "calisthenics" in kw or "pull-up" in kw or "chin-up" in kw or "dip" in kw or "push up" in kw or "muscle up" in kw or "handstand" in kw or "l-sit" in kw or "pistol" in kw or "planche" in kw or "lever" in kw:
                    best_modality = "calisthenics"
                elif "cardio" in kw or "run" in kw or "jog" in kw or "cycle" in kw or "row" in kw or "elliptical" in kw or "stair" in kw or "jump rope" in kw or "sprint" in kw or "zone" in kw or "heart rate" in kw:
                    best_modality = "cardio"
                elif "powerlift" in kw or " squat" in kw or "bench press" in kw or "deadlift" in kw or " 1rm" in kw or "max effort" in kw or " competition" in kw:
                    best_modality = "powerlifting"
                elif "curl" in kw or "fly" in kw or "raise" in kw or "extension" in kw or "pec" in kw or "bicep" in kw or "tricep" in kw or "isolation" in kw:
                    best_modality = "bodybuilding"
                elif "crossfit" in kw or "wod" in kw:
                    best_modality = "crossfit"
    modality_score = best_score

    # Difficulty
    for kw, diff in _KEYWORD_DIFFICULTY.items():
        if kw in name_lower:
            difficulty = diff
            break

    # Compound rank — prefer canonical tier when available
    _canon_hit = _canonical_name(ex.name)
    if _canon_hit and _canon_hit.tier <= 4:
        compound_rank = _canon_hit.tier
    else:
        for kw, rank in _COMPOUND_RANK.items():
            if kw in name_lower:
                compound_rank = rank
                break
        if compound_rank == 99 and movement in {"push", "pull", "squat", "hinge"}:
            compound_rank = 2
        if compound_rank == 99:
            compound_rank = 3

    return {
        "movement": movement,
        "modality_fit": best_modality,
        "modality_score": modality_score,
        "difficulty": difficulty,
        "compound_rank": compound_rank,
        "muscle_group": muscle,
        "equipment": ex.equipment,
        "gif_url": getattr(ex, "gif_url", None),
        "image_url": getattr(ex, "image_url", None),
    }


def _exercise_to_dict(ex: Any, sets_target: int, reps_target: int, rest_seconds: int, order: int, progression_type: str = "linear") -> dict:
    meta = _classify_exercise(ex)
    # Use canonical whitelist name when available
    canonical = _canonical_name(ex.name)
    display_name = canonical.name if canonical else ex.name
    return {
        "name": display_name,
        "muscle_group": ex.muscle_group,
        "equipment": ex.equipment,
        "sets_target": sets_target,
        "reps_target": reps_target,
        "start_weight": 0.0,
        "rest_seconds": rest_seconds,
        "order": order,
        "notes": None,
        "gif_url": meta["gif_url"],
        "image_url": meta["image_url"],
        "video_url": None,
        "movement_pattern": meta["movement"],
        "modality_fit": meta["modality_fit"],
        "difficulty": meta["difficulty"],
        "compound_rank": meta["compound_rank"],
        "progression_type": progression_type,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_equipment_map = {
    "bodyweight_only": ["body weight"],
    "dumbbells": ["dumbbell"],
    "barbell": ["barbell"],
    "machines": ["machine", "cable"],
    "resistance_bands": ["band"],
    "full_gym": ["barbell", "dumbbell", "machine", "cable", "body weight", "band"],
}

_limitation_excludes = {
    "shoulder_issues": ["overhead press", "upright row", "arnold press", "military press", "shoulder press"],
    "knee_issues": ["squat", "lunge", "leg press", "leg extension", "leg curl", "deadlift"],
    "back_issues": ["deadlift", "barbell row", "t-bar row", "romanian deadlift", "bent over row"],
    "wrist_issues": ["bench press", "bicep curl", "skull crusher", "tricep pushdown"],
    "limited_mobility": [],
    "high_impact_aversion": ["jump", "burpee", "lunge", "running"],
}

_goal_volume = {
    "strength": (3, 5, 3, 6),
    "hypertrophy": (3, 4, 8, 12),
    "endurance": (2, 3, 12, 20),
    "weight_loss": (3, 4, 10, 15),
    "mobility": (2, 3, 8, 12),
    "general_fitness": (2, 3, 8, 12),
}

# Experience → default progression type
_EXPERIENCE_PROGRESSION: Dict[str, str] = {
    "beginner": "linear",
    "intermediate": "double",
    "advanced": "percentage",
}

_focus_labels = {
    "full_body": "Full Body",
    "upper_lower_split": "Upper/Lower Split",
    "push_pull_legs": "Push/Pull/Legs",
    "cardio": "Cardio",
}

_modality_labels = {
    "traditional_weight_training": "Traditional Weight Training",
    "powerlifting": "Powerlifting",
    "bodybuilding": "Bodybuilding",
    "hiit": "HIIT",
    "calisthenics": "Calisthenics",
    "yoga": "Yoga / Mobility",
    "cardio": "Cardio",
    "crossfit": "CrossFit",
}


def _map_equipment(equipment_key: str) -> List[str]:
    return _equipment_map.get(equipment_key, [])


def _filter_exercises(db: Session, equipment_key: str, limitations: List[str], focus: str):
    """Returns (filtered_list, lower_split_list) where lower_split_list is only used by upper_lower_split."""
    allowed_equips = _map_equipment(equipment_key)
    from models import ExerciseLibrary
    q = db.query(ExerciseLibrary)

    if allowed_equips:
        conditions = []
        for ae in allowed_equips:
            conditions.append(ExerciseLibrary.equipment.ilike(f"%{ae}%"))
        q = q.filter(or_(*conditions))

    exercises = q.all()
    excluded_names = set()
    for lim in limitations:
        for keyword in _limitation_excludes.get(lim, []):
            excluded_names.add(keyword.lower())

    # Apply limitation exclusions
    filtered = [e for e in exercises if not any(kw in e.name.lower() for kw in excluded_names)]

    # Try to match canonical whitelist
    canonical_list = all_canonical_exercises()

    # Find exercises that match canonical entries
    canonical_matches = []
    name_to_ex = {e.name.lower().strip(): e for e in filtered}
    for canon in canonical_list:
        matched = None
        for kw in canon.match:
            lk = kw.lower().strip()
            if lk in name_to_ex:
                matched = name_to_ex[lk]
                break
        if not matched:
            for ex in filtered:
                if canon.name.lower() in ex.name.lower() or ex.name.lower() in canon.name.lower():
                    matched = ex
                    break
        if matched:
            matched._canonical_tier = canon.tier  # type: ignore[attr-defined]
            matched._canonical_name = canon.name   # type: ignore[attr-defined]
            canonical_matches.append(matched)

    # Deduplicate, preserving tier order
    seen_ids = set()
    unique_canonical = []
    for ex in sorted(canonical_matches, key=lambda e: getattr(e, "_canonical_tier", 99)):
        if ex.id not in seen_ids:
            seen_ids.add(ex.id)
            unique_canonical.append(ex)

    if focus == "upper_lower_split":
        upper = [e for e in filtered if e.muscle_group in ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Upper Arms", "Lower Arms"]]
        lower = [e for e in filtered if e.muscle_group in ["Legs", "Calves", "Core"]]
        return upper, lower

    # Use canonical matches as primary pool, fall back to filtered if too small
    if len(unique_canonical) >= 10:
        return unique_canonical, []
    return filtered, []


def _seed(profile: UserProfile) -> random.Random:
    base = f"{profile.focus}-{profile.days_per_week}-{profile.experience}-{profile.modality}-{profile.equipment}"
    return random.Random(hash(base) % 10000)


# ---------------------------------------------------------------------------
# Day builders per modality
# ---------------------------------------------------------------------------

def _build_traditional_weight_training(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Traditional weight training: compound → accessory → isolation, balanced movement patterns."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    sets_range = (base_sets, max_sets)
    reps_range = (base_reps, max_reps)

    # Cap exercises for quality
    target_exercises = min(target_exercises, 6)

    # Define day templates based on days_per_week
    if days <= 3:
        day_templates = ["full_body"] * days
    elif days == 4:
        day_templates = ["upper", "lower", "upper", "lower"]
    elif days == 5:
        day_templates = ["push", "pull", "legs", "upper", "lower"]
    else:
        day_templates = ["push", "pull", "legs", "push", "pull", "legs"]

    movement_buckets: Dict[str, List[Any]] = {"push": [], "pull": [], "squat": [], "hinge": [], "core": []}
    for ex in filtered:
        meta = _classify_exercise(ex)
        mv = meta["movement"]
        if mv in movement_buckets:
            movement_buckets[mv].append(ex)

    # For traditional weight training, remove non-weight-training movements
    if profile.modality == "traditional_weight_training":
        for mv in ["squat", "hinge", "core"]:
            movement_buckets[mv] = [e for e in movement_buckets.get(mv, []) if _classify_exercise(e)["movement"] not in {"plyometric", "cardio", "mobility"}]
        for mv in ["push", "pull"]:
            movement_buckets[mv] = [e for e in movement_buckets.get(mv, []) if _classify_exercise(e)["movement"] not in {"plyometric", "cardio", "mobility"}]

    for day_idx, template in enumerate(day_templates):
        if template == "full_body":
            # One compound from each major movement, then accessories
            day_exercises: List[Any] = []
            used_ids = set()
            for mv in ["push", "pull", "squat", "hinge"]:
                pool = movement_buckets.get(mv, [])
                if pool:
                    ranked = sorted(pool, key=lambda e: _classify_exercise(e)["compound_rank"])
                    unused = [e for e in ranked if e.id not in used_ids]
                    if unused:
                        # Always take the best compound for consistency
                        choice = unused[0]
                        day_exercises.append(choice)
                        used_ids.add(choice.id)
            # Fill remaining with accessories for variety
            remaining = target_exercises - len(day_exercises)
            if remaining > 0:
                accessory_candidates = []
                for mv in ["push", "pull", "squat", "hinge", "core"]:
                    bucket = movement_buckets.get(mv, [])
                    for e in bucket:
                        if e.id not in used_ids:
                            accessory_candidates.append(e)
                if accessory_candidates:
                    ranked_acc = sorted(accessory_candidates, key=lambda e: _classify_exercise(e)["compound_rank"])
                    # Pick from top 8 accessories for day-to-day variety
                    top_acc = ranked_acc[:min(8, len(ranked_acc))]
                    sample_size = min(remaining, len(top_acc))
                    picks = rng.sample(top_acc, sample_size)
                    day_exercises.extend(picks)
            ex_out = [_exercise_to_dict(e, rng.randint(*sets_range), rng.randint(*reps_range), rest, idx, progression_type) for idx, e in enumerate(day_exercises)]
            groups.append({"name": f"Full Body Day {day_idx + 1}", "exercises": ex_out})

        elif template in {"push", "pull", "legs", "upper", "lower"}:
            if template == "push":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] == "push"]
            elif template == "pull":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] == "pull"]
            elif template == "legs":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] in {"squat", "hinge", "core"}]
            elif template == "upper":
                pool = [e for e in filtered if _classify_exercise(e).get("movement") in {"push", "pull"}]
            else:
                pool = [e for e in filtered if _classify_exercise(e).get("movement") in {"squat", "hinge", "core"}]
            if not pool:
                pool = filtered
            # Compound-first ordering, take top exercises deterministically
            ranked = sorted(pool, key=lambda e: _classify_exercise(e)["compound_rank"])
            count = min(target_exercises, len(ranked))
            chosen = ranked[:count]
            ex_out = [_exercise_to_dict(e, rng.randint(*sets_range), rng.randint(*reps_range), rest, idx, progression_type) for idx, e in enumerate(chosen)]
            groups.append({"name": f"{template.title()} Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_powerlifting(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Powerlifting: only squat/bench/deadlift variations, heavy sets, low reps."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    lift_keywords = ["squat", "bench press", "deadlift", "press", "row"]
    main_lifts = [e for e in filtered if any(kw in e.name.lower() for kw in lift_keywords)]
    if not main_lifts:
        main_lifts = filtered[:3]

    # Sort by movement
    main_lifts.sort(key=lambda e: _classify_exercise(e)["movement"])

    for day_idx in range(days):
        lift = main_lifts[day_idx % len(main_lifts)]
        # 5 sets of 3-5 reps for main lift
        ex_out = [_exercise_to_dict(lift, 5, 5, 180, 0, progression_type)]
        # Add accessory work if we have room
        if target_exercises > 1:
            accessories = [e for e in filtered if e.id != lift.id][:target_exercises - 1]
            for i, acc in enumerate(accessories):
                ex_out.append(_exercise_to_dict(acc, 3, 8, 120, i + 1, progression_type))
        groups.append({"name": f"{_classify_exercise(lift)['movement'].title()} Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_bodybuilding(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Bodybuilding: higher volume, isolation work, pump-focused."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    sets_range = (base_sets, max_sets)
    reps_range = (base_reps, max_reps)

    if days <= 3:
        day_templates = ["full_body"] * days
    elif days == 4:
        day_templates = ["upper", "lower", "upper", "lower"]
    else:
        day_templates = ["push", "pull", "legs", "push", "pull", "legs"][:days]

    for day_idx, template in enumerate(day_templates):
        if template == "full_body":
            # Pick exercises from all movements, favor isolations
            pool = sorted(filtered, key=lambda e: _classify_exercise(e)["compound_rank"], reverse=True)
            chosen = rng.sample(pool, min(target_exercises, len(pool))) if len(pool) > target_exercises else pool
            groups.append({"name": f"Full Body Day {day_idx + 1}", "exercises": [_exercise_to_dict(e, rng.randint(*sets_range), rng.randint(*reps_range), rest, idx, progression_type) for idx, e in enumerate(chosen)]})
        elif template in {"push", "pull", "legs", "upper", "lower"}:
            if template == "push":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] == "push"]
            elif template == "pull":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] == "pull"]
            elif template == "legs":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] in {"squat", "hinge"}]
            elif template == "upper":
                pool = [e for e in filtered if _classify_exercise(e)["movement"] in {"push", "pull"}]
            else:
                pool = [e for e in filtered if _classify_exercise(e)["movement"] in {"squat", "hinge"}]
            if not pool:
                pool = filtered
            ranked = sorted(pool, key=lambda e: _classify_exercise(e)["compound_rank"], reverse=True)
            chosen = rng.sample(ranked, min(target_exercises, len(ranked))) if len(ranked) > target_exercises else ranked
            groups.append({"name": f"{template.title()} Day {day_idx + 1}", "exercises": [_exercise_to_dict(e, rng.randint(*sets_range), rng.randint(*reps_range), rest, idx, progression_type) for idx, e in enumerate(chosen)]})

    return groups


def _build_hiit(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """HIIT: timed intervals, plyometrics, high intensity."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    # Prefer plyometric and cardio exercises
    hiit_pool = [e for e in filtered if _classify_exercise(e)["movement"] in {"plyometric", "cardio", "core"}]
    if not hiit_pool:
        hiit_pool = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(hiit_pool))
        chosen = rng.sample(hiit_pool, count) if len(hiit_pool) > count else hiit_pool
        ex_out = []
        for idx, ex in enumerate(chosen):
            # HIIT: 3-4 sets, 8-15 reps (timed), 30-45s rest
            sets = rng.randint(3, 4)
            reps = rng.randint(8, 15)
            ex_out.append(_exercise_to_dict(ex, sets, reps, 30, idx, progression_type))
        groups.append({"name": f"HIIT Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_calisthenics(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Calisthenics: bodyweight progressions, holds, skill work."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    # Filter for calisthenics-friendly exercises
    cali_pool = [e for e in filtered if _classify_exercise(e)["modality_fit"] in {"calisthenics", "weight_training"}]
    if not cali_pool:
        cali_pool = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(cali_pool))
        chosen = rng.sample(cali_pool, count) if len(cali_pool) > count else cali_pool
        ex_out = []
        for idx, ex in enumerate(chosen):
            meta = _classify_exercise(ex)
            sets = rng.randint(3, 4)
            reps = rng.randint(8, 12)
            # Increase reps for beginner progressions
            if meta["difficulty"] == "beginner":
                reps = rng.randint(10, 15)
            ex_out.append(_exercise_to_dict(ex, sets, reps, 60, idx, progression_type))
        groups.append({"name": f"Calisthenics Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_yoga(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Yoga / Mobility: hold-based, flow sequences."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    yoga_pool = [e for e in filtered if _classify_exercise(e)["modality_fit"] in {"yoga", "mobility"}]
    if not yoga_pool:
        yoga_pool = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(yoga_pool))
        chosen = rng.sample(yoga_pool, count) if len(yoga_pool) > count else yoga_pool
        ex_out = []
        for idx, ex in enumerate(chosen):
            # Yoga: 2-3 sets, hold 30-60s per set
            sets = rng.randint(2, 3)
            reps = rng.randint(30, 60)
            ex_out.append(_exercise_to_dict(ex, sets, reps, 0, idx, progression_type))
        groups.append({"name": f"Yoga / Mobility Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_cardio(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """Cardio: zone-based, steady state or intervals."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    cardio_pool = [e for e in filtered if _classify_exercise(e)["modality_fit"] in {"cardio", "hiit"}]
    if not cardio_pool:
        cardio_pool = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(cardio_pool))
        chosen = rng.sample(cardio_pool, count) if len(cardio_pool) > count else cardio_pool
        ex_out = []
        for idx, ex in enumerate(chosen):
            sets = rng.randint(3, 5)
            reps = rng.randint(10, 20)
            ex_out.append(_exercise_to_dict(ex, sets, reps, 45, idx, progression_type))
        groups.append({"name": f"Cardio Day {day_idx + 1}", "exercises": ex_out})

    return groups


def _build_crossfit(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    base_sets: int,
    max_sets: int,
    base_reps: int,
    max_reps: int,
    rest: int,
    target_exercises: int,
    filtered: List[Any],
    lower: List[Any],
    progression_type: str = "linear",
) -> List[Dict[str, Any]]:
    """CrossFit: mixed-modal WODs, compound + cardio."""
    groups: List[Dict[str, Any]] = []
    days = min(profile.days_per_week, 6)

    compound = [e for e in filtered if _classify_exercise(e)["compound_rank"] <= 2]
    if not compound:
        compound = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(compound))
        chosen = rng.sample(compound, count) if len(compound) > count else compound
        ex_out = []
        for idx, ex in enumerate(chosen):
            sets = rng.randint(3, 5)
            reps = rng.randint(8, 15)
            ex_out.append(_exercise_to_dict(ex, sets, reps, 60, idx, progression_type))
        groups.append({"name": f"WOD Day {day_idx + 1}", "exercises": ex_out})

    return groups


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_workout(db: Session, profile: UserProfile) -> dict:
    """Build a deterministic workout plan from a UserProfile."""
    rng = _seed(profile)

    primary_goal = profile.goals[0] if profile.goals else "general_fitness"
    base_sets, max_sets, base_reps, max_reps = _goal_volume.get(primary_goal, _goal_volume["general_fitness"])

    if primary_goal in ["strength"]:
        rest = 150
    elif primary_goal in ["endurance", "weight_loss"]:
        rest = 45
    else:
        rest = 75

    target_exercises = max(3, min(8, profile.minutes_per_session // 8))
    progression_type = _EXPERIENCE_PROGRESSION.get(profile.experience, "linear")

    filtered, lower = _filter_exercises(db, profile.equipment, profile.limitations, profile.focus)
    if not filtered:
        filtered, _ = _filter_exercises(db, "bodyweight_only", [], profile.focus)

    # Route to modality-specific builder
    if profile.modality == "powerlifting":
        groups = _build_powerlifting(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "bodybuilding":
        groups = _build_bodybuilding(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "hiit":
        groups = _build_hiit(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "calisthenics":
        groups = _build_calisthenics(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "yoga":
        groups = _build_yoga(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "cardio":
        groups = _build_cardio(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "crossfit":
        groups = _build_crossfit(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)
    else:
        # Traditional weight training (default)
        groups = _build_traditional_weight_training(db, profile, rng, base_sets, max_sets, base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type)

    if not groups:
        groups.append({"name": "Full Body Day 1", "exercises": []})

    focus_label = _focus_labels.get(profile.focus, "Full Body")
    modality_label = _modality_labels.get(profile.modality, "Traditional Weight Training")

    return {
        "name": f"{modality_label} Plan",
        "description": f"{profile.days_per_week} days/week, {profile.minutes_per_session} min, {primary_goal}, {profile.experience}",
        "groups": groups,
    }


# Alias for backwards compatibility
def _generate_workout_draft(db: Session, profile: dict) -> dict:
    """Legacy wrapper so main.py still works during migration."""
    from intake import normalize_questionnaire
    p = normalize_questionnaire(profile) if isinstance(profile, dict) else profile
    return generate_workout(db, p)


# ---------------------------------------------------------------------------
# Nutrition (kept here to keep services thin)
# ---------------------------------------------------------------------------

def generate_meal_plan(profile: UserProfile) -> Optional[dict]:
    """Build a deterministic meal plan from a UserProfile."""
    if not profile.weight_kg or not profile.height_cm or not profile.sex or not profile.age_range:
        return None

    age_map = {
        "under_25": 22,
        "26-40": 33,
        "41-55": 48,
        "56+": 60,
    }
    age = age_map.get(profile.age_range, 33)

    # Mifflin-St Jeor
    if profile.sex == "male":
        bmr = (10 * profile.weight_kg) + (6.25 * profile.height_cm) - (5 * age) + 5
    elif profile.sex == "female":
        bmr = (10 * profile.weight_kg) + (6.25 * profile.height_cm) - (5 * age) - 161
    else:
        bmr = (10 * profile.weight_kg) + (6.25 * profile.height_cm) - (5 * age) - 50

    activity_mult = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    tdee = bmr * activity_mult.get(profile.activity_level, 1.2)

    primary_goal = profile.goals[0] if profile.goals else "general_fitness"
    if primary_goal in ["weight_loss"]:
        calories = int(tdee - 400)
    elif primary_goal in ["strength", "hypertrophy"]:
        calories = int(tdee + 200)
    else:
        calories = int(tdee)

    if primary_goal in ["strength", "hypertrophy"]:
        protein = int(2.0 * profile.weight_kg)
        carbs = int(4.0 * profile.weight_kg)
        fat = int(0.8 * profile.weight_kg)
    elif primary_goal in ["weight_loss", "endurance"]:
        protein = int(2.2 * profile.weight_kg)
        carbs = int(2.5 * profile.weight_kg)
        fat = int(0.8 * profile.weight_kg)
    else:
        protein = int(1.6 * profile.weight_kg)
        carbs = int(3.5 * profile.weight_kg)
        fat = int(0.9 * profile.weight_kg)

    meal_templates = {
        "omnivore": ["Oatmeal + eggs", "Chicken salad", "Rice + beef + veggies", "Greek yogurt + berries", "Salmon + quinoa"],
        "vegetarian": ["Oatmeal + milk", "Paneer salad", "Rice + lentils + veggies", "Greek yogurt + nuts", "Tofu stir-fry"],
        "vegan": ["Oatmeal + almond milk", "Lentil salad", "Rice + chickpeas + veggies", "Smoothie bowl", "Tofu + sweet potato"],
        "pescatarian": ["Oatmeal + eggs", "Fish salad", "Rice + shrimp + veggies", "Greek yogurt + berries", "Salmon + quinoa"],
        "keto_friendly": ["Eggs + avocado", "Chicken + leafy greens", "Salmon + asparagus", "Nuts + cheese", "Steak + butter veggies"],
        "paleo_friendly": ["Oatmeal + fruit", "Chicken + sweet potato", "Ground beef + veggies", "Nuts + dried fruit", "Fish + roasted veggies"],
    }
    pool = meal_templates.get(profile.diet_type, meal_templates["omnivore"])

    meals = max(1, min(6, profile.meals_per_day))
    days_out = []
    for d in range(7):
        day_meals = []
        for m in range(meals):
            day_meals.append(pool[(m + d) % len(pool)])
        days_out.append({"day": d + 1, "meals": day_meals})

    return {
        "calories": calories,
        "protein_g": protein,
        "carbs_g": carbs,
        "fat_g": fat,
        "diet_type": profile.diet_type,
        "days": days_out,
    }
