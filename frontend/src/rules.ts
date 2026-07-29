/**
 * Frontend port of backend canonical rule module.
 *
 * This file is intentionally a direct port of `backend/rules.py`.
 * It must stay behavior-identical to the Python module so that
 * on-device autoregulation and backend prescriptions match.
 */

export type ProgressionType = "linear" | "double" | "percentage" | "autoregulated" | "deload";

export type WorkloadStatus = "easy" | "moderate" | "hard" | "deload";

export interface SetRecord {
  actual_weight: number;
  actual_reps: number;
  effort?: number;
  rpe?: number;
  rir?: number;
  is_seeded?: boolean;
  completed_at?: string;
}

export interface RuleInput {
  start_weight: number;
  reps_target: number;
  sets_target: number;
  rest_seconds: number;
  progression_type: ProgressionType;
  history: SetRecord[];
  linear_increment?: number;
  double_increment?: number;
  double_success_threshold?: number;
  estimated_1rm?: number;
  percentage_of_1rm?: number;
  pct_increment_success?: number;
  pct_decrement_fail?: number;
  week?: number;
  periodization_cycle_weeks?: number;
  force_deload?: boolean;
  deload_volume_factor?: number;
  deload_intensity_factor?: number;
  hard_effort_threshold?: number;
  easy_effort_threshold?: number;
  ai_progression_sensitivity?: number;
  ai_volume_tolerance?: number;
  ai_recovery_multiplier?: number;
  ai_preferred_rir?: number;
  ai_stress_fatigue_adjustment?: number;
  ai_calibrated_1rm?: number;
}

export interface Prescription {
  next_weight: number;
  next_reps: number;
  next_sets: number;
  rest_seconds: number;
  coaching_message: string;
  workload_status: WorkloadStatus;
  prescription_type: string;
  is_deload: boolean;
}

function toDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isDeloadWeek(rule: RuleInput): boolean {
  if (rule.force_deload) return true;
  const cycle = Number(rule.periodization_cycle_weeks) || 0;
  if (cycle > 0) {
    const week = Number(rule.week) || 1;
    return week % cycle === 0;
  }
  return false;
}

function recentRealSets(history: SetRecord[]): SetRecord[] {
  return history.filter((s) => !s.is_seeded);
}

function lastSessionTopSet(history: SetRecord[]): SetRecord | null {
  const real = recentRealSets(history).filter((s) => toDate(s.completed_at));
  if (!real.length) return null;
  const byDate: Record<string, SetRecord[]> = {};
  for (const s of real) {
    const day = toDate(s.completed_at)!.toISOString().slice(0, 10);
    (byDate[day] ||= []).push(s);
  }
  const latestDay = Object.keys(byDate).sort().reverse()[0];
  const daySets = byDate[latestDay];
  daySets.sort((a, b) => (b.actual_weight || 0) - (a.actual_weight || 0) || (b.actual_reps || 0) - (a.actual_reps || 0));
  return daySets[0] ?? null;
}

function effectiveIncrement(base: number, rule: RuleInput): number {
  const sensitivity = rule.ai_progression_sensitivity;
  if (sensitivity == null) return base;
  return Math.max(0, base * Number(sensitivity));
}

function buildPrescription(opts: {
  next_weight: number;
  next_reps: number;
  next_sets: number;
  rest_seconds: number;
  coaching_message: string;
  workload_status: WorkloadStatus;
  prescription_type: string;
  is_deload: boolean;
}): Prescription {
  return {
    next_weight: opts.next_weight,
    next_reps: opts.next_reps,
    next_sets: opts.next_sets,
    rest_seconds: opts.rest_seconds,
    coaching_message: opts.coaching_message,
    workload_status: opts.workload_status,
    prescription_type: opts.prescription_type,
    is_deload: opts.is_deload,
  };
}

