"""
services/generation.py

Orchestrator for workout/meal plan generation.
This is the only layer that FastAPI routes should call.

Flow:
  raw questionnaire answers → intake.normalize_questionnaire()
                            → UserProfile
                            → progression.generate_workout() / generate_meal_plan()
                            → structured dicts

The AI voice layer will wrap these structured outputs later.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from intake import normalize_questionnaire, UserProfile
from progression import generate_workout, generate_meal_plan


def build_workout_draft(db: Session, answers: dict, user_id: Optional[int] = None) -> dict:
    """Normalize answers and generate a workout draft."""
    profile = normalize_questionnaire(answers)
    return generate_workout(db, profile, user_id)


def build_meal_plan_draft(answers: dict) -> Optional[dict]:
    """Normalize answers and generate a meal plan draft.
    
    Returns None because nutrition is out of scope for current release.
    """
    return None


def build_full_draft(db: Session, answers: dict, user_id: Optional[int] = None) -> tuple[dict, Optional[dict]]:
    """
    Generate both workout and meal plan drafts.
    Returns:
      (workout_dict, meal_plan_dict | None)
    """
    profile = normalize_questionnaire(answers)
    workout = generate_workout(db, profile, user_id)
    meal = None  # Nutrition out of scope — always None until nutrition flow is built
    return workout, meal
