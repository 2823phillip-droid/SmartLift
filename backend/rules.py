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
from datetime import date, datetime, timedelta, timezone
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


def compute_load(history: List[SetRecord], window_days: int = 21) -> int:
    """Return 0-100 accumulated training load from recent history."""
    now = datetime.utcnow()
    cutoff = now - timedelta(days=window_days)
    recent = [
        s for s in history
        if s.completed_at is not None
        and s.completed_at >= cutoff
        and not s.is_seeded
    ]
    if not recent:
        return 0

    # Group by session date
    sessions: dict = {}
    for s in recent:
        day = s.completed_at.date()
        sessions.setdefault(day, []).append(s)

    total_score = 0.0
    for day_sets in sessions.values():
        effort = sum(s.effort or 2 for s in day_sets) / len(day_sets)
        sets = len(day_sets)
        session_score = (effort / 4) * 50 + min(sets / 8, 1.0) * 50
        total_score += session_score

    num_sessions = len(sessions)
    return min(100, int(total_score / max(num_sessions, 8)))


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
    linear_increment: float = 5.0
    double_increment: float = 5.0
    double_success_threshold: int = 2

    # Percentage / 1RM defaults
    estimated_1rm: Optional[float] = None
    percentage_of_1rm: float = 0.8
    pct_increment_success: float = 2.5
    pct_decrement_fail: float = 5.0

    # Deload
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


def _round_weight(value: float) -> float:
    return float(max(5.0, round(value / 5.0) * 5.0))


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
    """Deload is now AI-driven only; forced deloads are manual overrides."""
    return rule.force_deload


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
    # top set = highest weight, then highest reps; prefer sets with effort logged
    with_effort = [s for s in latest_sets if s.effort is not None]
    candidates = with_effort if with_effort else latest_sets
    candidates.sort(key=lambda s: (s.actual_weight, s.actual_reps), reverse=True)
    return candidates[0]


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

def _format_history_line(weight, reps, effort, rir_val):
    effort_text = f"effort {effort}" if effort is not None else "effort ?"
    if rir_val is not None:
        return f"{weight} lbs x {reps} reps, {effort_text}, RIR {rir_val}"
    return f"{weight} lbs x {reps} reps, {effort_text}"


def _coaching_message_for_prescription(rule, weight, reps, effort, rir_val, next_weight, increment, status):
    effort_display = effort if effort is not None else "?"
    base = (
        f"Last session you did {weight} lbs x {reps} reps, effort {effort_display}. "
        f"In this session we'll start at {int(round(next_weight))} lbs and shoot for {int(rule.reps_target)} reps."
    )
    if status == WorkloadStatus.deload:
        return "Deload week selected. Reduced volume/intensity to recover."
    if status == WorkloadStatus.easy:
        return f"{base} That was easy, so add {increment} lbs next session."
    if status == WorkloadStatus.moderate:
        if effort is None:
            return f"{base} Keep this weight until it feels easy, then add {increment} lbs."
        return f"{base} Keep this weight until it feels easy, then add {increment} lbs."
    return f"{base} Keep this weight until you can hit the full rep target cleanly."


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
    effort = top_set.effort

    # True linear: weight goes up every session.
    # Reps target is for coaching message only, not a gate.
    next_weight = weight + increment
    next_reps = rule.reps_target
    if effort is None:
        status = WorkloadStatus.moderate
        msg = _coaching_message_for_prescription(rule, weight, reps, effort, None, next_weight, increment, status)
    elif effort <= 3:
        status = WorkloadStatus.easy
        msg = _coaching_message_for_prescription(rule, weight, reps, effort, None, next_weight, increment, status)
    else:
        status = WorkloadStatus.moderate
        msg = _coaching_message_for_prescription(rule, weight, reps, effort, None, next_weight, increment, status)

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
    effort = top_set.effort

    real = _recent_real_sets(rule.history, limit=rule.double_success_threshold * rule.sets_target)
    latest_success_count = 0
    if effort is not None and len(real) >= rule.double_success_threshold and reps >= rule.reps_target and effort <= rule.hard_effort_threshold:
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
        status = WorkloadStatus.easy if effort is not None and effort <= rule.easy_effort_threshold else WorkloadStatus.moderate
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
        msg = "Missing 1RM. Falling back to linear progression for this session."
        return _linear_rule(rule, top_set)

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
    effort = top_set.effort

    if effort is not None and reps >= rule.reps_target and effort <= rule.easy_effort_threshold:
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
    effort = top_set.effort
    rir = int(top_set.rir) if top_set.rir is not None else (rule.reps_target - last_reps)

    if effort is not None and effort <= 2 and rir >= 2:
        next_weight = last_weight + _effective_increment(rule.linear_increment, rule)
        msg = f"Easy set (effort {effort}, RIR ~{rir}). Bumping to {next_weight:.1f} lbs."
        status = WorkloadStatus.easy
    elif effort is not None and effort <= 3 and rir >= 1:
        next_weight = last_weight + _effective_increment(rule.linear_increment * 0.5, rule)
        msg = f"Moderate effort (effort {effort}, RIR ~{rir}). Micro-load to {next_weight:.1f} lbs."
        status = WorkloadStatus.moderate
    elif effort is not None and (effort >= rule.hard_effort_threshold or rir <= 0):
        next_weight = last_weight - _effective_increment(rule.linear_increment * 0.5, rule)
        msg = f"Tough set (effort {effort}, RIR ~{rir}). Dropping to {next_weight:.1f} lbs for recovery."
        status = WorkloadStatus.hard
    else:
        next_weight = last_weight
        if effort is None:
            msg = f"Matching last load (effort ?, RIR ~{rir})."
        else:
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
        weight = _round_weight(float(base_prescription.next_weight * rule.deload_intensity_factor))
        reps = max(1, int(base_prescription.next_reps * rule.deload_volume_factor))
        sets = max(1, int(base_prescription.next_sets * rule.deload_volume_factor))
        msg = "Deload selected. Reduced volume/intensity to recover."
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

    result = _next_prescription_by_type(rule, top_set)
    return Prescription(
        next_weight=_round_weight(result.next_weight),
        next_reps=result.next_reps,
        next_sets=result.next_sets,
        rest_seconds=result.rest_seconds,
        coaching_message=result.coaching_message,
        workload_status=result.workload_status,
        prescription_type=result.prescription_type,
        is_deload=result.is_deload,
    )


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


