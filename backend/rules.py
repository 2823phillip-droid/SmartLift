"""Canonical rule engine for deterministic workout coaching.

This module is the single source of truth for progression rules.
It is intentionally pure Python with no database dependency so it can be:
  - called from FastAPI routes,
  - unit-tested in isolation,
  - ported to TypeScript for on-device offline use in ActiveWorkoutScreen.

Design rules:
- identical inputs -> identical outputs unless user state changes
- no randomness
- no external I/O
- rules are additive; later AI profile layers may modulate inputs, but this
  module only produces deterministic prescriptions from the inputs it is given.
- ALWAYS resp. ALWAYS resp.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import List, Optional


class ProgressionType(str, Enum):
    linear = "linear"
    double = "double"
    percentage = "percentage"
    autoregulated = "autoregulated"


class WorkloadStatus(str, Enum):
    easy = "easy"
    moderate = "moderate"
    hard = "hard"
    deload = "deload"


@dataclass(frozen=True)
class SetRecord:
    """One completed set from history."""
    actual_weight: float
    actual_reps: int
    effort: Optional[int] = None
    rpe: Optional[float] = None
    rir: Optional[int] = None
    is_seeded: bool = False
    completed_at: Optional[datetime] = None


@dataclass
class RuleInput:
    """
    Complete input for a single prescription computation.

    Notes:
    - `history` may include seeded sets; rules should ignore seeded sets unless
      there is no real data.
    - AI profile fields are optional and default to neutral values so the
      canonical module works without Phase 4 installed.
    """
    start_weight: float = 0.0
    reps_target: int = 10
    sets_target: int = 3
    rest_seconds: int = 90
    progression_type: ProgressionType = ProgressionType.linear
    history: List[SetRecord] = field(default_factory=list)

    # Linear/double defaults
    linear_increment: float = 2.5
    double_increment: float = 5.0
    double_success_threshold: int = 2

    # Percentage / 1RM defaults
    estimated_1rm: Optional[float] = None
    percentage_of_1rm: float = 0.8
    pct_increment_success: float = 2.5
    pct_decrement_fail: float = 5.0

    # Periodization / deload
    week: int = 1
    periodization_cycle_weeks: int = 4
    force_deload: bool = False
    deload_volume_factor: float = 0.6
    deload_intensity_factor: float = 0.7

    # Effort thresholds
    hard_effort_threshold: int = 4
    easy_effort_threshold: int = 2

    # Phase 4 AI profile fields (optional, additive only)
    ai_progression_sensitivity: Optional[float] = None
    ai_volume_tolerance: Optional[float] = None
    ai_recovery_multiplier: Optional[float] = None
    ai_preferred_rir: Optional[int] = None
    ai_stress_fatigue_adjustment: Optional[float] = None
    ai_calibrated_1rm: Optional[float] = None


@dataclass(frozen=True)
class Prescription:
    """
    Deterministic prescription output.

    This is the single output contract used by backend routes and ported
    to TypeScript for the app's offline autoregulation path.
    """
    next_weight: float
    next_reps: int
    next_sets: int
    rest_seconds: int
    coaching_message: str
    workload_status: WorkloadStatus
    prescription_type: str
    is_deload: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _today() -> date:
    return datetime.utcnow().date()


def _is_deload_week(rule: RuleInput) -> bool:
    """Deload is either forced or scheduled by simple weekly periodization."""
    if rule.force_deload:
        return True
    if rule.periodization_cycle_weeks > 0:
        return (rule.week % rule.periodization_cycle_weeks) == 0
    return False


def _recent_real_sets(history: List[SetRecord], limit: int = 20) -> List[SetRecord]:
    """Return non-seeded sets, newest first, limited."""
    real = [s for s in history if not s.is_seeded]
    return real[:limit]


def _last_session_top_set(history: List[SetRecord]):
    """Return the top-set record from the most recent completed session.
    Returns None if no history.
    """
    real = _recent_real_sets(history, limit=20)
    if not real:
        return None
    # crude session grouping by date; newest date wins
    latest_date = max((s.completed_at.date() for s in real if s.completed_at), default=None)
    if latest_date is None:
        return None
    latest_sets = [s for s in real if s.completed_at and s.completed_at.date() == latest_date]
    if not latest_sets:
        return None
    # top set = highest weight, then highest reps
    latest_sets.sort(key=lambda s: (s.actual_weight, s.actual_reps), reverse=True)
    return latest_sets[0]


def _effective_increment(base: float, rule: RuleInput) -> float:
    """Apply AI sensitivity to a base increment, if present."""
    sensitivity = rule.ai_progression_sensitivity
    if sensitivity is None:
        return base
    return max(0.0, base * float(sensitivity))


def _apply_stress_fatigue(weight: float, reps: int, sets: int, rule: RuleInput) -> tuple[float, int, int]:
    """Redistribute load when user is under stress/fatigue."""
    adj = rule.ai_stress_fatigue_adjustment
    if adj is None or adj == 0:
        return weight, reps, sets
    weight = float(weight * (1.0 + float(adj)))
    reps = max(1, int(reps * (1.0 + float(adj) * 0.5)))
    sets = max(1, int(sets * (1.0 + float(adj) * 0.25)))
    return weight, reps, sets


# ---------------------------------------------------------------------------
# Core rule implementations
# ---------------------------------------------------------------------------

def _linear_rule(rule: RuleInput, top_set) -> Prescription:
    increment = _effective_increment(rule.linear_increment, rule)
    rest = rule.rest_seconds

    if rule.ai_recovery_multiplier is not None:
        rest = int(rest * float(rule.ai_recovery_multiplier))

    if top_set is None:
        msg = "No history yet. Starting at base weight."
        return Prescription(
            next_weight=float(rule.start_weight),
            next_reps=int(rule.reps_target),
            next_sets=int(rule.sets_target),
            rest_seconds=rest,
            coaching_message=msg,
            workload_status=WorkloadStatus.moderate,
            prescription_type=ProgressionType.linear.value,
        )

    weight = float(top_set.actual_weight)
    reps = int(top_set.actual_reps)
    effort = int(top_set.effort) if top_set.effort is not None else 3

    if reps >= rule.reps_target and effort <= rule.easy_effort_threshold:
        msg = f"Strong top set ({reps} reps, effort {effort}). Adding {increment} lbs next session."
        next_weight = weight + increment
        next_reps = rule.reps_target
        status = WorkloadStatus.easy
    elif reps >= rule.reps_target:
        msg = f"Hit top reps with solid effort ({effort}). Small bump of {increment} lbs."
        next_weight = weight + increment
        next_reps = rule.reps_target
        status = WorkloadStatus.moderate
    else:
        msg = f"Missed top reps ({reps} of {rule.reps_target}). Keeping weight to build consistency."
        next_weight = weight
        next_reps = rule.reps_target
        status = WorkloadStatus.hard

    return Prescription(
        next_weight=next_weight,
        next_reps=next_reps,
        next_sets=rule.sets_target,
        rest_seconds=rest,
        coaching_message=msg,
        workload_status=status,
        prescription_type=ProgressionType.linear.value,
    )


def _double_rule(rule: RuleInput, top_set) -> Prescription:
    """Double progression: increase after N successful top sets."""
    increment = _effective_increment(rule.double_increment, rule)
    rest = rule.rest_seconds
    if rule.ai_recovery_multiplier is not None:
        rest = int(rest * float(rule.ai_recovery_multiplier))

    if top_set is None:
        msg = "No history yet. Starting at base weight."
        return Prescription(
            next_weight=float(rule.start_weight),
            next_reps=int(rule.reps_target),
            next_sets=int(rule.sets_target),
            rest_seconds=rest,
            coaching_message=msg,
            workload_status=WorkloadStatus.moderate,
            prescription_type=ProgressionType.double.value,
        )

    weight = float(top_set.actual_weight)
    reps = int(top_set.actual_reps)
    effort = int(top_set.effort) if top_set.effort is not None else 3

    real = _recent_real_sets(rule.history, limit=rule.double_success_threshold * rule.sets_target)
    latest_success_count = 0
    if len(real) >= rule.double_success_threshold and reps >= rule.reps_target and effort <= rule.hard_effort_threshold:
        latest_success_count = 1
        # count how many of the most recent preceding sessions also met success
        dates = sorted(
            {s.completed_at.date() for s in real if s.completed_at},
            reverse=True,
        )
        if len(dates) > 1:
            consecutive = 1
            for i in range(1, len(dates)):
                if dates[i - 1] - dates[i] == timedelta(days=1):
                    consecutive += 1
                else:
                    break
            latest_success_count = min(consecutive, rule.double_success_threshold)

    if latest_success_count >= rule.double_success_threshold:
        msg = f"Double progression triggered after {latest_success_count} strong sessions. Up {increment} lbs."
        next_weight = weight + increment
        next_reps = rule.reps_target
        status = WorkloadStatus.easy if effort <= rule.easy_effort_threshold else WorkloadStatus.moderate
    else:
        msg = f"Build volume first ({latest_success_count}/{rule.double_success_threshold} solid sessions). Keep weight."
        next_weight = weight
        next_reps = rule.reps_target
        status = WorkloadStatus.hard

    return Prescription(
        next_weight=next_weight,
        next_reps=next_reps,
        next_sets=rule.sets_target,
        rest_seconds=rest,
        coaching_message=msg,
        workload_status=status,
        prescription_type=ProgressionType.double.value,
    )


def _percentage_rule(rule: RuleInput, top_set) -> Prescription:
    """Percentage-based / 1RM rule."""
    rest = rule.rest_seconds
    if rule.ai_recovery_multiplier is not None:
        rest = int(rest * float(rule.ai_recovery_multiplier))

    one_rm = rule.ai_calibrated_1rm or rule.estimated_1rm
    if one_rm is None or one_rm <= 0:
        msg = "Missing 1RM. Falling back to base weight."
        return Prescription(
            next_weight=float(rule.start_weight),
            next_reps=int(rule.reps_target),
            next_sets=int(rule.sets_target),
            rest_seconds=rest,
            coaching_message=msg,
            workload_status=WorkloadStatus.moderate,
            prescription_type=ProgressionType.percentage.value,
        )

    base = float(one_rm * rule.percentage_of_1rm)
    if top_set is None:
        msg = f"No history. Starting at {rule.percentage_of_1rm:.0%} of estimated 1RM ({base:.1f} lbs)."
        return Prescription(
            next_weight=base,
            next_reps=int(rule.reps_target),
            next_sets=int(rule.sets_target),
            rest_seconds=rest,
            coaching_message=msg,
            workload_status=WorkloadStatus.moderate,
            prescription_type=ProgressionType.percentage.value,
        )

    weight = float(top_set.actual_weight)
    reps = int(top_set.actual_reps)
    effort = int(top_set.effort) if top_set.effort is not None else 3

    if reps >= rule.reps_target and effort <= rule.easy_effort_threshold:
        next_weight = weight + _effective_increment(rule.pct_increment_success, rule)
        msg = f"Great session. Advanced load to {next_weight:.1f} lbs."
        status = WorkloadStatus.easy
    elif reps >= rule.reps_target:
        next_weight = weight + _effective_increment(rule.pct_increment_success * 0.5, rule)
        msg = f"Solid session. Small bump to {next_weight:.1f} lbs."
        status = WorkloadStatus.moderate
    else:
        next_weight = max(base, weight - rule.pct_decrement_fail)
        msg = f"Missed reps. Dropped to {next_weight:.1f} lbs to rebuild."
        status = WorkloadStatus.hard

    return Prescription(
        next_weight=next_weight,
        next_reps=rule.reps_target,
        next_sets=rule.sets_target,
        rest_seconds=rest,
        coaching_message=msg,
        workload_status=status,
        prescription_type=ProgressionType.percentage.value,
    )


def _autoregulated_rule(rule: RuleInput, top_set) -> Prescription:
    """RPE / RIR autoregulation: session-by-session load adjustment."""
    rest = rule.rest_seconds
    if rule.ai_recovery_multiplier is not None:
        rest = int(rest * float(rule.ai_recovery_multiplier))

    weight = float(rule.start_weight)
    reps = int(rule.reps_target)
    sets = int(rule.sets_target)

    if top_set is None:
        msg = "No history yet. Starting conservatively."
        return Prescription(
            next_weight=weight,
            next_reps=reps,
            next_sets=sets,
            rest_seconds=rest,
            coaching_message=msg,
            workload_status=WorkloadStatus.moderate,
            prescription_type=ProgressionType.autoregulated.value,
        )

    last_weight = float(top_set.actual_weight)
    last_reps = int(top_set.actual_reps)
    effort = int(top_set.effort) if top_set.effort is not None else 3
    rir = int(top_set.rir) if top_set.rir is not None else (rule.reps_target - last_reps)

    if effort <= 2 and rir >= 2:
        next_weight = last_weight + _effective_increment(rule.linear_increment, rule)
        msg = f"Easy set (effort {effort}, RIR ~{rir}). Bumping to {next_weight:.1f} lbs."
        status = WorkloadStatus.easy
    elif effort <= 3 and rir >= 1:
        next_weight = last_weight + _effective_increment(rule.linear_increment * 0.5, rule)
        msg = f"Moderate effort (effort {effort}, RIR ~{rir}). Micro-load to {next_weight:.1f} lbs."
        status = WorkloadStatus.moderate
    elif effort >= rule.hard_effort_threshold or rir <= 0:
        next_weight = last_weight - _effective_increment(rule.linear_increment * 0.5, rule)
        msg = f"Tough set (effort {effort}, RIR ~{rir}). Dropping to {next_weight:.1f} lbs for recovery."
        status = WorkloadStatus.hard
    else:
        next_weight = last_weight
        msg = f"Matching last load (effort {effort}, RIR ~{rir})."
        status = WorkloadStatus.moderate

    return Prescription(
        next_weight=next_weight,
        next_reps=reps,
        next_sets=sets,
        rest_seconds=rest,
        coaching_message=msg,
        workload_status=status,
        prescription_type=ProgressionType.autoregulated.value,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_prescription(rule: RuleInput) -> Prescription:
    """
    Deterministic entry point.

    Returns the next prescription based on the provided rule input.
    """
    top_set = _last_session_top_set(rule.history)

    if _is_deload_week(rule):
        base_prescription = _next_prescription_by_type(rule, top_set)
        weight = float(base_prescription.next_weight * rule.deload_intensity_factor)
        reps = max(1, int(base_prescription.next_reps * rule.deload_volume_factor))
        sets = max(1, int(base_prescription.next_sets * rule.deload_volume_factor))
        msg = "Deload week selected. Reduced volume/intensity to recover."
        return Prescription(
            next_weight=weight,
            next_reps=reps,
            next_sets=sets,
            rest_seconds=rule.rest_seconds,
            coaching_message=msg,
            workload_status=WorkloadStatus.deload,
            prescription_type=base_prescription.prescription_type,
            is_deload=True,
        )

    return _next_prescription_by_type(rule, top_set)


def _next_prescription_by_type(rule: RuleInput, top_set):
    progressions = {
        ProgressionType.linear: _linear_rule,
        ProgressionType.double: _double_rule,
        ProgressionType.percentage: _percentage_rule,
        ProgressionType.autoregulated: _autoregulated_rule,
    }
    fn = progressions.get(rule.progression_type, _linear_rule)
    return fn(rule, top_set)


def apply_ai_profile(rule: RuleInput) -> RuleInput:
    """
    Return a modified RuleInput after applying neutral AI calibrations.

    This helper is provided for Phase 4 integration, but the core rules
    do not require AI to function; defaults remain deterministic.
    """
    r = RuleInput(
        start_weight=rule.start_weight,
        reps_target=rule.reps_target,
        sets_target=rule.sets_target,
        rest_seconds=rule.rest_seconds,
        progression_type=rule.progression_type,
        history=rule.history,
        linear_increment=rule.linear_increment,
        double_increment=rule.double_increment,
        double_success_threshold=rule.double_success_threshold,
        estimated_1rm=rule.ai_calibrated_1rm or rule.estimated_1rm,
        percentage_of_1rm=rule.percentage_of_1rm,
        pct_increment_success=rule.pct_increment_success,
        pct_decrement_fail=rule.pct_decrement_fail,
        week=rule.week,
        periodization_cycle_weeks=rule.periodization_cycle_weeks,
        force_deload=rule.force_deload,
        deload_volume_factor=rule.deload_volume_factor,
        deload_intensity_factor=rule.deload_intensity_factor,
        hard_effort_threshold=rule.hard_effort_threshold,
        easy_effort_threshold=rule.easy_effort_threshold,
        ai_progression_sensitivity=rule.ai_progression_sensitivity or 1.0,
        ai_volume_tolerance=rule.ai_volume_tolerance or 1.0,
        ai_recovery_multiplier=rule.ai_recovery_multiplier or 1.0,
        ai_preferred_rir=rule.ai_preferred_rir,
        ai_stress_fatigue_adjustment=rule.ai_stress_fatigue_adjustment or 0.0,
        ai_calibrated_1rm=rule.ai_calibrated_1rm,
    )
    return r
