/**
 * Frontend port of backend canonical rule module.
 *
 * This file is intentionally a direct port of `backend/rules.py`.
 * It must stay behavior-identical to the Python module so that
 * on-device autoregulation and backend prescriptions match.
 */

export type ProgressionType = "linear" | "double" | "percentage" | "autoregulated";

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