# ---------------------------------------------------------------------------
# Coach: deterministic block-level orchestration
# ---------------------------------------------------------------------------

COACH_PHASE_LABELS = {
    "linear": "Linear Progression",
    "double": "Double Progression",
    "percentage": "Percentage-based",
    "autoregulated": "Autoregulated / RPE",
    "deload": "Deload",
}

COACH_PHASE_DESCRIPTIONS = {
    "linear": (
        "We're adding a small amount of weight each successful session to build strength steadily. "
        "This works well when you're fresh and your technique is solid."
    ),
    "double": (
        "The goal here is volume first: we'll keep the weight until you hit your full rep target for multiple sets. "
        "Once that's consistent, we'll bump the weight. This is a great plateau buster."
    ),
    "percentage": (
        "We're training from an estimated 1RM. This gives your body a precise strength stimulus with clear targets. "
        "It's useful when you want to peak or test strength."
    ),
    "autoregulated": (
        "You'll report how hard each set felt. We use RPE and RIR to adjust load daily so you don't grind through fatigue. "
        "This teaches your body to self-regulate intensity and protects recovery."
    ),
    "deload": (
        "We're intentionally backing off—less weight, fewer sets, easier effort. This isn't 'slacking.' "
        "Recovery is when fitness actually improves. We'll resume normal loading next block."
    ),
}

COACH_TRANSITION_REASONS = {
    "to_deload": (
        "I'm scheduling a deload because you've accumulated several solid weeks. Recovery will make your next block stronger."
    ),
    "to_autoregulated": (
        "You've been grinding hard. Switching to autoregulation for a block lets us match load to your daily readiness "
        "while keeping frequency high."
    ),
    "from_deload": (
        "Deload is complete. We're returning to structured progression so you can build on the recovery."
    ),
    "best_fit": "Switching progression type because it matches your current progress pattern.",
}

DEFAULT_BLOCK_DURATIONS = {
    "linear": 4,
    "double": 4,
    "percentage": 4,
    "autoregulated": 3,
    "deload": 1,
}
DEFAULT_BLOCK_DURATIONS["deload"] = 1


@dataclass
class CoachState:
    phase: str
    progression_type: str
    is_deload: bool
    explanation: str = ""
    next_deload_date: Optional[str] = None
    load_pct: int = 0
    deload_mode: str = "ai_driven"


def _candidate_types(custom_phase_order: Optional[List[str]] = None) -> List[str]:
    return list(custom_phase_order or ["linear", "double", "percentage", "autoregulated"])


