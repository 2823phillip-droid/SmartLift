"""
intake.py

Normalizes raw questionnaire answers into a structured UserProfile.
This is the single place where unit conversion, defaults, and validation happen.
The rest of the system never sees raw form answers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(frozen=True)
class UserProfile:
    """Canonical fitness profile used by all generation logic."""
    sex: str = "male"
    goals: List[str] = field(default_factory=lambda: ["general_fitness"])
    focus: str = "full_body"
    equipment: str = "bodyweight_only"
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    experience: str = "beginner"
    limitations: List[str] = field(default_factory=list)
    days_per_week: int = 3
    minutes_per_session: int = 30
    activity_level: str = "sedentary"
    units_preference: str = "imperial"
    # Training history and progression
    training_history: str = "just_starting"
    progression_type: str = "linear"
    # Modality fields — primary is legacy-compatible, new fields enable mixed weeks
    modality: str = "traditional_weight_training"
    modality_primary: str = "traditional_weight_training"
    modality_secondary: List[str] = field(default_factory=list)
    modality_mix: str = "single"  # single | separate_days | together | mostly_primary
    week_schedule: Optional[Dict[str, str]] = None  # {"monday": "bodybuilding", "tuesday": "hiit", ...}


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

    # Modality fields
    modality_primary = _single("workout_modality", "traditional_weight_training")
    modality_secondary = _list("modality_secondary")
    modality_mix = _single("modality_mix", "single")

    # Week schedule from AI coach (optional dict)
    week_schedule_raw = answers.get("week_schedule")
    if isinstance(week_schedule_raw, dict):
        week_schedule = week_schedule_raw
    else:
        week_schedule = None

    return UserProfile(
        sex=_single("sex", "male"),
        goals=_list("goal") or ["general_fitness"],
        focus=_single("focus", "full_body"),
        equipment=_single("equipment", "bodyweight_only"),
        height_cm=height_cm,
        weight_kg=weight_kg,
        experience=_single("experience", "beginner"),
        limitations=_list("limitations"),
        days_per_week=max(1, min(7, days)),
        minutes_per_session=max(10, min(180, minutes)),
        activity_level=_single("activity_level", "sedentary"),
        units_preference=units,
        training_history=_single("training_history", "just_starting"),
        progression_type=_single("progression_type", "linear"),
        modality=modality_primary,
        modality_primary=modality_primary,
        modality_secondary=modality_secondary,
        modality_mix=modality_mix,
        week_schedule=week_schedule,
    )
