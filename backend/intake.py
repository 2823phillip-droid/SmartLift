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
    # Phase rotation (only used when goal == "full_program")
    current_phase: str = "foundation"
    phase_start_date: Optional[str] = None
    phase_history: List[str] = field(default_factory=list)  # ["foundation", "strength", "hypertrophy", ...]
    # Modality fields — primary is legacy-compatible, new fields enable mixed weeks
    modality: str = "traditional_weight_training"
    modality_primary: str = "traditional_weight_training"
    modality_secondary: List[str] = field(default_factory=list)
    modality_mix: str = "single"  # single | separate_days | together | mostly_primary | both
    week_schedule: Optional[Dict[str, str]] = None  # {"monday": "bodybuilding", "tuesday": "hiit", ...}
    # Cardio fields
    cardio_timing: str = "none"  # none | warmup_10 | warmup_15 | warmup_20 | finisher_15 | finisher_20 | hiit_finisher | separate_day
    cardio_type: str = "none"    # none | hiit | steady_state | walking | distance | mixed — standalone cardio days
    incorporated_cardio_type: str = "none"  # none | hiit | steady_state | walking | distance | mixed — cardio attached to lifting days
    cardio_days_per_week: int = 0  # 0-7, how many pure cardio days when separate/mostly_primary


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

    # Cardio fields — split timing from type for finer control
    cardio_raw = _single("cardio_preference", "none")
    if cardio_raw not in {"none", ""}:
        if cardio_raw in {"warmup_run", "warmup_run_15", "warmup_run_20", "finisher_run", "finisher_run_15", "finisher_run_20", "hiit_finisher", "separate_cardio"}:
            # Legacy single-field format — map timing only, type stays none
            cardio_timing = cardio_raw
            cardio_type = "none"
        elif "|" in cardio_raw:
            # Legacy pipe-delimited format
            parts = [p.strip() for p in cardio_raw.split("|", 1)]
            cardio_timing = parts[0] if parts[0] else "none"
            cardio_type = parts[1] if len(parts) > 1 and parts[1] else "none"
        else:
            cardio_timing = cardio_raw
            cardio_type = "none"
    else:
        # New format: separate fields
        cardio_timing = _single("cardio_timing", "none")
        cardio_type = _single("cardio_type", "none")

    cardio_timing = cardio_timing.replace("separate_cardio", "separate_day").replace("finisher_run", "finisher_15").replace("warmup_run", "warmup_10")
    cardio_type = cardio_type if cardio_type in {"none", "hiit", "steady_state", "walking", "distance", "mixed"} else "none"
    incorporated_cardio_type = _single("incorporated_cardio_type", "none")
    incorporated_cardio_type = incorporated_cardio_type if incorporated_cardio_type in {"none", "hiit", "steady_state", "walking", "distance", "mixed"} else "none"
    # Backward compatibility: if not set, fall back to cardio_type
    if incorporated_cardio_type == "none" and cardio_type not in {"none", "mixed"}:
        incorporated_cardio_type = cardio_type

    # Cardio days per week (for separate/mostly_primary modality_mix)
    try:
        cardio_days = int(answers.get("cardio_days_per_week", 0))
    except (TypeError, ValueError):
        cardio_days = 0
    cardio_days_per_week = max(0, min(7, cardio_days))

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
        current_phase=_single("current_phase", "foundation"),
        phase_start_date=str(answers.get("phase_start_date") or ""),
        phase_history=answers.get("phase_history", []) or [],
        modality=modality_primary,
        modality_primary=modality_primary,
        modality_secondary=modality_secondary,
        modality_mix=modality_mix,
        week_schedule=week_schedule,
        cardio_timing=cardio_timing,
        cardio_type=cardio_type,
        incorporated_cardio_type=incorporated_cardio_type,
        cardio_days_per_week=cardio_days_per_week,
    )