function linearRule(rule: RuleInput, topSet: SetRecord | null): Prescription {
  const inc = effectiveIncrement(Number(rule.linear_increment) || 2.5, rule);
  let rest = rule.rest_seconds;
  if (rule.ai_recovery_multiplier != null) rest = Math.round(rest * Number(rule.ai_recovery_multiplier));

  if (!topSet) {
    return buildPrescription({
      next_weight: rule.start_weight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: "No history yet. Starting at base weight.",
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const weight = topSet.actual_weight;
  const reps = topSet.actual_reps;
  const effort = topSet.effort ?? 3;

  if (reps >= rule.reps_target && effort <= (rule.easy_effort_threshold ?? 2)) {
    return buildPrescription({
      next_weight: weight + inc,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `Strong top set (${reps} reps, effort ${effort}). Adding ${inc} lbs next session.`,
      workload_status: "easy",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (reps >= rule.reps_target) {
    return buildPrescription({
      next_weight: weight + inc,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `Hit top reps with effort ${effort}. Small bump of ${inc} lbs.`,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  return buildPrescription({
    next_weight: weight,
    next_reps: rule.reps_target,
    next_sets: rule.sets_target,
    rest_seconds: rest,
    coaching_message: `Missed top reps (${reps} of ${rule.reps_target}). Keeping weight to build consistency.`,
    workload_status: "hard",
    prescription_type: rule.progression_type,
    is_deload: false,
  });
}

function doubleRule(rule: RuleInput, topSet: SetRecord | null): Prescription {
  const inc = effectiveIncrement(Number(rule.double_increment) || 5, rule);
  let rest = rule.rest_seconds;
  if (rule.ai_recovery_multiplier != null) rest = Math.round(rest * Number(rule.ai_recovery_multiplier));

  if (!topSet) {
    return buildPrescription({
      next_weight: rule.start_weight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: "No history yet. Starting at base weight.",
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const weight = topSet.actual_weight;
  const effort = topSet.effort ?? 3;
  const threshold = Number(rule.double_success_threshold) || 2;
  const real = recentRealSets(rule.history);
  const byDate: Record<string, SetRecord[]> = {};
  for (const s of real) {
    const day = toDate(s.completed_at)?.toISOString().slice(0, 10);
    if (!day) continue;
    (byDate[day] ||= []).push(s);
  }
  const days = Object.keys(byDate).sort().reverse();
  let consecutive = 0;
  for (const day of days) {
    const daySets = byDate[day];
    const bestRep = Math.max(...daySets.map((s) => s.actual_reps || 0));
    const bestEff = Math.min(...daySets.map((s) => Number(s.effort) || 99));
    if (bestRep >= rule.reps_target && bestEff <= (rule.hard_effort_threshold ?? 4)) {
      consecutive += 1;
    } else {
      break;
    }
  }

  if (consecutive >= threshold) {
    return buildPrescription({
      next_weight: weight + inc,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `Double progression triggered after ${consecutive} strong sessions. Up ${inc} lbs.`,
      workload_status: effort <= (rule.easy_effort_threshold ?? 2) ? "easy" : "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  return buildPrescription({
    next_weight: weight,
    next_reps: rule.reps_target,
    next_sets: rule.sets_target,
    rest_seconds: rest,
    coaching_message: `Build volume first (${consecutive}/${threshold} solid sessions). Keep weight.`,
    workload_status: "hard",
    prescription_type: rule.progression_type,
    is_deload: false,
  });
}

function percentageRule(rule: RuleInput, topSet: SetRecord | null): Prescription {
  let rest = rule.rest_seconds;
  if (rule.ai_recovery_multiplier != null) rest = Math.round(rest * Number(rule.ai_recovery_multiplier));

  const oneRm = rule.ai_calibrated_1rm ?? rule.estimated_1rm;
  if (!oneRm || oneRm <= 0) {
    return buildPrescription({
      next_weight: rule.start_weight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: "Missing 1RM. Falling back to base weight.",
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const base = Number(oneRm) * Number(rule.percentage_of_1rm || 0.8);

  if (!topSet) {
    return buildPrescription({
      next_weight: base,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `No history. Starting at ${(Number(rule.percentage_of_1rm) * 100).toFixed(0)}% of estimated 1RM (${base.toFixed(1)} lbs).`,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const weight = topSet.actual_weight;
  const reps = topSet.actual_reps;
  const effort = topSet.effort ?? 3;
  const upInc = effectiveIncrement(Number(rule.pct_increment_success) || 2.5, rule);

  if (reps >= rule.reps_target && effort <= (rule.easy_effort_threshold ?? 2)) {
    return buildPrescription({
      next_weight: weight + upInc,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `Great session. Advanced load to ${(weight + upInc).toFixed(1)} lbs.`,
      workload_status: "easy",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (reps >= rule.reps_target) {
    return buildPrescription({
      next_weight: weight + upInc * 0.5,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: `Solid session. Small bump to ${(weight + upInc * 0.5).toFixed(1)} lbs.`,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  return buildPrescription({
    next_weight: Math.max(base, weight - (rule.pct_decrement_fail || 5)),
    next_reps: rule.reps_target,
    next_sets: rule.sets_target,
    rest_seconds: rest,
    coaching_message: `Missed reps. Dropped to ${Math.max(base, weight - (rule.pct_decrement_fail || 5)).toFixed(1)} lbs to rebuild.`,
    workload_status: "hard",
    prescription_type: rule.progression_type,
    is_deload: false,
  });
}

function autoregulatedRule(rule: RuleInput, topSet: SetRecord | null): Prescription {
  let rest = rule.rest_seconds;
  if (rule.ai_recovery_multiplier != null) rest = Math.round(rest * Number(rule.ai_recovery_multiplier));

  const baseWeight = rule.start_weight;
  const reps = rule.reps_target;
  const sets = rule.sets_target;

  if (!topSet) {
    return buildPrescription({
      next_weight: baseWeight,
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: "No history yet. Starting conservatively.",
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const lastWeight = topSet.actual_weight;
  const lastReps = topSet.actual_reps;
  const effort = Number(topSet.effort) || 3;
  const rir = Number(topSet.rir) ?? reps - lastReps;
  const inc = effectiveIncrement((Number(rule.linear_increment) || 2.5) * 0.5, rule);

  if (effort <= 2 && rir >= 2) {
    return buildPrescription({
      next_weight: lastWeight + (Number(rule.linear_increment) || 2.5),
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: `Easy set (effort ${effort}, RIR ~${rir}). Bumping to ${(lastWeight + (Number(rule.linear_increment) || 2.5)).toFixed(1)} lbs.`,
      workload_status: "easy",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (effort <= 3 && rir >= 1) {
    return buildPrescription({
      next_weight: lastWeight + ((Number(rule.linear_increment) || 2.5) * 0.5),
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: `Moderate effort (effort ${effort}, RIR ~${rir}). Micro-load to ${(lastWeight + (Number(rule.linear_increment) || 2.5) * 0.5).toFixed(1)} lbs.`,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (effort >= (rule.hard_effort_threshold ?? 4) || rir <= 0) {
    return buildPrescription({
      next_weight: lastWeight - inc,
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: `Tough set (effort ${effort}, RIR ~${rir}). Dropping to ${(lastWeight - inc).toFixed(1)} lbs for recovery.`,
      workload_status: "hard",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  return buildPrescription({
    next_weight: lastWeight,
    next_reps: reps,
    next_sets: sets,
    rest_seconds: rest,
    coaching_message: `Matching last load (effort ${effort}, RIR ~${rir}).`,
    workload_status: "moderate",
    prescription_type: rule.progression_type,
    is_deload: false,
  });
}

function nextPrescriptionByType(rule: RuleInput, topSet: SetRecord | null): Prescription {
  switch (rule.progression_type) {
    case "linear":
      return linearRule(rule, topSet);
    case "double":
      return doubleRule(rule, topSet);
    case "percentage":
      return percentageRule(rule, topSet);
    case "autoregulated":
      return autoregulatedRule(rule, topSet);
    default:
      return linearRule(rule, topSet);
  }
}

export function computePrescription(rule: RuleInput): Prescription {
  const topSet = lastSessionTopSet(rule.history);
  if (isDeloadWeek(rule)) {
    const base = nextPrescriptionByType(rule, topSet);
    return buildPrescription({
      next_weight: base.next_weight * (rule.deload_intensity_factor ?? 0.7),
      next_reps: Math.max(1, Math.round(base.next_reps * (rule.deload_volume_factor ?? 0.6))),
      next_sets: Math.max(1, Math.round(base.next_sets * (rule.deload_volume_factor ?? 0.6))),
      rest_seconds: rule.rest_seconds,
      coaching_message: "Deload week selected. Reduced volume/intensity to recover.",
      workload_status: "deload",
      prescription_type: base.prescription_type,
      is_deload: true,
    });
  }

  return nextPrescriptionByType(rule, topSet);
}

export function applyAiProfile(rule: RuleInput): RuleInput {
  return {
    ...rule,
    estimated_1rm: rule.ai_calibrated_1rm ?? rule.estimated_1rm,
    ai_progression_sensitivity: rule.ai_progression_sensitivity ?? 1,
    ai_volume_tolerance: rule.ai_volume_tolerance ?? 1,
    ai_recovery_multiplier: rule.ai_recovery_multiplier ?? 1,
    ai_stress_fatigue_adjustment: rule.ai_stress_fatigue_adjustment ?? 0,
  };
}

/* ---------------------------------------------------------------------------
   Coach: deterministic block-level orchestration
   --------------------------------------------------------------------------- */

const COACH_PHASE_LABELS: Record<string, string> = {
  linear: "Linear Progression",
  double: "Double Progression",
  percentage: "Percentage-based",
  autoregulated: "Autoregulated / RPE",
  deload: "Deload",
};

const COACH_PHASE_DESCRIPTIONS: Record<string, string> = {
  linear:
    "We're adding a small amount of weight each successful session to build strength steadily. This works best when you're fresh and your technique is solid.",
  double:
    "The goal here is volume first: we'll keep the weight until you hit your full rep target for multiple sets. Once that's consistent, we'll bump the weight. This is a great plateau buster.",
  percentage:
    "We're training from an estimated 1RM. This gives your body a precise strength stimulus with clear targets. It's useful when you want to peak or test strength.",
  autoregulated:
    "You'll report how hard each set felt. We use RPE/RIR to adjust load daily so you don't grind through fatigue. This teaches your body to self-regulate intensity and protects recovery.",
  deload:
    "We're intentionally backing off—less weight, fewer sets, easier effort. This isn't 'slacking.' Recovery is when fitness actually improves. We'll resume normal loading next block.",
};

const COACH_TRANSITION_REASONS: Record<string, string> = {
  to_deload:
    "I'm scheduling a deload because you've accumulated several solid weeks. Recovery will make your next block stronger.",
  to_autoregulated:
    "You've been grinding hard. Switching to autoregulation for a block lets us match load to your daily readiness while keeping frequency high.",
  from_deload:
    "Deload is complete. We're returning to structured progression so you can build on the recovery.",
  best_fit: "Switching progression type because it matches your current progress pattern.",
};

const DEFAULT_BLOCK_DURATIONS: Record<string, number> = {
  linear: 4,
  double: 4,
  percentage: 4,
  autoregulated: 3,
  deload: 1,
};

export type CoachPhase = "linear" | "double" | "percentage" | "autoregulated" | "deload";

export interface CoachState {
  phase: CoachPhase;
  progression_type: CoachPhase;
  week_in_block: number;
  block_duration_weeks: number;
  transition_in_weeks: number;
  is_deload: boolean;
  explanation: string;
  next_deload_date?: string;
}

function candidateTypes(customPhaseOrder?: CoachPhase[]): CoachPhase[] {
  return customPhaseOrder ?? ["linear", "double", "percentage", "autoregulated"];
}

function detectStalls(history: SetRecord[]): boolean {
  const real = recentRealSets(history).slice(0, 12);
  if (!real.length) return false;
  const hardSets = real.filter((s) => (s.effort ?? 0) >= 4 && (s.rir ?? 1) <= 0);
  return hardSets.length >= 3;
}

function shouldForceDeload(history: SetRecord[], week: number, cycleWeeks: number): boolean {
  if (cycleWeeks > 0 && week > 0) {
    return week % cycleWeeks === 0;
  }
  return detectStalls(history);
}

function progressionFromHistory(history: SetRecord[], fallback: CoachPhase): CoachPhase {
  const real = recentRealSets(history).slice(0, 20);
  if (!real.length) return fallback;
  const successes = real.filter((s) => (s.rir ?? 0) >= 1 && (s.effort ?? 0) <= 3);
  if (successes.length >= 5) return "double";
  const grinds = real.filter((s) => (s.rir ?? 1) <= 0);
  if (grinds.length >= 3) return "autoregulated";
  return "linear";
}

function nextPhaseAfter(current: CoachPhase, deloadDue: boolean, customPhaseOrder?: CoachPhase[]): CoachPhase {
  if (current === "deload") return "linear";
  if (deloadDue) return "deload";
  const types = candidateTypes(customPhaseOrder);
  const idx = types.indexOf(current);
  if (idx < 0) return types[0];
  return types[(idx + 1) % types.length];
}

function blockDuration(phase: CoachPhase): number {
  return DEFAULT_BLOCK_DURATIONS[phase] ?? 4;
}

function buildExplanation(state: { is_deload: boolean; week_in_block: number; block_duration_weeks: number; progression_type: CoachPhase }, reason?: string): string {
  const phaseLabel = COACH_PHASE_LABELS[state.progression_type] ?? state.progression_type;
  const phaseDesc = COACH_PHASE_DESCRIPTIONS[state.progression_type] ?? "";
  const line = state.is_deload
    ? `This is week ${state.week_in_block} of deload. We'll reduce load so you can recover without losing frequency.`
    : `This week covers week ${state.week_in_block} of a ${state.block_duration_weeks}-week ${phaseLabel} block.`;
  const parts = [line, phaseDesc];
  if (reason) {
    const transitionReason = COACH_TRANSITION_REASONS[reason];
    if (transitionReason) parts.push(transitionReason);
  }
  return parts.filter(Boolean).join(" ");
}

function weeksUntilNextDeload(phase: CoachPhase, week: number, cycleWeeks: number): number {
  if (cycleWeeks <= 0) return 4;
  const remainder = week % cycleWeeks;
  if (remainder === 0) return 0;
  return cycleWeeks - remainder;
}

export function computeCoachState(input: {
  history: SetRecord[];
  current_phase?: CoachPhase;
  current_week_in_block?: number;
  force_deload?: boolean;
  periodization_cycle_weeks?: number;
  default_progression?: CoachPhase;
  custom_phase_order?: CoachPhase[];
}): CoachState {
  const phase = input.current_phase ?? progressionFromHistory(input.history, input.default_progression ?? "linear");
  const week = input.current_week_in_block ?? 1;
  const duration = blockDuration(phase);
  const deloadDue = input.force_deload || shouldForceDeload(input.history, week, input.periodization_cycle_weeks ?? 4);

  const nextDeloadDate = (() => {
    try {
      const weeksUntil = weeksUntilNextDeload(phase, week, input.periodization_cycle_weeks ?? 4);
      const today = new Date();
      today.setDate(today.getDate() + weeksUntil * 7);
      return today.toISOString().split("T")[0];
    } catch {
      return undefined;
    }
  })();

  let newPhase = phase;
  let reason = "continue";

  if (deloadDue && phase !== "deload") {
    newPhase = "deload";
    reason = "to_deload";
  } else if (phase === "deload") {
    newPhase = "linear";
    reason = "from_deload";
  } else if ((input.current_week_in_block ?? 0) >= duration && !input.force_deload) {
    newPhase = nextPhaseAfter(phase, deloadDue, input.custom_phase_order);
    reason = "best_fit";
  } else {
    newPhase = phase;
    reason = "continue";
  }

  const weekIndex = newPhase === phase && input.current_phase !== "deload" ? Math.min(week + 1, duration) : 1;
  const state: CoachState = {
    phase: newPhase,
    progression_type: newPhase,
    week_in_block: weekIndex,
    block_duration_weeks: blockDuration(newPhase),
    transition_in_weeks: Math.max(1, blockDuration(newPhase) - weekIndex),
    is_deload: newPhase === "deload",
    explanation: buildExplanation({
      is_deload: newPhase === "deload",
      week_in_block: weekIndex,
      block_duration_weeks: blockDuration(newPhase),
      progression_type: newPhase,
    }, reason),
    next_deload_date: nextDeloadDate,
  };
  return state;
}

