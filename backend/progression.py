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

from exercise_whitelist import _canonical_name, all_canonical_exercises, canonical_display_name
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
    "rear delt": "push",
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


def _classify_exercise(ex: Any, profile: Optional[UserProfile] = None) -> Dict[str, Any]:
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

    # Profile-aware rank adjustments
    rank_adjust = 0
    if profile:
        # Beginners get a slight penalty on advanced-feeling exercises
        if profile.experience == "beginner":
            for adv_kw in {"weighted", "one arm", "planche", "front lever", "back lever", "muscle up", "pistol"}:
                if adv_kw in name_lower:
                    rank_adjust += 1
                    break
        # Soft limitation penalties (hard exclusions already in _filter_exercises)
        for lim in (profile.limitations or []):
            if lim == "shoulder" and any(k in name_lower for k in {"overhead", "behind neck", "press"}):
                rank_adjust += 1
            elif lim == "knee" and any(k in name_lower for k in {"deep squat", "lunge", "split squat"}):
                rank_adjust += 1
            elif lim == "back" and any(k in name_lower for k in {"bent over", "deadlift", "good morning"}):
                rank_adjust += 1

    compound_rank = max(1, compound_rank + rank_adjust)

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


def _exercise_to_dict(ex: Any, sets_target: int, reps_target: int, rest_seconds: int, order: int, progression_type: str = "linear", slot_type: str = "lift", profile: Optional[UserProfile] = None) -> dict:
    meta = _classify_exercise(ex, profile)
    # Use canonical display name when matched (proper capitalization + classification),
    # otherwise title-case the raw DB name.
    display_name = canonical_display_name(getattr(ex, "exercise_db_id", None))
    if not display_name:
        display_name = ex.name
    if display_name == ex.name and ex.name and ex.name == ex.name.lower():
        display_name = ex.name.title()
    result = {
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
        "exercise_library_id": ex.id,
        "slot_type": slot_type,
    }
    return result


# ---------------------------------------------------------------------------
# Universal exercise filtering rules
# ---------------------------------------------------------------------------

_HEAVY_COMPOUND_EXCLUDE_PATTERNS = [
    "one arm", "one handed", "reverse", "reverse grip", "guillotine", "bosu", "stability ball",
    "weighted ", "incline scapula", "plyo", "clap ", "drop ", "deep push",
    "archer", "korean dip", "depth jump",
]
_HEAVY_COMPOUND_EXCLUDE_EQUIPMENT = {
    "band", "cable", "body weight", "leverage machine",
    "stability ball", "bosu ball", "weighted",
}


def _is_heavy_compound_slot(slot: SlotSpec) -> bool:
    """True if this slot is a tier 1-2 compound with barbell/smith/dumbbell preference."""
    return (
        slot.tier_range == (1, 2)
        and slot.movements in (["push"], ["pull"], ["squat"], ["hinge"])
        and slot.equipment in ("barbell", "smith machine", "dumbbell")
    )


def _adjust_slots_for_equipment(template: DayTemplate, profile: UserProfile) -> DayTemplate:
    """Adjust slot equipment preferences based on user's gym type."""
    if profile.equipment in ("planet_fitness", "home_gym_basic", "bodyweight_only"):
        fallback_eq = {
            "planet_fitness": "smith machine",
            "home_gym_basic": "dumbbell",
            "bodyweight_only": "body weight",
        }[profile.equipment]
        new_slots = []
        for slot in template.slots:
            # Heavy compound slots (tier 1-2): map barbell/None to gym fallback
            if slot.tier_range == (1, 2) and slot.equipment in ("barbell", None):
                new_slots.append(SlotSpec(
                    slot.slot_id, slot.label, slot.movements, slot.tier_range,
                    fallback_eq, slot.count, slot.sets_range, slot.reps_range,
                    slot.rest_seconds, slot.muscle_groups, slot.slot_type
                ))
            else:
                new_slots.append(slot)
        return DayTemplate(template.name, template.description, new_slots)
    return template


def _passes_heavy_compound_filter(ex: Any, meta: Dict[str, Any], profile: Optional[UserProfile] = None) -> bool:
    """Universal filter: only clean, standard free-weight compounds."""
    name_lower = ex.name.lower()
    # Exclude by pattern
    for pattern in _HEAVY_COMPOUND_EXCLUDE_PATTERNS:
        if pattern in name_lower:
            return False
    # Exclude by equipment class (allow bodyweight for bodyweight_only/home_gym_basic)
    eq = (ex.equipment or "").lower()
    if profile and profile.equipment in ("bodyweight_only", "home_gym_basic") and eq == "body weight":
        return True
    for bad_eq in _HEAVY_COMPOUND_EXCLUDE_EQUIPMENT:
        if bad_eq == eq or bad_eq in eq:
            return False
    return True


_SECOND_COMPOUND_EXCLUDE_EQUIPMENT = {
    "body weight", "leverage machine", "smith machine",
    "stability ball", "bosu ball", "cable", "band", "weighted",
}

# Per-gym-type equipment allowlists. None means no restriction.
_EQUIPMENT_ALLOWED: Dict[str, Optional[set]] = {
    "full_gym": None,
    "planet_fitness": {
        "smith machine", "machine", "dumbbell", "cable", "body weight",
        "assisted", "resistance band", "kettlebell",
    },
    "home_gym_basic": {
        "body weight", "dumbbell", "resistance band", "band", "kettlebell",
    },
    "bodyweight_only": {"body weight"},
}


def _passes_second_compound_filter(ex: Any, meta: Dict[str, Any], profile: Optional[UserProfile] = None) -> bool:
    """Second compound: barbell or dumbbell, no machines or bodyweight."""
    name_lower = ex.name.lower()
    for pattern in _HEAVY_COMPOUND_EXCLUDE_PATTERNS:
        if pattern in name_lower:
            return False
    eq = (ex.equipment or "").lower()
    if profile and profile.equipment in ("bodyweight_only", "home_gym_basic") and eq == "body weight":
        return True
    for bad_eq in _SECOND_COMPOUND_EXCLUDE_EQUIPMENT:
        if bad_eq == eq or bad_eq in eq:
            return False
    return True


_HIIT_PATTERNS = [
    "burpee", "sprint", "jump", "plyo", "hiit", "interval",
    "mountain climber", "battle rope", "kettlebell swing",
    "box jump", "tuck jump", "split jump",
]


def _is_hiit_exercise(ex: Any) -> bool:
    """True if this exercise looks like a HIIT/cardio burst movement."""
    name_lower = ex.name.lower()
    return any(pattern in name_lower for pattern in _HIIT_PATTERNS)


_STEADY_STATE_KEYWORDS = [
    "run", "jog", "walk", "bike", "bicycle", "elliptical", "stair",
    "step", "row", "swim", "ski", "cardio", "aerobic",
]

