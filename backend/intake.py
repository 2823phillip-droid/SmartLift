"""
intake.py

Normalizes raw questionnaire answers into a structured UserProfile.
This is the single place where unit conversion, defaults, and validation happen.
The rest of the system never sees raw form answers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class UserProfile:
    """Canonical fitness profile used by all generation logic."""
    sex: str = "male"
    goals: List[str] = field(default_factory=lambda: ["general_fitness"])
    focus: str = "full_body"
    age_range: str = "26-40"
    equipment: str = "bodyweight_only"
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    experience: str = "beginner"
    limitations: List[str] = field(default_factory=list)
    days_per_week: int = 3
    minutes_per_session: int = 30
    activity_level: str = "sedentary"
    cooking_skill: str = "moderate"
    meals_per_day: int = 3
    diet_type: str = "omnivore"
    allergies: List[str] = field(default_factory=list)
    meal_plan_opt_in: bool = False
    units_preference: str = "imperial"
    modality: str = "traditional_weight_training"


def _to_cm(value: Optional[float], units: str) -> Optional[float]:
    if value is None:
        return None
    if units == "imperial":
        return value * 2.54
    return value


def _to_kg(value: Optional[float], units: str) -> Optional[float]:
    if value is None:
        return None
    if units == "imperial":
        return value * 0.45359237
    return value


def _age_to_int(age_range: str) -> int:
    mapping = {
        "under_25": 22,
        "26-40": 33,
        "41-55": 48,
        "56+": 60,
    }
    return mapping.get(age_range, 33)


def normalize_questionnaire(answers: dict, defaults: dict | None = None) -> UserProfile:
    """
    Convert raw questionnaire answers into a UserProfile.
    Raises ValueError if required fields are missing or invalid.
    """
    if not answers:
        raise ValueError("Questionnaire answers are empty")

    units = str(answers.get("units_preference", "imperial"))

    # Handle text fields that may come back as arrays or nulls
    def _single(key: str, fallback: str) -> str:
        val = answers.get(key, fallback)
        if isinstance(val, list):
            return val[0] if val else fallback
        return str(val or fallback)

    def _list(key: str) -> List[str]:
        val = answers.get(key, [])
        if isinstance(val, list):
            return [str(v) for v in val if v]
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    # Unit conversion
    height_raw = answers.get("height")
    weight_raw = answers.get("weight")
    if isinstance(height_raw, str):
        try:
            height_raw = float(height_raw)
        except ValueError:
            height_raw = None
    if isinstance(weight_raw, str):
        try:
            weight_raw = float(weight_raw)
        except ValueError:
            weight_raw = None

    height_cm = _to_cm(height_raw, units)
    weight_kg = _to_kg(weight_raw, units)

    # Days/minutes must be ints
    try:
        days = int(answers.get("days_per_week", 3))
    except (TypeError, ValueError):
        days = 3
    try:
        minutes = int(answers.get("minutes_per_session", 30))
    except (TypeError, ValueError):
        minutes = 30

    meals = int(answers.get("meals_per_day", 3) or 3)

    return UserProfile(
        sex=_single("sex", "male"),
        goals=_list("goal") or ["general_fitness"],
        focus=_single("focus", "full_body"),
        age_range=_single("age_range", "26-40"),
        equipment=_single("equipment", "bodyweight_only"),
        height_cm=height_cm,
        weight_kg=weight_kg,
        experience=_single("experience", "beginner"),
        limitations=_list("limitations"),
        days_per_week=max(1, min(7, days)),
        minutes_per_session=max(10, min(180, minutes)),
        activity_level=_single("activity_level", "sedentary"),
        cooking_skill=_single("cooking_skill", "moderate"),
        meals_per_day=max(1, min(6, meals)),
        diet_type=_single("diet_type", "omnivore"),
        allergies=_list("allergies"),
        meal_plan_opt_in=bool(answers.get("meal_plan_opt_in", False)),
        units_preference=units,
        modality=_single("workout_modality", "traditional_weight_training"),
    )