def _detect_stalls(history: List[SetRecord], hard_effort_threshold: int) -> bool:
    real = _recent_real_sets(history, limit=12)
    if not real:
        return False
    hard_sets = [s for s in real if (s.effort or 0) >= hard_effort_threshold and (s.rir is None or s.rir <= 0)]
    return len(hard_sets) >= 3


def _progression_from_history(history: List[SetRecord], default_type: str) -> str:
    real = _recent_real_sets(history, limit=20)
    if not real:
        return default_type or "linear"
    successes = [s for s in real if s.rir is not None and s.rir >= 1 and (s.effort is None or s.effort <= 3)]
    if len(successes) >= 5:
        return "double"
    grinds = [s for s in real if s.rir is not None and s.rir <= 0]
    if len(grinds) >= 3:
        return "autoregulated"
    return "linear"


def _build_explanation(state: CoachState, reason: str) -> str:
    phase_desc = COACH_PHASE_DESCRIPTIONS.get(state.progression_type, "")
    transition_reason = COACH_TRANSITION_REASONS.get(reason, "")
    parts = []
    if state.is_deload:
        parts.append("Deload week. Reduced load so you can recover without losing frequency.")
    else:
        parts.append(f"You're in {COACH_PHASE_LABELS.get(state.progression_type, state.progression_type)}.")
    if phase_desc:
        parts.append(phase_desc)
    if transition_reason:
        parts.append(transition_reason)
    return " ".join(parts)


def compute_coach_state(
    history: List[SetRecord],
    current_phase: Optional[str] = None,
    force_deload: bool = False,
    default_progression: str = "linear",
    custom_phase_order: Optional[List[str]] = None,
    previous_phase: Optional[str] = None,
    deload_mode: str = "ai_driven",
) -> CoachState:
    """Compute coach state from workout history. AI-driven deload only."""
    phase = current_phase or _progression_from_history(history, default_progression)

    load_pct = compute_load(history)

    # AI-driven deload: load >= 70% plus visible stall pattern
    deload_due = force_deload or (load_pct >= 70 and _detect_stalls(history, hard_effort_threshold=4))

    if deload_due and phase != "deload":
        new_phase = "deload"
        reason = "to_deload"
    elif phase == "deload":
        new_phase = "linear" if current_phase == "deload" else phase
        reason = "from_deload"
    else:
        rec = evaluate_phase_effectiveness(history, phase)
        if rec.should_switch:
            new_phase = rec.recommended_phase
            reason = "best_fit"
        else:
            new_phase = phase
            reason = "continue"

    # Reset load when transitioning out of deload
    if previous_phase == "deload" and new_phase != "deload":
        load_pct = 0

    state = CoachState(
        phase=new_phase,
        progression_type=new_phase,
        is_deload=new_phase == "deload",
        explanation=_build_explanation(
            CoachState(
                phase=new_phase,
                progression_type=new_phase,
                is_deload=new_phase == "deload",
                explanation="",
                load_pct=load_pct,
                deload_mode=deload_mode,
            ),
            reason,
        ),
        load_pct=load_pct,
        deload_mode=deload_mode,
    )
    return state
    return state


@dataclass
class PhaseRecommendation:
    current_phase: str
    recommended_phase: str
    reason: str
    confidence: str  # "high", "medium", "low"
    should_switch: bool


