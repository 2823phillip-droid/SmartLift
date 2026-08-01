"""
Canonical exercise whitelist — data-grounded from ExerciseLibrary (~1318 entries).

Design goals:
  1. Recognizable, standard exercise names
  2. Title Case for professional display
  3. Explicit tier ordering within each movement (compound → accessory → isolation)
  4. Equipment hint per exercise for matching

Matching:
  - Each canonical entry has a list of `match` keyword fragments.
  - The filter tries to find an ExerciseLibrary entry whose name contains
    one of these fragments (case-insensitive).
  - First match wins, so list more-specific fragments first.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CanonicalExercise:
    name: str                # Title Case display name
    movement: str            # push / pull / squat / hinge / carry / core / cardio / plyometric / mobility
    tier: int                # 1=compound  2=major accessory  3=accessory  4=isolation
    equipment: str           # primary equipment class (barbell, dumbbell, cable, bodyweight, machine, kettlebell, band)
    match: List[str] = field(default_factory=list)  # keyword fragments to find in ExerciseLibrary


# ---------------------------------------------------------------------------
# Canonical pool — ordered by tier within each movement
# ---------------------------------------------------------------------------

_CANONICAL: List[CanonicalExercise] = [

    # ── PUSH (chest, shoulders, triceps) ───────────────────────────────────
    CanonicalExercise("Barbell Bench Press",      "push", 1, "barbell",    ["bench press", "barbell bench press"]),
    CanonicalExercise("Incline Barbell Bench Press", "push", 1, "barbell", ["incline barbell bench press", "incline bench press", "incline barbell"]),
    CanonicalExercise("Dumbbell Bench Press",     "push", 2, "dumbbell",   ["dumbbell bench press"]),
    CanonicalExercise("Incline Dumbbell Bench Press", "push", 2, "dumbbell", ["incline dumbbell bench press", "incline dumbbell press", "dumbbell incline"]),
    CanonicalExercise("Close-Grip Bench Press",   "push", 1, "barbell",    ["close-grip bench press"]),
    CanonicalExercise("Barbell Overhead Press",   "push", 1, "barbell",    ["overhead press", "barbell overhead"]),
    CanonicalExercise("Seated Dumbbell Shoulder Press", "push", 2, "dumbbell", ["seated shoulder press", "dumbbell shoulder"]),
    CanonicalExercise("Arnold Press",             "push", 2, "dumbbell",   ["arnold press"]),
    CanonicalExercise("Push-Up",                  "push", 1, "bodyweight", ["push up"]),
    CanonicalExercise("Dip",                      "push", 1, "bodyweight", ["chest dip", "tricep dip"]),
    CanonicalExercise("Dumbbell Fly",             "push", 3, "dumbbell",   ["dumbbell fly", "chest fly"]),
    CanonicalExercise("Cable Fly",                "push", 3, "cable",      ["cable fly", "cable chest fly"]),
    CanonicalExercise("Pec Deck",                 "push", 3, "machine",    ["pec deck", "pec deck fly"]),
    CanonicalExercise("Lateral Raise",            "push", 4, "dumbbell",   ["lateral raise"]),
    CanonicalExercise("Front Raise",              "push", 4, "dumbbell",   ["front raise"]),
    CanonicalExercise("Reverse Fly",              "push", 4, "dumbbell",   ["reverse fly", "rear delt"]),
    CanonicalExercise("Face Pull",                "push", 3, "cable",      ["face pull"]),
    CanonicalExercise("Upright Row",              "push", 2, "barbell",    ["upright row"]),
    CanonicalExercise("Tricep Pushdown",          "push", 4, "cable",      ["tricep pushdown"]),
    CanonicalExercise("Skull Crusher",            "push", 4, "barbell",    ["skull crusher", "lying triceps extension"]),
    CanonicalExercise("Overhead Tricep Extension","push", 4, "dumbbell",   ["overhead tricep extension"]),
    CanonicalExercise("Bench Dip",                "push", 4, "bodyweight", ["bench dip"]),

    # ── PULL (back, biceps, rear delts) ───────────────────────────────────
    CanonicalExercise("Barbell Bent Over Row",    "pull", 1, "barbell",    ["bent over row", "barbell row"]),
    CanonicalExercise("Dumbbell Row",             "pull", 2, "dumbbell",   ["dumbbell row", "one arm dumbbell row"]),
    CanonicalExercise("Seated Cable Row",         "pull", 2, "cable",      ["seated cable row", "cable row", "seated row"]),
    CanonicalExercise("Lat Pulldown",             "pull", 1, "cable",      ["lat pulldown"]),
    CanonicalExercise("Pull-Up",                  "pull", 1, "bodyweight", ["pull-up", "pull up"]),
    CanonicalExercise("Chin-Up",                  "pull", 1, "bodyweight", ["chin-up", "chin up"]),
    CanonicalExercise("T-Bar Row",                "pull", 2, "machine",    ["t-bar row"]),
    CanonicalExercise("Straight Arm Pulldown",    "pull", 3, "cable",      ["straight arm pulldown"]),
    CanonicalExercise("Meadows Row",              "pull", 2, "dumbbell",   ["meadows row"]),
    CanonicalExercise("Barbell Curl",             "pull", 4, "barbell",    ["barbell curl", "ez barbell curl"]),
    CanonicalExercise("Dumbbell Curl",            "pull", 4, "dumbbell",   ["dumbbell curl"]),
    CanonicalExercise("Hammer Curl",              "pull", 4, "dumbbell",   ["hammer curl"]),
    CanonicalExercise("Preacher Curl",            "pull", 4, "barbell",    ["preacher curl"]),
    CanonicalExercise("Barbell Wrist Curl",       "pull", 4, "barbell",    ["barbell wrist curl"]),
    CanonicalExercise("Dumbbell Wrist Curl",      "pull", 4, "dumbbell",   ["dumbbell wrist curl"]),
    CanonicalExercise("Farmer Walk",              "pull", 2, "dumbbell",   ["farmer walk", "farmers walk", "suitcase carry"]),

    # ── SQUAT (quads, glutes, calves) ─────────────────────────────────────
    CanonicalExercise("Barbell Back Squat",       "squat", 1, "barbell",  ["barbell back squat", "barbell squat"]),
    CanonicalExercise("Barbell Front Squat",      "squat", 1, "barbell",  ["barbell front squat", "front squat"]),
    CanonicalExercise("Goblet Squat",             "squat", 1, "dumbbell", ["goblet squat", "dumbbell goblet", "kettlebell goblet"]),
    CanonicalExercise("Bulgarian Split Squat",    "squat", 2, "dumbbell", ["bulgarian split squat", "split squat"]),
    CanonicalExercise("Leg Press",                "squat", 2, "machine",  ["leg press"]),
    CanonicalExercise("Leg Extension",            "squat", 4, "machine",  ["leg extension"]),
    CanonicalExercise("Hip Thrust",               "squat", 1, "barbell",  ["barbell hip thrust", "hip thrust"]),
    CanonicalExercise("Step Up",                  "squat", 2, "dumbbell", ["step up"]),
    CanonicalExercise("Walking Lunge",            "squat", 2, "bodyweight", ["walking lunge"]),
    CanonicalExercise("Reverse Lunge",            "squat", 2, "bodyweight", ["reverse lunge", "rear lunge"]),
    CanonicalExercise("Bodyweight Squat",         "squat", 1, "bodyweight", ["bodyweight squat"]),
    CanonicalExercise("Wall Sit",                 "squat", 3, "bodyweight", ["wall sit"]),
    CanonicalExercise("Standing Calf Raise",      "squat", 4, "machine",   ["standing calf raise"]),
    CanonicalExercise("Seated Calf Raise",        "squat", 4, "machine",   ["seated calf raise", "seated calf press"]),

    # ── HINGE (hamstrings, glutes, lower back) ────────────────────────────
    CanonicalExercise("Barbell Deadlift",         "hinge", 1, "barbell", ["barbell deadlift", "deadlift"]),
    CanonicalExercise("Romanian Deadlift",        "hinge", 1, "barbell", ["romanian deadlift", "rdl"]),
    CanonicalExercise("Sumo Deadlift",            "hinge", 1, "barbell", ["sumo deadlift"]),
    CanonicalExercise("Barbell Glute Bridge",     "hinge", 1, "barbell", ["barbell glute bridge", "glute bridge"]),
    CanonicalExercise("Kettlebell Swing",         "hinge", 1, "kettlebell", ["kettlebell swing"]),
    CanonicalExercise("Good Morning",             "hinge", 2, "barbell", ["good morning"]),
    CanonicalExercise("Back Extension",           "hinge", 2, "bodyweight", ["back extension"]),
    CanonicalExercise("Hip Abduction",            "hinge", 4, "machine",  ["hip abduction"]),

    # ── CARRY ─────────────────────────────────────────────────────────────
    CanonicalExercise("Farmer Walk",              "carry", 2, "dumbbell",  ["farmer walk", "farmers walk", "suitcase carry"]),

    # ── CORE ──────────────────────────────────────────────────────────────
    CanonicalExercise("Plank",                    "core", 1, "bodyweight", ["plank"]),
    CanonicalExercise("Side Plank",               "core", 1, "bodyweight", ["side plank"]),
    CanonicalExercise("Crunch",                   "core", 4, "bodyweight", ["crunch"]),
    CanonicalExercise("Sit-Up",                   "core", 4, "bodyweight", ["sit-up", "sit up"]),
    CanonicalExercise("Russian Twist",            "core", 3, "bodyweight", ["russian twist"]),
    CanonicalExercise("Mountain Climber",         "core", 1, "bodyweight", ["mountain climber"]),
    CanonicalExercise("Hanging Leg Raise",        "core", 2, "bodyweight", ["hanging leg raise"]),
    CanonicalExercise("Flutter Kick",             "core", 4, "bodyweight", ["flutter kick"]),
    CanonicalExercise("Dead Bug",                 "core", 1, "bodyweight", ["dead bug"]),
    CanonicalExercise("Ab Wheel",                 "core", 3, "ab wheel",   ["ab wheel"]),
    CanonicalExercise("Pallof Press",             "core", 3, "cable",      ["pallof press"]),
    CanonicalExercise("Leg Raise",                "core", 3, "bodyweight", ["leg raise"]),

    # ── CARDIO ────────────────────────────────────────────────────────────
    CanonicalExercise("Running",                  "cardio", 1, "bodyweight", ["running", "run"]),
    CanonicalExercise("Jump Rope",                "cardio", 2, "rope",      ["jump rope"]),
    CanonicalExercise("Rowing",                   "cardio", 1, "machine",   ["rowing", "row"]),
    CanonicalExercise("Cycling",                  "cardio", 1, "machine",   ["cycling", "cycle"]),
    CanonicalExercise("Stairmaster",              "cardio", 1, "machine",   ["stairmaster", "stepper", "stepmill"]),
    CanonicalExercise("Elliptical",               "cardio", 1, "machine",   ["elliptical"]),
    CanonicalExercise("Assault Bike",             "cardio", 2, "machine",   ["assault bike"]),
    CanonicalExercise("Battle Rope",              "cardio", 2, "rope",      ["battle rope"]),
    CanonicalExercise("Ski Erg",                  "cardio", 2, "machine",   ["ski erg", "skierg"]),

    # ── PLYOMETRIC ────────────────────────────────────────────────────────
    CanonicalExercise("Burpee",                   "plyometric", 1, "bodyweight", ["burpee"]),
    CanonicalExercise("Box Jump",                 "plyometric", 1, "bodyweight", ["box jump"]),
    CanonicalExercise("Jump Squat",               "plyometric", 1, "bodyweight", ["jump squat"]),
    CanonicalExercise("Jump Lunge",               "plyometric", 2, "bodyweight", ["jump lunge"]),
    CanonicalExercise("Depth Jump",               "plyometric", 3, "bodyweight", ["depth jump"]),
    CanonicalExercise("Tuck Jump",                "plyometric", 3, "bodyweight", ["tuck jump"]),

    # ── MOBILITY ──────────────────────────────────────────────────────────
    CanonicalExercise("Downward Dog",             "mobility", 1, "bodyweight", ["downward dog"]),
    CanonicalExercise("Warrior Pose",             "mobility", 1, "bodyweight", ["warrior pose", "warrior"]),
    CanonicalExercise("Sun Salutation",           "mobility", 1, "bodyweight", ["sun salutation"]),
    CanonicalExercise("Cat Cow",                  "mobility", 1, "bodyweight", ["cat cow"]),
    CanonicalExercise("Pigeon Pose",              "mobility", 1, "bodyweight", ["pigeon pose", "pigeon"]),
    CanonicalExercise("Hamstring Stretch",        "mobility", 2, "bodyweight", ["hamstring stretch"]),
    CanonicalExercise("Hip Flexor Stretch",       "mobility", 2, "bodyweight", ["hip flexor stretch"]),
    CanonicalExercise("Child Pose",               "mobility", 1, "bodyweight", ["child pose"]),
    CanonicalExercise("Cobra",                    "mobility", 2, "bodyweight", ["cobra"]),
    CanonicalExercise("Bridge Pose",              "mobility", 1, "bodyweight", ["bridge pose", "bridge"]),
    CanonicalExercise("Tree Pose",                "mobility", 1, "bodyweight", ["tree pose"]),
]

assert len(_CANONICAL) >= 90, f"Expected ~100 canonical exercises, got {len(_CANONICAL)}"


# ---------------------------------------------------------------------------
# Lookup tables (built once at import)
# ---------------------------------------------------------------------------

# movement → list[CanonicalExercise], already ordered by tier
_POOL_BY_MOVEMENT: Dict[str, List[CanonicalExercise]] = {}
for ex in _CANONICAL:
    _POOL_BY_MOVEMENT.setdefault(ex.movement, []).append(ex)

# Build keyword → canonical mapping for fast lookup
# Lowercase keyword fragment → first matching CanonicalExercise
_KEYWORD_MAP: Dict[str, CanonicalExercise] = {}
for ex in _CANONICAL:
    seen: set = set()
    for kw in ex.match:
        lk = kw.lower().strip()
        if lk not in seen:
            seen.add(lk)
            _KEYWORD_MAP[lk] = ex

# Flat list for iteration
_ALL_CANONICAL: List[CanonicalExercise] = list(_CANONICAL)


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def _canonical_name(exercise_name: str) -> Optional[CanonicalExercise]:
    """Return the matching CanonicalExercise for a raw ExerciseLibrary name, or None."""
    lower = exercise_name.lower().strip()
    # Sort keywords longest-first so more-specific matches win
    sorted_keywords = sorted(_KEYWORD_MAP.items(), key=lambda kv: len(kw := kv[0]), reverse=True)
    for kw, canon in sorted_keywords:
        # Match as whole word/phrase, not as substring of another word
        pattern = r'\b' + re.escape(kw) + r'\b'
        if re.search(pattern, lower):
            return canon
    # Partial name containment as fallback (whole-phrase containment only)
    for canon in _CANONICAL:
        cn = canon.name.lower()
        if cn in lower or lower in cn:
            return canon
    return None


def canonical_display_name(exercise_name: str) -> str:
    """Return the Title Case canonical name, or the original if not in whitelist."""
    hit = _canonical_name(exercise_name)
    return hit.name if hit else exercise_name


# ---------------------------------------------------------------------------
# Pool access
# ---------------------------------------------------------------------------

def get_canonical_pool() -> Dict[str, List[CanonicalExercise]]:
    """Return movement → canonical exercises (ordered by tier)."""
    return dict(_POOL_BY_MOVEMENT)


def all_canonical_exercises() -> List[CanonicalExercise]:
    """Return every canonical exercise."""
    return list(_ALL_CANONICAL)


def is_canonical(exercise_name: str) -> bool:
    return _canonical_name(exercise_name) is not None


def canonical_names() -> List[str]:
    return [ex.name for ex in _ALL_CANONICAL]