def _is_steady_state_cardio(ex: Any) -> bool:
    """True if this looks like steady-state endurance cardio (not HIIT)."""
    if (getattr(ex, "category", "") or "").lower() != "cardio":
        return False
    if _is_hiit_exercise(ex):
        return False
    name_lower = ex.name.lower()
    return any(kw in name_lower for kw in _STEADY_STATE_KEYWORDS)


def _is_walking_cardio(ex: Any) -> bool:
    """True if this looks like a walking-focused cardio exercise."""
    if (getattr(ex, "category", "") or "").lower() != "cardio":
        return False
    if _is_hiit_exercise(ex):
        return False
    return "walk" in ex.name.lower()


def _is_running_cardio(ex: Any) -> bool:
    """True if this looks like a running-focused cardio exercise."""
    if (getattr(ex, "category", "") or "").lower() != "cardio":
        return False
    if _is_hiit_exercise(ex):
        return False
    name_lower = ex.name.lower()
    return "run" in name_lower or "jog" in name_lower or "sprint" in name_lower


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_equipment_map = {
    "bodyweight_only": ["body weight"],
    "dumbbells": ["dumbbell"],
    "barbell": ["barbell"],
    "machines": ["machine", "cable"],
    "resistance_bands": ["band"],
    "full_gym": ["barbell", "dumbbell", "machine", "cable", "body weight", "band", "smith machine"],
    "planet_fitness": ["smith machine", "dumbbell", "machine", "cable", "body weight", "band"],
    "home_gym_basic": ["dumbbell", "body weight", "band"],
}

_muscle_group_aliases = {
    "legs": {"legs", "upper legs", "lower legs", "quads", "hamstrings", "glutes", "hips"},
    "calves": {"calves", "lower legs", "calves"},
    "core": {"core", "waist", "abs", "abdominals", "obliques"},
    "triceps": {"triceps", "upper arms", "arms"},
    "biceps": {"biceps", "upper arms", "arms", "lower arms"},
    "shoulders": {"shoulders", "delts", "deltoids", "upper back"},
    "back": {"back", "upper back", "lats", "latissimus", "rhomboids", "traps", "trapezius"},
    "chest": {"chest", "pecs", "pectorals", "upper chest", "lower chest"},
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
    "foundation": (2, 3, 8, 12),
    "deload": (2, 3, 8, 12),  # same rep range but half the sets
}

# Phase rotation definitions
_PHASE_ORDER = ["foundation", "strength", "hypertrophy", "deload"]
_PHASE_MIN_WEEKS = {
    "foundation": 2,
    "strength": 4,
    "hypertrophy": 4,
    "deload": 1,
}
_PHASE_GOAL = {
    "foundation": "general_fitness",
    "strength": "strength",
    "hypertrophy": "hypertrophy",
    "deload": "general_fitness",
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
    "cardio": "Cardio",
}


def _map_equipment(equipment_key: str) -> List[str]:
    return _equipment_map.get(equipment_key, [])


def _filter_exercises(db: Session, equipment_key: str, limitations: List[str], focus: str):
    """Returns (filtered_list, lower_split_list) where lower_split_list is only used by upper_lower_split."""
    allowed_equips = _map_equipment(equipment_key)
    from models import ExerciseLibrary
    q = db.query(ExerciseLibrary)

    if allowed_equips:
        # For full_gym and planet_fitness, exclude bodyweight exercises
        # since the user has weights/machines. Home gym and bodyweight-only keep them.
        # Exception: cardio exercises are allowed regardless of equipment because
        # running, walking, biking don't need weights.
        if equipment_key in ("full_gym", "planet_fitness"):
            conditions = []
            cardio_condition = ExerciseLibrary.category == "cardio"
            for ae in allowed_equips:
                if ae != "body weight":
                    conditions.append(ExerciseLibrary.equipment.ilike(f"%{ae}%"))
            if conditions:
                q = q.filter(or_(cardio_condition, *conditions))
        else:
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

    # Match canonical whitelist for tier tagging and display names
    for ex in filtered:
        canon = _canonical_name(str(ex.name))
        if canon:
            ex._canonical_tier = canon.tier
            ex._canonical_name = canon.name
            ex._automated = canon.automated
        else:
            ex._automated = False  # Non-canonical exercises excluded from automated

    # Filter to automated-only exercises
    filtered = [e for e in filtered if getattr(e, "_automated", False)]

    # Return equipment-matching exercises; split only for upper_lower_split
    if focus == "upper_lower_split":
        upper = [e for e in filtered if (e.muscle_group or "").lower() in {
            "chest", "back", "shoulders", "biceps", "triceps", "upper arms", "lower arms"
        }]
        lower = [e for e in filtered if (e.muscle_group or "").lower() in {
            "legs", "upper legs", "lower legs", "calves", "core", "waist"
        }]
        return upper, lower

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
    muscle_groups: Optional[List[str]] = None  # e.g., ["shoulders"] to narrow selection
    slot_type: str = "lift"       # "lift" | "cardio" | "hiit" | "warmup"


@dataclass
class DayTemplate:
    """A pre-built workout day template with slots."""
    name: str
    description: str
    slots: List[SlotSpec]


def _compose_day_template(
    name: str,
    description: str,
    *parts: Any,
) -> DayTemplate:
    """Compose a day template from body-part templates, taking up to N slots from each.

    parts: (template, max_slots[, skip=0]) — skip leading slots from each template.
    """
    slots: List[SlotSpec] = []
    for item in parts:
        template = item[0]
        max_slots = item[1]
        skip = item[2] if len(item) > 2 else 0
        slots.extend(template.slots[skip:skip + max_slots])
    return DayTemplate(name=name, description=description, slots=slots)


# ---------------------------------------------------------------------------
# Day templates
# ---------------------------------------------------------------------------

_CHEST_DAY = DayTemplate(
    name="Chest Day",
    description="2 heavy compounds + 1 accessory",
    slots=[
        SlotSpec("compound_1", "Heavy Compound", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150, muscle_groups=["chest"]),
        SlotSpec("compound_2", "Second Compound", ["push"], (1, 2), None, 1, (3, 4), (8, 10), 120, muscle_groups=["chest"]),
        SlotSpec("accessory_1", "Accessory", ["push"], (3, 3), None, 1, (3, 4), (10, 12), 90, muscle_groups=["chest"]),
    ],
)

_BACK_DAY = DayTemplate(
    name="Back Day",
    description="Vertical pull + horizontal pull + row + accessory",
    slots=[
        SlotSpec("vertical_pull", "Vertical Pull", ["pull"], (1, 2), "cable", 1, (4, 5), (6, 8), 150, muscle_groups=["back"]),
        SlotSpec("horizontal_pull", "Horizontal Pull", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 120, muscle_groups=["back"]),
        SlotSpec("row_variation", "Row Variation", ["pull"], (2, 3), None, 1, (3, 4), (8, 12), 90, muscle_groups=["back"]),
        SlotSpec("accessory", "Accessory", ["pull"], (3, 3), None, 1, (3, 4), (10, 12), 90, muscle_groups=["back"]),
    ],
)