def evaluate_phase_effectiveness(history: List[SetRecord], current_phase: str) -> PhaseRecommendation:
    """Analyze recent set history and recommend whether to keep or change progression model."""
    real = _recent_real_sets(history, limit=20)
    if not real:
        return PhaseRecommendation(
            current_phase=current_phase,
            recommended_phase="linear",
            reason="No training history yet. Starting with linear progression.",
            confidence="low",
            should_switch=True,
        )

    # Beginner guard: with very limited history, default to linear regardless of
    # stored phase. Percentage and autoregulated need more data to be meaningful.
    if len(real) < 10 and current_phase not in ("linear", "deload"):
        return PhaseRecommendation(
            current_phase=current_phase,
            recommended_phase="linear",
            reason=f"Only {len(real)} sets logged so far. Linear progression is the best starting point until we have enough data for more advanced models.",
            confidence="low",
            should_switch=True,
        )

    # Count patterns
    hard_sets = [s for s in real if (s.effort or 0) >= 4 and (s.rir is None or s.rir <= 0)]
    grinds = [s for s in real if s.rir is not None and s.rir <= 0]
    successes = [s for s in real if s.rir is not None and s.rir >= 1 and (s.effort is None or s.effort <= 3)]
    missed_reps = [s for s in real if s.actual_reps is not None and s.rir is not None and s.rir <= 0 and (s.effort or 0) >= 4]

    # Phase-specific evaluation
    if current_phase == "linear":
        if len(hard_sets) >= 3 and len(missed_reps) >= 2:
            return PhaseRecommendation(
                current_phase="linear",
                recommended_phase="double",
                reason=f"You've had {len(hard_sets)} hard sets with missed reps. Double Progression keeps the weight but increases the rep target to push through plateaus without adding more stress.",
                confidence="high",
                should_switch=True,
            )
        if len(grinds) >= 4:
            if len(real) < 10:
                return PhaseRecommendation(
                    current_phase="linear",
                    recommended_phase="linear",
                    reason=f"You've been grinding on {len(grinds)} sets, but we don't have enough history yet to estimate your 1RM accurately. Stick with linear progression until we have at least 10 solid sets.",
                    confidence="medium",
                    should_switch=False,
                )
            return PhaseRecommendation(
                current_phase="linear",
                recommended_phase="percentage",
                reason=f"You've been grinding on {len(grinds)} sets. Percentage-based training adjusts load dynamically based on your 1RM, which can help break through stubborn plateaus.",
                confidence="high",
                should_switch=True,
            )
        if len(successes) >= 8:
            return PhaseRecommendation(
                current_phase="linear",
                recommended_phase="linear",
                reason="You're consistently hitting your targets with good form. Keep linear progression going.",
                confidence="high",
                should_switch=False,
            )
        return PhaseRecommendation(
            current_phase="linear",
            recommended_phase="linear",
            reason="Linear progression is still appropriate. Keep building volume and consistency.",
            confidence="medium",
            should_switch=False,
        )

    if current_phase == "double":
        if len(hard_sets) >= 3 and len(missed_reps) >= 2:
            if len(real) < 10:
                return PhaseRecommendation(
                    current_phase="double",
                    recommended_phase="linear",
                    reason=f"Double progression is still showing {len(hard_sets)} hard sets, but we don't have enough history yet for percentage-based training. Switch back to linear progression until we have at least 10 solid sets.",
                    confidence="medium",
                    should_switch=True,
                )
            return PhaseRecommendation(
                current_phase="double",
                recommended_phase="percentage",
                reason=f"Double progression is still showing {len(hard_sets)} hard sets. Percentage-based training will modulate intensity based on your current 1RM to reduce fatigue while maintaining volume.",
                confidence="high",
                should_switch=True,
            )
        if len(successes) >= 6:
            return PhaseRecommendation(
                current_phase="double",
                recommended_phase="linear",
                reason=f"You've broken through the plateau with {len(successes)} strong sets. You can return to linear progression with the new weight you've built.",
                confidence="medium",
                should_switch=True,
            )
        return PhaseRecommendation(
            current_phase="double",
            recommended_phase="double",
            reason="Double progression is working. Keep pushing the rep targets.",
            confidence="medium",
            should_switch=False,
        )

    if current_phase == "percentage":
        if len(successes) >= 6 and len(hard_sets) <= 1:
            return PhaseRecommendation(
                current_phase="percentage",
                recommended_phase="linear",
                reason=f"You're cruising with {len(successes)} strong sets. You can switch back to linear progression with your updated 1RM estimate.",
                confidence="medium",
                should_switch=True,
            )
        if len(grinds) >= 3:
            return PhaseRecommendation(
                current_phase="percentage",
                recommended_phase="autoregulated",
                reason=f"Percentage-based training is still grinding on {len(grinds)} sets. Autoregulated training will auto-adjust based on daily readiness and RPE.",
                confidence="high",
                should_switch=True,
            )
        return PhaseRecommendation(
            current_phase="percentage",
            recommended_phase="percentage",
            reason="Percentage-based training is appropriate. Continue with current percentages.",
            confidence="medium",
            should_switch=False,
        )

    if current_phase == "autoregulated":
        if len(successes) >= 6:
            return PhaseRecommendation(
                current_phase="autoregulated",
                recommended_phase="linear",
                reason=f"You're feeling strong with {len(successes)} great sets. Time to reset with a structured linear block.",
                confidence="medium",
                should_switch=True,
            )
        return PhaseRecommendation(
            current_phase="autoregulated",
            recommended_phase="autoregulated",
            reason="Autoregulated training is matching your current readiness. Stay flexible.",
            confidence="medium",
            should_switch=False,
        )

    # Deload or unknown
    return PhaseRecommendation(
        current_phase=current_phase,
        recommended_phase="linear",
        reason="After recovery, restart with linear progression.",
        confidence="medium",
        should_switch=False,
    )
