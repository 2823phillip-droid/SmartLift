"""
progression.py

Deterministic workout-generation algorithms.
Uses slot-based templates for weight training days, with curated exercise pools.
No AI here — this is pure logic that the AI voice layer will wrap later.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
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
# Slot-based template system
# ---------------------------------------------------------------------------

@dataclass
class SlotSpec:
    """Defines one exercise slot within a day template."""
    slot_id: str
    label: str
    movements: List[str]          # e.g., ["push"]
    tier_range: Tuple[int, int]   # (min_tier, max_tier)
    equipment: Optional[str] = None  # preferred equipment class
    count: int = 1                # how many exercises to pick for this slot
    sets_range: Tuple[int, int] = (3, 4)
    reps_range: Tuple[int, int] = (8, 12)
    rest_seconds: int = 75


@dataclass
class DayTemplate:
    """A pre-built workout day template with slots."""
    name: str
    description: str
    slots: List[SlotSpec]


# ---------------------------------------------------------------------------
# Day templates
# ---------------------------------------------------------------------------

_CHEST_DAY = DayTemplate(
    name="Chest Day",
    description="2 heavy compounds + 2 accessories + 1 isolation",
    slots=[
        SlotSpec("compound_1", "Heavy Compound", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("compound_2", "Second Compound", ["push"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("accessory_1", "Accessory", ["push"], (3, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("accessory_2", "Accessory / Isolation", ["push"], (3, 4), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("isolation_1", "Isolation", ["push"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_BACK_DAY = DayTemplate(
    name="Back Day",
    description="Vertical pull + horizontal pull + row + accessory + isolation",
    slots=[
        SlotSpec("vertical_pull", "Vertical Pull", ["pull"], (1, 2), "cable", 1, (4, 5), (6, 8), 150),
        SlotSpec("horizontal_pull", "Horizontal Pull", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("row_variation", "Row Variation", ["pull"], (2, 3), None, 1, (3, 4), (8, 12), 90),
        SlotSpec("accessory", "Accessory", ["pull"], (3, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("isolation", "Isolation", ["pull"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_LEG_DAY = DayTemplate(
    name="Leg Day",
    description="Squat + hinge + accessory + calf + core",
    slots=[
        SlotSpec("primary_squat", "Primary Squat", ["squat"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("hip_hinge", "Hip Hinge", ["hinge"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("leg_accessory", "Leg Accessory", ["squat"], (2, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("calf_work", "Calf Work", ["squat"], (4, 4), "machine", 1, (3, 4), (12, 15), 60),
        SlotSpec("core", "Core", ["core"], (1, 2), None, 1, (3, 4), (12, 20), 60),
    ],
)

_SHOULDER_DAY = DayTemplate(
    name="Shoulder Day",
    description="Overhead press + lateral + rear delt + front delt + traps",
    slots=[
        SlotSpec("overhead_press", "Overhead Press", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("lateral_raise", "Lateral Raise", ["push"], (3, 4), "dumbbell", 1, (3, 4), (10, 12), 75),
        SlotSpec("rear_delt", "Rear Delt", ["push"], (3, 4), "dumbbell", 1, (3, 4), (10, 12), 75),
        SlotSpec("front_delt", "Front Delt", ["push"], (3, 4), "dumbbell", 1, (3, 4), (10, 12), 75),
        SlotSpec("trap_accessory", "Trap / Upper Back", ["pull"], (3, 4), None, 1, (3, 4), (10, 12), 75),
    ],
)

_ARM_DAY = DayTemplate(
    name="Arm Day",
    description="Triceps + biceps + forearm work",
    slots=[
        SlotSpec("tricep_compound", "Tricep Compound", ["push"], (1, 2), "barbell", 1, (3, 4), (8, 10), 90),
        SlotSpec("tricep_isolation", "Tricep Isolation", ["push"], (4, 4), "cable", 1, (3, 4), (12, 15), 60),
        SlotSpec("bicep_compound", "Bicep Compound", ["pull"], (1, 2), "barbell", 1, (3, 4), (8, 10), 90),
        SlotSpec("bicep_isolation", "Bicep Isolation", ["pull"], (4, 4), "dumbbell", 1, (3, 4), (12, 15), 60),
        SlotSpec("forearm", "Forearm / Grip", ["pull", "core"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_CHEST_TRICEPS = DayTemplate(
    name="Chest + Triceps",
    description="Chest compounds + tricep finisher",
    slots=[
        SlotSpec("chest_compound_1", "Chest Compound", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("chest_compound_2", "Chest Compound", ["push"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("chest_accessory", "Chest Accessory", ["push"], (3, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("tricep_work", "Tricep Work", ["push"], (2, 4), None, 1, (3, 4), (10, 12), 75),
        SlotSpec("isolation", "Isolation", ["push"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_BACK_BICEPS = DayTemplate(
    name="Back + Biceps",
    description="Back compounds + bicep finisher",
    slots=[
        SlotSpec("vertical_pull", "Vertical Pull", ["pull"], (1, 2), "cable", 1, (4, 5), (6, 8), 150),
        SlotSpec("horizontal_pull", "Horizontal Pull", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("row_variation", "Row Variation", ["pull"], (2, 3), None, 1, (3, 4), (8, 12), 90),
        SlotSpec("bicep_work", "Bicep Work", ["pull"], (2, 4), None, 1, (3, 4), (10, 12), 75),
        SlotSpec("isolation", "Isolation", ["pull"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_UPPER_BODY = DayTemplate(
    name="Upper Body",
    description="Push + pull + shoulders + arms",
    slots=[
        SlotSpec("push_compound", "Push Compound", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("pull_compound", "Pull Compound", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("shoulder_work", "Shoulder Work", ["push"], (3, 4), None, 1, (3, 4), (10, 12), 75),
        SlotSpec("back_accessory", "Back Accessory", ["pull"], (2, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("arm_isolation", "Arm Isolation", ["push", "pull"], (4, 4), None, 1, (3, 4), (12, 15), 60),
    ],
)

_LOWER_BODY = DayTemplate(
    name="Lower Body",
    description="Squat + hinge + leg accessory + calf + core",
    slots=[
        SlotSpec("primary_squat", "Primary Squat", ["squat"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("hip_hinge", "Hip Hinge", ["hinge"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("leg_accessory", "Leg Accessory", ["squat"], (2, 3), None, 1, (3, 4), (10, 12), 90),
        SlotSpec("calf_work", "Calf Work", ["squat"], (4, 4), "machine", 1, (3, 4), (12, 15), 60),
        SlotSpec("core", "Core", ["core"], (1, 2), None, 1, (3, 4), (12, 20), 60),
    ],
)

_FULL_BODY_DAY = DayTemplate(
    name="Full Body Day",
    description="One of each major movement pattern",
    slots=[
        SlotSpec("push_compound", "Push Compound", ["push"], (1, 2), None, 1, (3, 4), (6, 10), 120),
        SlotSpec("pull_compound", "Pull Compound", ["pull"], (1, 2), None, 1, (3, 4), (6, 10), 120),
        SlotSpec("squat_compound", "Squat / Leg", ["squat", "hinge"], (1, 2), None, 1, (3, 4), (6, 10), 120),
        SlotSpec("accessory", "Accessory", ["push", "pull", "squat", "hinge"], (2, 3), None, 1, (3, 4), (10, 12), 75),
        SlotSpec("core", "Core", ["core"], (1, 2), None, 1, (3, 4), (12, 20), 60),
    ],
)

# Template lookup: focus + modality → template
_DAY_TEMPLATES: Dict[str, DayTemplate] = {
    "full_body": _FULL_BODY_DAY,
    "upper_lower_split": _UPPER_BODY,
    "push_pull_legs": _CHEST_DAY,  # Default; will be rotated
}

# Body-part templates for push/pull/legs splits
_PPL_TEMPLATES = {
    "push": _CHEST_DAY,  # Chest day serves as push day
    "pull": _BACK_DAY,
    "legs": _LEG_DAY,
}

# Single-part templates
_SINGLE_PART_TEMPLATES = {
    "chest": _CHEST_DAY,
    "back": _BACK_DAY,
    "shoulders": _SHOULDER_DAY,
    "legs": _LEG_DAY,
    "arms": _ARM_DAY,
    "chest_triceps": _CHEST_TRICEPS,
    "back_biceps": _BACK_BICEPS,
    "upper": _UPPER_BODY,
    "lower": _LOWER_BODY,
}


# ---------------------------------------------------------------------------
# Slot-based exercise picker
# ---------------------------------------------------------------------------

def _pick_exercise_for_slot(
    db: Session,
    filtered: List[Any],
    slot: SlotSpec,
    rng: random.Random,
    progression_type: str = "linear",
) -> Optional[Dict[str, Any]]:
    """Pick one exercise from filtered list that matches the slot spec."""
    candidates = []
    for ex in filtered:
        meta = _classify_exercise(ex)
        # Check movement
        if meta["movement"] not in slot.movements:
            continue
        # Check tier range
        tier = meta["compound_rank"]
        if tier < slot.tier_range[0] or tier > slot.tier_range[1]:
            continue
        # Check equipment preference (if specified)
        if slot.equipment:
            if slot.equipment not in (ex.equipment or "").lower():
                continue
        candidates.append(ex)

    if not candidates:
        return None

    # Sort by compound rank, pick top 3 for variety, then randomize
    candidates.sort(key=lambda e: _classify_exercise(e)["compound_rank"])
    top_pool = candidates[:min(5, len(candidates))]
    pick = rng.choice(top_pool)

    sets_target = rng.randint(*slot.sets_range)
    reps_target = rng.randint(*slot.reps_range)
    return _exercise_to_dict(pick, sets_target, reps_target, slot.rest_seconds, 0, progression_type)


def _build_day_from_template(
    db: Session,
    profile: UserProfile,
    template: DayTemplate,
    rng: random.Random,
    progression_type: str = "linear",
) -> Dict[str, Any]:
    """Build one workout day by filling slots in a template."""
    filtered, _ = _filter_exercises(db, profile.equipment, profile.limitations, profile.focus)
    if not filtered:
        filtered, _ = _filter_exercises(db, "bodyweight_only", [], profile.focus)

    exercises = []
    for slot in template.slots:
        ex = _pick_exercise_for_slot(db, filtered, slot, rng, progression_type)
        if ex:
            ex["order"] = len(exercises)
            exercises.append(ex)

    # Fallback: if no exercises matched, try with relaxed constraints
    if not exercises:
        return {"name": template.name, "exercises": []}

    return {
        "name": template.name,
        "description": template.description,
        "exercises": exercises,
    }


# ---------------------------------------------------------------------------
# Modality-specific builders (HIIT, Cardio, Yoga, Calisthenics, CrossFit)
# ---------------------------------------------------------------------------

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
    groups = []
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
    groups = []
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
    groups = []
    days = min(profile.days_per_week, 6)

    yoga_pool = [e for e in filtered if _classify_exercise(e)["modality_fit"] in {"yoga", "mobility"}]
    if not yoga_pool:
        yoga_pool = filtered

    for day_idx in range(days):
        count = min(target_exercises, len(yoga_pool))
        chosen = rng.sample(yoga_pool, count) if len(yoga_pool) > count else yoga_pool
        ex_out = []
        for idx, ex in enumerate(chosen):
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
    groups = []
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
    groups = []
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

    # Check for explicit week_schedule in profile (from AI coach)
    week_schedule = getattr(profile, "week_schedule", None)
    if week_schedule:
        groups = _build_from_week_schedule(
            db, profile, week_schedule, rng, base_sets, max_sets,
            base_reps, max_reps, rest, target_exercises, filtered, lower, progression_type
        )
    # Route to template-based builder for weight training modalities
    elif profile.modality in {"traditional_weight_training", "bodybuilding", "powerlifting"}:
        groups = _build_weight_training_days(db, profile, rng, base_sets, max_sets,
                                              base_reps, max_reps, rest, target_exercises,
                                              filtered, lower, progression_type)
    elif profile.modality == "hiit":
        groups = _build_hiit(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                             rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "calisthenics":
        groups = _build_calisthenics(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                                     rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "yoga":
        groups = _build_yoga(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                             rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "cardio":
        groups = _build_cardio(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                               rest, target_exercises, filtered, lower, progression_type)
    elif profile.modality == "crossfit":
        groups = _build_crossfit(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                                 rest, target_exercises, filtered, lower, progression_type)
    else:
        # Default to traditional weight training
        groups = _build_weight_training_days(db, profile, rng, base_sets, max_sets,
                                              base_reps, max_reps, rest, target_exercises,
                                              filtered, lower, progression_type)

    if not groups:
        groups.append({"name": "Full Body Day 1", "exercises": []})

    modality_label = _modality_labels.get(profile.modality, "Traditional Weight Training")

    return {
        "name": f"{modality_label} Plan",
        "description": f"{profile.days_per_week} days/week, {profile.minutes_per_session} min, {primary_goal}, {profile.experience}",
        "groups": groups,
    }


def _build_weight_training_days(
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
    """Build weight training days using templates based on focus."""
    days = min(profile.days_per_week, 6)
    groups = []

    if profile.focus == "full_body":
        # All days are full body
        for day_idx in range(days):
            day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type)
            day["name"] = f"Full Body Day {day_idx + 1}"
            groups.append(day)

    elif profile.focus == "upper_lower_split":
        # Alternate upper/lower
        for day_idx in range(days):
            if day_idx % 2 == 0:
                day = _build_day_from_template(db, profile, _UPPER_BODY, rng, progression_type)
                day["name"] = f"Upper Day {day_idx // 2 + 1}"
            else:
                day = _build_day_from_template(db, profile, _LOWER_BODY, rng, progression_type)
                day["name"] = f"Lower Day {day_idx // 2 + 1}"
            groups.append(day)

    elif profile.focus == "push_pull_legs":
        # Rotate push/pull/legs
        ppl_order = ["push", "pull", "legs"]
        for day_idx in range(days):
            ppl_key = ppl_order[day_idx % 3]
            template = _PPL_TEMPLATES[ppl_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            day["name"] = f"{ppl_key.title()} Day {day_idx // 3 + 1}"
            groups.append(day)

    elif profile.focus == "body_part_split":
        # Rotate body part days: chest/tris → back/bis → legs → shoulders → arms
        bps_order = ["chest_tris", "back_bis", "legs", "shoulders", "arms"]
        for day_idx in range(days):
            bps_key = bps_order[day_idx % 5]
            template_map = {
                "chest_tris": _CHEST_TRICEPS,
                "back_bis": _BACK_BICEPS,
                "legs": _LEG_DAY,
                "shoulders": _SHOULDER_DAY,
                "arms": _ARM_DAY,
            }
            template = template_map[bps_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            day["name"] = f"{bps_key.replace('_', ' ').title()} {day_idx // 5 + 1}"
            groups.append(day)

    else:
        # Unknown focus, default to full body
        for day_idx in range(days):
            day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type)
            day["name"] = f"Full Body Day {day_idx + 1}"
            groups.append(day)

    return groups


def _build_from_week_schedule(
    db: Session,
    profile: UserProfile,
    week_schedule: Dict[str, str],
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
    """Build days from an explicit week_schedule object."""
    groups = []
    day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    # Weight training modality builders
    weight_modalities = {"traditional_weight_training", "bodybuilding", "powerlifting"}
    # Simple modality builders
    simple_modality_builders = {
        "hiit": _build_hiit,
        "cardio": _build_cardio,
        "yoga": _build_yoga,
        "calisthenics": _build_calisthenics,
        "crossfit": _build_crossfit,
    }

    # Template mapping for weight training focus types
    focus_templates = {
        "full_body": _FULL_BODY_DAY,
        "upper_lower_split": _UPPER_BODY,
        "push_pull_legs": _CHEST_DAY,  # Will rotate
        "body_part_split": _CHEST_TRICEPS,  # AI coach should provide explicit day types in schedule
        "chest": _CHEST_DAY,
        "back": _BACK_DAY,
        "shoulders": _SHOULDER_DAY,
        "legs": _LEG_DAY,
        "arms": _ARM_DAY,
        "chest_triceps": _CHEST_TRICEPS,
        "back_biceps": _BACK_BICEPS,
        "upper": _UPPER_BODY,
        "lower": _LOWER_BODY,
    }

    for day_idx, day_name in enumerate(day_names):
        modality = week_schedule.get(day_name, "rest")
        if modality == "rest" or modality == "":
            continue

        if modality in weight_modalities:
            # Use the profile's focus to pick a template
            template = focus_templates.get(profile.focus, _FULL_BODY_DAY)
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            day["name"] = f"{day_name.title()} — {day['name']}"
            groups.append(day)

        elif modality in simple_modality_builders:
            # Use simple modality builder (HIIT, Cardio, etc.)
            builder = simple_modality_builders[modality]
            day_groups = builder(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                                 rest, target_exercises, filtered, lower, progression_type)
            if day_groups:
                groups.append(day_groups[0])

        else:
            # Unknown modality, default to full body template
            day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type)
            day["name"] = f"{day_name.title()} — {day['name']}"
            groups.append(day)

    return groups


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