_LEG_DAY = DayTemplate(
    name="Leg Day",
    description="Squat + hinge + accessory + calf + core",
    slots=[
        SlotSpec("primary_squat", "Primary Squat", ["squat"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150, muscle_groups=["legs"]),
        SlotSpec("hip_hinge", "Hip Hinge", ["hinge"], (1, 2), None, 1, (3, 4), (8, 10), 120, muscle_groups=["legs"]),
        SlotSpec("leg_accessory", "Leg Accessory", ["squat"], (2, 3), None, 1, (3, 4), (10, 12), 90, muscle_groups=["legs"]),
        SlotSpec("calf_work", "Calf Work", ["squat", "hinge"], (4, 4), "machine", 1, (3, 4), (12, 15), 60, muscle_groups=["calves"]),
        SlotSpec("core", "Core", ["core"], (1, 3), None, 1, (3, 4), (12, 20), 60, muscle_groups=["core"]),
    ],
)

_SHOULDER_DAY = DayTemplate(
    name="Shoulder Day",
    description="Overhead press + lateral + rear delt + front delt + traps",
    slots=[
        SlotSpec("overhead_press", "Overhead Press", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150, muscle_groups=["shoulders"]),
        SlotSpec("lateral_raise", "Lateral Raise", ["push"], (2, 4), "dumbbell", 1, (3, 4), (10, 12), 75, muscle_groups=["shoulders"]),
        SlotSpec("rear_delt", "Rear Delt", ["push"], (2, 4), "dumbbell", 1, (3, 4), (10, 12), 75, muscle_groups=["shoulders"]),
        SlotSpec("front_delt", "Front Delt", ["push"], (2, 4), "dumbbell", 1, (3, 4), (10, 12), 75, muscle_groups=["shoulders"]),
        SlotSpec("trap_accessory", "Trap / Upper Back", ["pull"], (2, 4), None, 1, (3, 4), (10, 12), 75, muscle_groups=["back"]),
    ],
)

_ARM_DAY = DayTemplate(
    name="Arm Day",
    description="Triceps + biceps + forearm work",
    slots=[
        SlotSpec("tricep_compound", "Tricep Compound", ["push"], (1, 2), None, 1, (3, 4), (8, 10), 90, muscle_groups=["triceps"]),
        SlotSpec("tricep_isolation", "Tricep Isolation", ["push"], (3, 4), None, 1, (3, 4), (12, 15), 60, muscle_groups=["triceps"]),
        SlotSpec("bicep_compound", "Bicep Compound", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 90, muscle_groups=["biceps"]),
        SlotSpec("bicep_isolation", "Bicep Isolation", ["pull"], (3, 4), None, 1, (3, 4), (12, 15), 60, muscle_groups=["biceps"]),
        SlotSpec("forearm", "Forearm / Grip", ["pull", "core"], (4, 4), None, 1, (3, 4), (12, 15), 60, muscle_groups=["biceps"]),
    ],
)

_TRICEPS_DAY = DayTemplate(
    name="Triceps",
    description="Tricep compounds + isolation",
    slots=[
        SlotSpec("tricep_compound", "Tricep Compound", ["push"], (1, 2), None, 1, (3, 4), (8, 10), 90, muscle_groups=["triceps"]),
        SlotSpec("tricep_isolation", "Tricep Isolation", ["push"], (3, 4), None, 1, (3, 4), (12, 15), 60, muscle_groups=["triceps"]),
    ],
)

_BICEPS_DAY = DayTemplate(
    name="Biceps",
    description="Bicep compounds + isolation",
    slots=[
        SlotSpec("bicep_compound", "Bicep Compound", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 90, muscle_groups=["biceps"]),
        SlotSpec("bicep_isolation", "Bicep Isolation", ["pull"], (3, 4), None, 1, (3, 4), (12, 15), 60, muscle_groups=["biceps"]),
    ],
)

_CHEST_TRICEPS = _compose_day_template(
    "Chest + Triceps",
    "Chest compounds + tricep finisher",
    (_CHEST_DAY, 3),
    (_TRICEPS_DAY, 2),
)

_BACK_BICEPS = _compose_day_template(
    "Back + Biceps",
    "Back compounds + bicep finisher",
    (_BACK_DAY, 3),
    (_BICEPS_DAY, 2),
)

_PUSH_DAY = _compose_day_template(
    "Push Day",
    "Chest + shoulders + triceps",
    (_CHEST_DAY, 2, 0),
    (_SHOULDER_DAY, 2, 1),  # skip overhead_press, take lateral + rear delt
    (_TRICEPS_DAY, 2, 0),
)

_PULL_DAY = _compose_day_template(
    "Pull Day",
    "Back + biceps",
    (_BACK_DAY, 3),
    (_BICEPS_DAY, 2),
)

_UPPER_BODY = DayTemplate(
    name="Upper Body",
    description="Push + pull + shoulders + arms",
    slots=[
        SlotSpec("push_compound", "Push Compound", ["push"], (1, 2), "barbell", 1, (4, 5), (6, 8), 150),
        SlotSpec("pull_compound", "Pull Compound", ["pull"], (1, 2), None, 1, (3, 4), (8, 10), 120),
        SlotSpec("shoulder_work", "Shoulder Work", ["push"], (3, 4), None, 1, (3, 4), (10, 12), 75, muscle_groups=["shoulders"]),
        SlotSpec("back_accessory", "Back Accessory", ["pull"], (2, 3), None, 1, (3, 4), (10, 12), 90, muscle_groups=["back"]),
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
        SlotSpec("calf_work", "Calf Work", ["squat", "hinge"], (4, 4), "machine", 1, (3, 4), (12, 15), 60, muscle_groups=["calves"]),
        SlotSpec("core", "Core", ["core"], (1, 3), None, 1, (3, 4), (12, 20), 60),
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

_CARDIO_DAY = DayTemplate(
    name="Cardio",
    description="Steady-state run, bike, or walk",
    slots=[
        SlotSpec("cardio_main", "Cardio", ["cardio"], (1, 1), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
    ],
)

_STEADY_STATE_DAY = DayTemplate(
    name="Steady State Cardio",
    description="Structured endurance session: warmup, main set, cooldown",
    slots=[
        SlotSpec("ss_warmup", "Warmup", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("ss_main", "Main Set", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("ss_cooldown", "Cooldown", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
    ],
)

_WALKING_DAY = DayTemplate(
    name="Walking",
    description="Walking-focused session: brisk walk, optional incline/carry work",
    slots=[
        SlotSpec("walk_warmup", "Warmup Walk", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("walk_main", "Main Walk", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("walk_accessory", "Accessory Carry", ["carry", "core"], (2, 3), None, 1, (3, 4), (10, 15), 60, slot_type="lift"),
    ],
)

_DISTANCE_DAY = DayTemplate(
    name="Distance Training",
    description="Progressive pace work for 5k / 10k goals",
    slots=[
        SlotSpec("dist_warmup", "Warmup", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("dist_main", "Pace Work", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
        SlotSpec("dist_cooldown", "Cooldown", ["cardio"], (1, 2), None, 1, (1, 1), (0, 0), 0, slot_type="cardio"),
    ],
)

_HIIT_DAY = DayTemplate(
    name="HIIT",
    description="High-intensity interval training",
    slots=[
        SlotSpec("hiit_lower", "Lower Body Blast", ["plyometric", "squat", "hinge"], (2, 3), None, 1, (3, 4), (8, 12), 60, muscle_groups=["legs"], slot_type="hiit"),
        SlotSpec("hiit_upper", "Upper / Full Body", ["plyometric", "cardio", "push", "pull"], (2, 3), None, 1, (3, 4), (10, 15), 45, slot_type="hiit"),
        SlotSpec("hiit_core", "Core Finisher", ["core"], (3, 4), None, 1, (3, 4), (12, 15), 30, muscle_groups=["core"], slot_type="hiit"),
    ],
)

# Template lookup: focus + modality → template
_DAY_TEMPLATES: Dict[str, DayTemplate] = {
    "full_body": _FULL_BODY_DAY,
    "upper_lower_split": _UPPER_BODY,
    "push_pull_legs": _PUSH_DAY,  # Push day default; will be rotated
    "hiit": _HIIT_DAY,
    "cardio": _CARDIO_DAY,
}

# Body-part templates for push/pull/legs splits
_PPL_TEMPLATES = {
    "push": _PUSH_DAY,
    "pull": _PULL_DAY,
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

# Modality-specific templates
_MODALITY_TEMPLATES = {
    "hiit": _HIIT_DAY,
    "cardio": _STEADY_STATE_DAY,
    "steady_state": _STEADY_STATE_DAY,
    "walking": _WALKING_DAY,
    "distance": _DISTANCE_DAY,
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
    profile: Optional[UserProfile] = None,
) -> Optional[Dict[str, Any]]:
    """Pick one exercise from filtered list that matches the slot spec."""
    # Cardio/HIIT slots: pick from cardio-capable pool
    if slot.slot_type in ("cardio", "hiit"):
        if slot.slot_type == "hiit":
            pool = [e for e in filtered if _is_hiit_exercise(e)]
        else:
            # Prefer exercises explicitly tagged as cardio in the DB
            pool = [e for e in filtered if (getattr(e, "category", "") or "").lower() == "cardio"]
            if not pool:
                # Fallback: modality-based detection
                pool = [e for e in filtered if _classify_exercise(e, profile)["modality_fit"] in {"cardio", "hiit"}]
            if not pool:
                pool = filtered
        pick = rng.choice(pool) if pool else None
        if pick:
            sets_target = 1
            reps_target = 0
            return _exercise_to_dict(pick, sets_target, reps_target, 0, 0, progression_type, slot_type=slot.slot_type, profile=profile)
        return None

    candidates = []
    for ex in filtered:
        meta = _classify_exercise(ex, profile)
        # Check movement
        if meta["movement"] not in slot.movements:
            continue
        # Check muscle group hint (if specified) — supports aliases
        if slot.muscle_groups:
            muscle = (ex.muscle_group or "").lower()
            matched_mg = False
            for mg in slot.muscle_groups:
                aliases = _muscle_group_aliases.get(mg.lower(), {mg.lower()})
                if any(a in muscle for a in aliases):
                    matched_mg = True
                    break
            if not matched_mg:
                continue
        # Check tier range
        tier = meta["compound_rank"]
        if tier < slot.tier_range[0] or tier > slot.tier_range[1]:
            continue
        # Apply universal heavy-compound exclusions
        if _is_heavy_compound_slot(slot) and not _passes_heavy_compound_filter(ex, meta, profile):
            continue
        # Apply second-compound exclusions (barbell or dumbbell only, no machines)
        if (
            not _is_heavy_compound_slot(slot)
            and slot.tier_range == (1, 2)
            and slot.equipment is None
            and slot.movements in (["push"], ["pull"], ["squat"], ["hinge"])
            and not _passes_second_compound_filter(ex, meta, profile)
        ):
            continue
        # Universal misc exercise exclusions (apply to all lift slots)
        name_lower = ex.name.lower()
        if any(pattern in name_lower for pattern in _HEAVY_COMPOUND_EXCLUDE_PATTERNS):
            continue
        # If slot has a specific equipment preference, prefer matching equipment
        # but allow fallback to other equipment types if pool is too small
        candidates.append(ex)

    # General equipment availability filter based on gym type
    if profile and candidates:
        allowed = _EQUIPMENT_ALLOWED.get(profile.equipment)
        if allowed is not None:
            candidates = [e for e in candidates if (e.equipment or "").lower() in allowed]

    if not candidates:
        return None

    # Hard equipment filter: if slot specifies equipment, prioritize exact matches
    if slot.equipment:
        preferred = [e for e in candidates if (e.equipment or "").lower() == slot.equipment.lower()]
        if preferred:
            candidates = preferred

    # Sort by compound rank, pick top 3 for variety, then randomize
    candidates.sort(key=lambda e: _classify_exercise(e, profile)["compound_rank"])
    top_pool = candidates[:min(5, len(candidates))]
    pick = rng.choice(top_pool)

    sets_target = rng.randint(*slot.sets_range)
    reps_target = rng.randint(*slot.reps_range)
    return _exercise_to_dict(pick, sets_target, reps_target, slot.rest_seconds, 0, progression_type)


# ---------------------------------------------------------------------------
# Time estimation and session budgeting
# ---------------------------------------------------------------------------

_MUSCLE_GROUP_TRANSITION: Dict[str, int] = {
    # Same area = 30s, different area = 60s
    "chest": 30,      # chest → tricep
    "triceps": 30,    # tricep → bicep (same arm)
    "biceps": 30,     # bicep → tricep
    "upper arms": 30,
    "back": 30,       # back → bicep
    "shoulders": 60,  # shoulders → anything else
    "legs": 30,       # squat → lunge → hinge
    "upper legs": 30,
    "calves": 30,     # calves → legs
    "lower legs": 30,
    "core": 30,       # core → anything in same area
    "waist": 30,
}

_SESSION_TARGET_EXERCISES = {
    20: 2,
    30: 3,
    45: 4,
    60: 5,
    75: 6,
    90: 7,
}

_WARMUP_OVERHEAD_SECONDS = 300  # 5 min for first exercise warmup sets


def _estimate_exercise_seconds(ex: dict, sets: int, reps: int, rest_seconds: int) -> int:
    """Estimate total time for one exercise including working + rest + transition."""
    working = reps * 3 * sets  # ~3s per rep
    rest = rest_seconds * max(0, sets - 1)
    return working + rest


def _transition_seconds(prev_muscle: Optional[str], next_muscle: Optional[str]) -> int:
    """Transition time between two muscle groups."""
    if not prev_muscle or not next_muscle:
        return 30
    prev = (prev_muscle or "").lower()
    next_m = (next_muscle or "").lower()
    # Same group = 30s
    if prev == next_m:
        return 30
    # Check alias mapping
    prev_base = _resolve_muscle_base(prev)
    next_base = _resolve_muscle_base(next_m)
    if prev_base == next_base:
        return 30
    # Known fast transitions
    fast_pairs = {
        frozenset(["chest", "triceps"]),
        frozenset(["triceps", "biceps"]),
        frozenset(["back", "biceps"]),
        frozenset(["upper arms", "upper arms"]),
        frozenset(["legs", "calves"]),
        frozenset(["upper legs", "lower legs"]),
        frozenset(["core", "waist"]),
    }
    if frozenset([prev_base, next_base]) in fast_pairs:
        return 30
    return 60


def _resolve_muscle_base(muscle: str) -> str:
    """Map muscle group aliases to base area."""
    aliases = {
        "upper arms": "triceps",
        "lower arms": "biceps",
        "upper legs": "legs",
        "lower legs": "calves",
        "waist": "core",
        "chest": "chest",
        "back": "back",
        "shoulders": "shoulders",
        "calves": "calves",
        "core": "core",
        "triceps": "triceps",
        "biceps": "biceps",
        "legs": "legs",
        "quads": "legs",
        "hamstrings": "legs",
        "glutes": "legs",
        "hips": "legs",
        "abs": "core",
        "abdominals": "core",
        "obliques": "core",
        "delts": "shoulders",
        "deltoids": "shoulders",
        "lats": "back",
        "latissimus": "back",
        "rhomboids": "back",
        "traps": "back",
        "trapezius": "back",
        "pecs": "chest",
        "pectorals": "chest",
        "upper chest": "chest",
        "lower chest": "chest",
    }
    return aliases.get(muscle, muscle)


def _get_session_budget(profile: UserProfile) -> tuple[int, int]:
    """Return (lift_budget_seconds, cardio_budget_seconds) for the session."""
    total = profile.minutes_per_session * 60
    cardio_timing = getattr(profile, "cardio_timing", "none") or "none"
    if cardio_timing in {"warmup_10", "warmup_run"}:
        cardio_sec = 600
    elif cardio_timing in {"warmup_15", "warmup_run_15"}:
        cardio_sec = 900
    elif cardio_timing in {"warmup_20", "warmup_run_20"}:
        cardio_sec = 1200
    elif cardio_timing in {"finisher_15", "finisher_run"}:
        cardio_sec = 900
    elif cardio_timing in {"finisher_20", "finisher_run_20"}:
        cardio_sec = 1200
    elif cardio_timing == "hiit_finisher":
        cardio_sec = 900
    elif cardio_timing == "separate_day":
        cardio_sec = 0  # entire session is cardio; handled by _build_wildcard_day
    else:
        cardio_sec = 0
    lift_sec = max(60, total - cardio_sec - _WARMUP_OVERHEAD_SECONDS)
    return lift_sec, cardio_sec


def _default_sets_for_duration(minutes: int) -> int:
    """How many sets per exercise based on session length."""
    if minutes <= 30:
        return 3
    elif minutes <= 45:
        return 4
    elif minutes <= 60:
        return 4
    else:
        return 5


def _target_exercises_for_duration(minutes: int) -> int:
    for t in sorted(_SESSION_TARGET_EXERCISES.keys()):
        if minutes <= t:
            return _SESSION_TARGET_EXERCISES[t]
    return _SESSION_TARGET_EXERCISES.get(minutes, 5)


def _build_day_from_template(
    db: Session,
    profile: UserProfile,
    template: DayTemplate,
    rng: random.Random,
    progression_type: str = "linear",
    filtered_override: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    """Build one workout day by filling slots in a template."""
    # Adjust slot equipment preferences for user's gym type
    template = _adjust_slots_for_equipment(template, profile)
    
    if filtered_override is not None:
        filtered = filtered_override
        fallback = filtered_override
    else:
        filtered, _ = _filter_exercises(db, profile.equipment, profile.limitations, profile.focus)
        fallback, _ = _filter_exercises(db, "bodyweight_only", [], profile.focus)
    if not filtered:
        filtered = fallback

    exercises = []
    used_ids: set = set()
    used_canonical_names: set = set()

    # Session budget
    lift_budget, cardio_budget = _get_session_budget(profile)
    default_sets = _default_sets_for_duration(profile.minutes_per_session)
    is_first = True
    prev_muscle = None
    used_time = 0

    for slot in template.slots:
        # Cardio/HIIT slot handling
        if slot.slot_type in ("cardio", "hiit"):
            if slot.slot_type == "hiit":
                hiit_pool = [e for e in filtered if _is_hiit_exercise(e)]
                if not hiit_pool:
                    hiit_pool = filtered
                if slot.muscle_groups:
                    muscle_filtered = []
                    for e in hiit_pool:
                        muscle = (e.muscle_group or "").lower()
                        for mg in slot.muscle_groups:
                            aliases = _muscle_group_aliases.get(mg.lower(), {mg.lower()})
                            if any(a in muscle for a in aliases):
                                muscle_filtered.append(e)
                                break
                    if muscle_filtered:
                        hiit_pool = muscle_filtered
                pick = rng.choice(hiit_pool) if hiit_pool else None
                if pick:
                    sets_target = rng.randint(*slot.sets_range)
                    reps_target = rng.randint(*slot.reps_range)
                    ex = _exercise_to_dict(pick, sets_target, reps_target, slot.rest_seconds, len(exercises), progression_type, slot_type=slot.slot_type, profile=profile)
                    ex["order"] = len(exercises)
                    ex["cardio_duration_minutes"] = cardio_budget // 60
                    exercises.append(ex)
            else:
                # Prefer exercises explicitly tagged as cardio in the DB
                cardio_pool = [e for e in filtered if (getattr(e, "category", "") or "").lower() == "cardio"]
                if not cardio_pool:
                    cardio_pool = [e for e in filtered if _classify_exercise(e, profile)["modality_fit"] in {"cardio", "hiit"}]
                if not cardio_pool:
                    cardio_pool = filtered
                pick = rng.choice(cardio_pool) if cardio_pool else None
                if pick:
                    sets_target = rng.randint(*slot.sets_range)
                    reps_target = rng.randint(*slot.reps_range)
                    ex = _exercise_to_dict(pick, sets_target, reps_target, slot.rest_seconds, len(exercises), progression_type, slot_type=slot.slot_type, profile=profile)
                    ex["order"] = len(exercises)
                    ex["cardio_duration_minutes"] = cardio_budget // 60
                    exercises.append(ex)
            continue

        # Lift slot
        count = slot.count
        pool = [e for e in filtered if e.id not in used_ids]

        for _ in range(count):
            sets_for_slot = default_sets
            reps_for_slot = rng.randint(*slot.reps_range)
            original_sets_range = slot.sets_range

            # Try picking at default sets
            slot.sets_range = (sets_for_slot, sets_for_slot)
            ex = _pick_exercise_for_slot(db, pool, slot, rng, progression_type, profile)

            # If no match at default sets, try reducing down to 2
            if not ex:
                for reduced_sets in range(default_sets - 1, 1, -1):
                    slot.sets_range = (reduced_sets, reduced_sets)
                    ex = _pick_exercise_for_slot(db, pool, slot, rng, progression_type, profile)
                    if ex:
                        sets_for_slot = reduced_sets
                        break

            slot.sets_range = original_sets_range

            if not ex:
                # Can't fill this slot at all — stop adding slots
                break

            # Duplicate guard: prefer different canonical name within the day
            canonical_name = ex.get("name") or ""
            if canonical_name in used_canonical_names:
                # Try one more time from remaining pool with relaxed pick
                alt_pool = [e for e in pool if (e.name not in used_canonical_names)]
                if alt_pool:
                    ex = _pick_exercise_for_slot(db, alt_pool, slot, rng, progression_type, profile)
                    if ex:
                        canonical_name = ex.get("name") or ""
                        sets_for_slot = default_sets
                        for reduced_sets in range(default_sets - 1, 1, -1):
                            slot.sets_range = (reduced_sets, reduced_sets)
                            ex2 = _pick_exercise_for_slot(db, alt_pool, slot, rng, progression_type, profile)
                            slot.sets_range = original_sets_range
                            if ex2:
                                ex = ex2
                                sets_for_slot = reduced_sets
                                canonical_name = ex.get("name") or ""
                                break
                if not ex or canonical_name in used_canonical_names:
                    break

            used_canonical_names.add(canonical_name)

            # Transition from previous exercise
            cur_muscle = ex.get("muscle_group")
            if prev_muscle and cur_muscle:
                transition = _transition_seconds(prev_muscle, cur_muscle)
            else:
                transition = 0

            ex_time = _estimate_exercise_seconds(ex, sets_for_slot, reps_for_slot, slot.rest_seconds)

            # If this exercise doesn't fit even at minimum 2 sets, stop adding slots
            if used_time + transition + ex_time > lift_budget and sets_for_slot > 2:
                # Try minimum 2 sets one last time
                slot.sets_range = (2, 2)
                reps_for_slot = rng.randint(*slot.reps_range)
                ex2 = _pick_exercise_for_slot(db, pool, slot, rng, progression_type, profile)
                slot.sets_range = original_sets_range
                if not ex2:
                    break
                sets_for_slot = 2
                ex = ex2
                cur_muscle = ex.get("muscle_group")
                if prev_muscle and cur_muscle:
                    transition = _transition_seconds(prev_muscle, cur_muscle)
                else:
                    transition = 0
                ex_time = _estimate_exercise_seconds(ex, 2, reps_for_slot, slot.rest_seconds)
                # Even at 2 sets, if it still doesn't fit, stop
                if used_time + transition + ex_time > lift_budget:
                    break

            # Add warmup sets to first exercise
            if is_first:
                warmup_sets = 2
                warmup_reps = max(5, reps_for_slot // 2)
                ex["warmup_sets"] = warmup_sets
                ex["warmup_reps"] = warmup_reps
                used_time += _WARMUP_OVERHEAD_SECONDS
                is_first = False

            used_time += transition
            used_time += ex_time

            ex["order"] = len(exercises)
            ex["sets_target"] = sets_for_slot
            ex["reps_target"] = reps_for_slot
            ex["estimated_seconds"] = ex_time
            exercises.append(ex)
            ex_id = ex.get("exercise_library_id")
            if ex_id is not None:
                used_ids.add(ex_id)
            pool = [e for e in pool if e.id != ex_id]
            prev_muscle = cur_muscle

    # Fallback: if no exercises matched, try with relaxed constraints
    if not exercises:
        return {"name": template.name, "exercises": []}

    return {
        "name": template.name,
        "description": template.description,
        "exercises": exercises,
        "lift_budget_seconds": lift_budget,
        "used_seconds": used_time,
        "cardio_budget_seconds": cardio_budget,
    }


def _build_wildcard_day(
    db: Session,
    profile: UserProfile,
    rng: random.Random,
    progression_type: str,
    filtered: List[Any],
    lower: List[Any],
    force_cardio: bool = False,
) -> Dict[str, Any]:
    """Build a wildcard day: HIIT, cardio, or active recovery based on cardio_type."""
    cardio_timing = getattr(profile, "cardio_timing", "none") or "none"
    cardio_type = getattr(profile, "cardio_type", "none") or "none"

    if (not force_cardio and cardio_timing != "separate_day") or cardio_type == "none":
        # Fallback: light full body as active recovery
        day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type,
                                       filtered_override=filtered)
        day["name"] = "Active Recovery"
        return day

    if cardio_type == "hiit":
        hiit_pool = [e for e in filtered if _is_hiit_exercise(e)]
        if not hiit_pool:
            hiit_pool = filtered
        return _build_day_from_template(db, profile, _HIIT_DAY, rng, progression_type,
                                        filtered_override=hiit_pool)
    elif cardio_type == "steady_state":
        cardio_pool = [e for e in filtered if _is_steady_state_cardio(e)]
        if not cardio_pool:
            cardio_pool = [e for e in filtered if (getattr(e, "category", "") or "").lower() == "cardio"]
        if not cardio_pool:
            cardio_pool = filtered
        return _build_day_from_template(db, profile, _STEADY_STATE_DAY, rng, progression_type,
                                        filtered_override=cardio_pool)
    elif cardio_type == "walking":
        walking_pool = [e for e in filtered if _is_walking_cardio(e)]
        if not walking_pool:
            walking_pool = [e for e in filtered if _is_steady_state_cardio(e)]
        if not walking_pool:
            walking_pool = filtered
        return _build_day_from_template(db, profile, _WALKING_DAY, rng, progression_type,
                                        filtered_override=walking_pool)
    elif cardio_type == "distance":
        run_pool = [e for e in filtered if _is_running_cardio(e)]
        if not run_pool:
            run_pool = [e for e in filtered if _is_steady_state_cardio(e)]
        if not run_pool:
            run_pool = filtered
        return _build_day_from_template(db, profile, _DISTANCE_DAY, rng, progression_type,
                                        filtered_override=run_pool)
    elif cardio_type == "mixed":
        # Randomly pick one of the available modalities
        options = []
        for pool, template in [
            ([e for e in filtered if _is_hiit_exercise(e)], _HIIT_DAY),
            ([e for e in filtered if _is_steady_state_cardio(e)], _STEADY_STATE_DAY),
            ([e for e in filtered if _is_walking_cardio(e)], _WALKING_DAY),
            ([e for e in filtered if _is_running_cardio(e)], _DISTANCE_DAY),
        ]:
            if pool:
                options.append((pool, template))
        if options:
            pool, template = rng.choice(options)
            return _build_day_from_template(db, profile, template, rng, progression_type,
                                            filtered_override=pool)
        return _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type,
                                       filtered_override=filtered)

    # Fallback
    day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type,
                                   filtered_override=filtered)
    day["name"] = "Active Recovery"
    return day


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
    hiit_pool = [e for e in filtered if _classify_exercise(e, profile)["movement"] in {"plyometric", "cardio", "core"}]
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

    cardio_pool = [e for e in filtered if _classify_exercise(e, profile)["modality_fit"] in {"cardio", "hiit"}]
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


# ---------------------------------------------------------------------------
# Phase rotation
# ---------------------------------------------------------------------------

def _maybe_transition_phase(profile: UserProfile, db: Session) -> UserProfile:
    """Check if a phase transition should occur for full_program users.
    Returns a new UserProfile with updated phase if transition fires.
    """
    goal = profile.goals[0] if profile.goals else "general_fitness"
    if goal != "full_program":
        return profile

    current_phase = profile.current_phase or "foundation"
    min_weeks = _PHASE_MIN_WEEKS.get(current_phase, 4)

    # Determine how long they've been in current phase
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    if profile.phase_start_date:
        try:
            start = datetime.fromisoformat(profile.phase_start_date)
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            weeks_in_phase = (now - start).days / 7.0
        except (ValueError, TypeError):
            weeks_in_phase = 0
    else:
        weeks_in_phase = 0

    # Check if minimum time has passed
    if weeks_in_phase < min_weeks:
        return profile

    # Check performance data: query recent SetLogs to assess readiness
    from models import SetLog
    user_id = getattr(profile, "user_id", None)
    if user_id is None:
        return profile  # can't evaluate without user_id

    recent_logs = (
        db.query(SetLog)
        .filter(SetLog.user_id == user_id)
        .order_by(SetLog.created_at.desc())
        .limit(50)
        .all()
    )

    # Transition logic based on phase
    should_transition = False
    next_phase = current_phase  # default: stay in current phase

    if current_phase == "foundation" and weeks_in_phase >= _PHASE_MIN_WEEKS["foundation"]:
        # After foundation, move to strength
        should_transition = True
        next_phase = "strength"

    elif current_phase == "strength" and weeks_in_phase >= _PHASE_MIN_WEEKS["strength"]:
        # Check if they're stalling: low completion rate or high RIR
        if len(recent_logs) >= 6:
            completion_rates = [getattr(log, "reps_completed", 0) / max(getattr(log, "reps_target", 1), 1) for log in recent_logs if getattr(log, "reps_target", 0) > 0]
            avg_completion = sum(completion_rates) / len(completion_rates) if completion_rates else 1.0
            if avg_completion < 0.7:  # consistently missing reps
                should_transition = True
                next_phase = "hypertrophy"
            else:
                # Continue strength or switch to hypertrophy based on time
                if weeks_in_phase >= 8:
                    should_transition = True
                    next_phase = "hypertrophy"
        else:
            # Not enough data yet, continue strength
            should_transition = False

    elif current_phase == "hypertrophy" and weeks_in_phase >= _PHASE_MIN_WEEKS["hypertrophy"]:
        # After hypertrophy, go to deload
        should_transition = True
        next_phase = "deload"

    elif current_phase == "deload" and weeks_in_phase >= _PHASE_MIN_WEEKS["deload"]:
        # After deload, alternate strength/hypertrophy based on history
        history = profile.phase_history or []
        if "hypertrophy" in history[-2:]:
            next_phase = "strength"
        else:
            next_phase = "hypertrophy"
        should_transition = True

    if not should_transition:
        return profile

    # Build updated profile
    new_history = list(profile.phase_history) + [current_phase]
    return UserProfile(
        **{
            **profile.__dict__,
            "current_phase": next_phase,
            "phase_start_date": now.isoformat(),
            "phase_history": new_history,
            "goals": [_PHASE_GOAL.get(next_phase, "general_fitness")],
        }
    )

# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_workout(db: Session, profile: UserProfile) -> dict:
    """Build a deterministic workout plan from a UserProfile."""
    rng = _seed(profile)

    # Phase rotation: if goal is full_program, compute current phase and effective goal
    effective_goal = profile.goals[0] if profile.goals else "general_fitness"
    if effective_goal == "full_program":
        profile = _maybe_transition_phase(profile, db)
        effective_goal = _PHASE_GOAL.get(profile.current_phase, "general_fitness")

    base_sets, max_sets, base_reps, max_reps = _goal_volume.get(effective_goal, _goal_volume["general_fitness"])

    # Deload: cut volume by half
    if profile.current_phase == "deload":
        base_sets = max(1, base_sets // 2)
        max_sets = max(base_sets, max_sets // 2)

    if effective_goal in ["strength"]:
        rest = 150
    elif effective_goal in ["endurance", "weight_loss"]:
        rest = 45
    else:
        rest = 75

    target_exercises = max(3, min(8, profile.minutes_per_session // 8))
    # Use explicit progression_type if set, otherwise fall back to experience-based default
    progression_type = getattr(profile, "progression_type", None) or _EXPERIENCE_PROGRESSION.get(profile.experience, "linear")

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
    elif profile.modality == "cardio":
        groups = _build_cardio(db, profile, rng, base_sets, max_sets, base_reps, max_reps,
                               rest, target_exercises, filtered, lower, progression_type)
    else:
        # Default to traditional weight training
        groups = _build_weight_training_days(db, profile, rng, base_sets, max_sets,
                                              base_reps, max_reps, rest, target_exercises,
                                              filtered, lower, progression_type)

    # Modality mix: append pure cardio days if needed
    if profile.modality in {"traditional_weight_training", "bodybuilding", "powerlifting", "hiit", "cardio"}:
        mix = getattr(profile, "modality_mix", "single")
        cardio_days = getattr(profile, "cardio_days_per_week", 0)
        if mix == "separate_days" and cardio_days > 0:
            for _ in range(cardio_days):
                cardio_day = _build_wildcard_day(db, profile, rng, progression_type, filtered, lower, force_cardio=True)
                if cardio_day.get("exercises"):
                    groups.append(cardio_day)
        elif mix == "mostly_primary" and cardio_days > 0:
            # Attach cardio to lifting days via cardio_timing (already handled in weight training builder)
            # Add a smaller number of pure cardio days
            pure_cardio_days = max(1, cardio_days - 1)
            for _ in range(pure_cardio_days):
                cardio_day = _build_wildcard_day(db, profile, rng, progression_type, filtered, lower, force_cardio=True)
                if cardio_day.get("exercises"):
                    groups.append(cardio_day)

    if not groups:
        groups.append({"name": "Full Body Day 1", "exercises": []})

    total_days = len(groups)
    modality_label = _modality_labels.get(profile.modality, "Traditional Weight Training")

    return {
        "name": f"{modality_label} Plan",
        "description": f"{total_days} days/week, {profile.minutes_per_session} min, {effective_goal}, {profile.experience}",
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
    """Build weight training days using templates based on focus and days_per_week."""
    days = min(profile.days_per_week, 6)
    groups = []

    # --- Auto-route structure based on days_per_week ---
    if days == 1:
        # Full body
        for day_idx in range(days):
            day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type)
            day["name"] = "Full Body"
            groups.append(day)
        return groups

    if days == 2:
        # Upper/Lower
        lower_first = profile.modality in ("powerlifting", "strongman")
        upper_count = 0
        lower_count = 0
        for day_idx in range(days):
            is_upper = (day_idx % 2 == 0 and not lower_first) or (day_idx % 2 == 1 and lower_first)
            if is_upper:
                upper_count += 1
                suffix = f" {chr(64 + upper_count)}"
                day = _build_day_from_template(db, profile, _UPPER_BODY, rng, progression_type,
                                               filtered_override=filtered)
                day["name"] = f"Upper{suffix}"
            else:
                lower_count += 1
                suffix = f" {chr(64 + lower_count)}"
                day = _build_day_from_template(db, profile, _LOWER_BODY, rng, progression_type,
                                               filtered_override=lower)
                day["name"] = f"Lower{suffix}"
            groups.append(day)
        return groups

    if days == 3:
        # PPL once through
        ppl_order = ["push", "pull", "legs"]
        ppl_labels = {"push": "Push", "pull": "Pull", "legs": "Legs"}
        occurrence_counts = {"push": 0, "pull": 0, "legs": 0}
        for day_idx in range(days):
            ppl_key = ppl_order[day_idx % 3]
            occurrence_counts[ppl_key] += 1
            template = _PPL_TEMPLATES[ppl_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            suffix = f" {chr(64 + occurrence_counts[ppl_key])}" if occurrence_counts[ppl_key] > 1 else ""
            day["name"] = f"{ppl_labels[ppl_key]}{suffix}"
            groups.append(day)
        return groups

    if days in (4, 5):
        # Body part split: chest/tris, back/bis, shoulders, legs
        bps_order = ["chest_tris", "back_bis", "shoulders", "legs"]
        bps_labels = {
            "chest_tris": "Chest & Triceps",
            "back_bis": "Back & Biceps",
            "shoulders": "Shoulders",
            "legs": "Legs & Core",
        }
        template_map = {
            "chest_tris": _CHEST_TRICEPS,
            "back_bis": _BACK_BICEPS,
            "shoulders": _SHOULDER_DAY,
            "legs": _LEG_DAY,
        }
        for day_idx in range(4):
            bps_key = bps_order[day_idx % len(bps_order)]
            template = template_map[bps_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            day["name"] = bps_labels[bps_key]
            groups.append(day)

        if days == 5:
            # Wildcard day: cardio/HIIT or active recovery
            groups.append(_build_wildcard_day(db, profile, rng, progression_type, filtered, lower))
        return groups

    # days == 6, use original focus-based logic
    if profile.focus == "full_body":
        # All days are full body
        for day_idx in range(days):
            day = _build_day_from_template(db, profile, _FULL_BODY_DAY, rng, progression_type)
            day["name"] = "Full Body"
            groups.append(day)

    elif profile.focus == "upper_lower_split":
        # Start with whichever group matches modality priority, then alternate.
        lower_first = profile.modality in ("powerlifting", "strongman")
        upper_count = 0
        lower_count = 0
        for day_idx in range(days):
            is_upper = (day_idx % 2 == 0 and not lower_first) or (day_idx % 2 == 1 and lower_first)
            if is_upper:
                upper_count += 1
                suffix = f" {chr(64 + upper_count)}"
                day = _build_day_from_template(db, profile, _UPPER_BODY, rng, progression_type,
                                               filtered_override=filtered)
                day["name"] = f"Upper{suffix}"
            else:
                lower_count += 1
                suffix = f" {chr(64 + lower_count)}"
                day = _build_day_from_template(db, profile, _LOWER_BODY, rng, progression_type,
                                               filtered_override=lower)
                day["name"] = f"Lower{suffix}"
            groups.append(day)

    elif profile.focus == "push_pull_legs":
        # Rotate push/pull/legs; add A/B suffix when same type repeats
        ppl_order = ["push", "pull", "legs"]
        ppl_labels = {"push": "Push", "pull": "Pull", "legs": "Legs"}
        occurrence_counts = {"push": 0, "pull": 0, "legs": 0}
        for day_idx in range(days):
            ppl_key = ppl_order[day_idx % 3]
            occurrence_counts[ppl_key] += 1
            template = _PPL_TEMPLATES[ppl_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            suffix = f" {chr(64 + occurrence_counts[ppl_key])}" if occurrence_counts[ppl_key] > 1 else ""
            day["name"] = f"{ppl_labels[ppl_key]}{suffix}"
            groups.append(day)

    elif profile.focus == "body_part_split":
        # Rotate body part days; add A/B suffix when same group repeats in 6-day weeks
        bps_order = ["chest_tris", "back_bis", "legs", "shoulders", "arms"]
        bps_labels = {
            "chest_tris": "Chest & Triceps",
            "back_bis": "Back & Biceps",
            "legs": "Legs & Core",
            "shoulders": "Shoulders",
            "arms": "Arms",
        }
        occurrence_counts = {k: 0 for k in bps_order}
        for day_idx in range(days):
            bps_key = bps_order[day_idx % 5]
            occurrence_counts[bps_key] += 1
            template_map = {
                "chest_tris": _CHEST_TRICEPS,
                "back_bis": _BACK_BICEPS,
                "legs": _LEG_DAY,
                "shoulders": _SHOULDER_DAY,
                "arms": _ARM_DAY,
            }
            template = template_map[bps_key]
            day = _build_day_from_template(db, profile, template, rng, progression_type)
            suffix = f" {chr(64 + occurrence_counts[bps_key])}" if occurrence_counts[bps_key] > 1 else ""
            day["name"] = f"{bps_labels[bps_key]}{suffix}"
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
    weight_modalities = {
        "traditional_weight_training", "bodybuilding", "powerlifting",
        # Common aliases the AI coach may emit
        "strength", "hypertrophy", "weight_training",
    }
    # Simple modality builders
    simple_modality_builders = {
        "hiit": _build_hiit,
        "cardio": _build_cardio,
    }

    # Template mapping for weight training focus types
    focus_templates = {
        "full_body": _FULL_BODY_DAY,
        "upper_lower_split": _UPPER_BODY,
        "push_pull_legs": _PUSH_DAY,  # Will rotate
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
            # For split templates, pass the correct filtered list
            if template is _UPPER_BODY:
                override = filtered
            elif template is _LOWER_BODY:
                override = lower
            else:
                override = filtered
            day = _build_day_from_template(db, profile, template, rng, progression_type,
                                           filtered_override=override)
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
    """Build a deterministic meal plan from a UserProfile.
    
    Returns None if required nutrition fields are not yet populated
    (nutrition questionnaire is out of scope for current release).
    """
    # Nutrition fields not yet in questionnaire — return None until nutrition flow is built
    return None

    # Keep below code for when nutrition is re-enabled:
    # if not profile.weight_kg or not profile.height_cm or not profile.sex or not getattr(profile, "age_range", None):
    #     return None
    ...
