/**
 * Frontend port of backend canonical rule module.
 *
 * This file is intentionally a direct port of `backend/rules.py`.
 * It must stay behavior-identical to the Python module so that
 * on-device autoregulation and backend prescriptions match.
 */

export type ProgressionType = "linear" | "double" | "percentage" | "autoregulated" | "deload";

export type WorkloadStatus = "easy" | "moderate" | "hard" | "deload";

// ---------------------------------------------------------------------------
// Progression contract (new — Phase 2)
// ---------------------------------------------------------------------------

export type ProgressionModel = "linear";

export interface ProgressionSettings {
  increment: number;
  effort_hold_threshold: number;   // 9-10 = hold, 1-8 = can increase
  rep_floor_compound: number;
  rep_floor_isolation: number;
  form_clean: number;
  form_struggled: number;
  form_broke: number;
}

export interface ExerciseMeta {
  name: string;
  is_compound: boolean;
}

export interface ProgressionInput {
  previous_set?: SetRecord;
  exercise: ExerciseMeta;
  settings: ProgressionSettings;
  model: ProgressionModel;
  history?: SetRecord[];
  estimated_1rm?: number;
  ai_calibrated_1rm?: number;
  rir?: number;
}

export type ProgressionDecision = "increase" | "hold" | "drop_suggested" | "start";

export interface ProgressionResult {
  next_weight: number;
  next_reps: number;
  decision: ProgressionDecision;
  coaching_message: string;
  reason: string;
}

function roundWeight(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function linearProgression(input: ProgressionInput): ProgressionResult {
  if (!input.previous_set) {
    const repFloor = input.exercise.is_compound
      ? input.settings.rep_floor_compound
      : input.settings.rep_floor_isolation;
    return {
      next_weight: 0,
      next_reps: repFloor,
      decision: "start",
      coaching_message: "First set — enter your weight.",
      reason: "no_history",
    };
  }

  const prev = input.previous_set;
  const repFloor = input.exercise.is_compound
    ? input.settings.rep_floor_compound
    : input.settings.rep_floor_isolation;

  const w = Math.round(prev.actual_weight);
  const r = prev.actual_reps;
  const e = prev.effort;
  const eDisplay = e != null ? e : "?";

  // Gate 1: rep floor not hit
  if (prev.actual_reps < repFloor) {
    return {
      next_weight: prev.actual_weight,
      next_reps: repFloor,
      decision: "hold",
      coaching_message: `Last set: ${w} lbs × ${r} reps — didn't hit target reps. Holding weight.`,
      reason: `reps_below_floor (${prev.actual_reps} < ${repFloor})`,
    };
  }

  // Gate 2: form broke
  if (prev.form_quality === input.settings.form_broke) {
    return {
      next_weight: prev.actual_weight,
      next_reps: repFloor,
      decision: "drop_suggested",
      coaching_message: `Form broke on last set (${w} lbs × ${r} reps, effort ${eDisplay}). Holding weight. Form first — even if it means fewer reps or dropping. Drop 5 lbs next set?`,
      reason: "form_broke",
    };
  }

  // Gate 3: form struggled
  if (prev.form_quality === input.settings.form_struggled) {
    return {
      next_weight: prev.actual_weight,
      next_reps: repFloor,
      decision: "hold",
      coaching_message: `Form struggled on last set (${w} lbs × ${r} reps, effort ${eDisplay}). Holding weight. Keep it clean next set, even if reps drop.`,
      reason: "form_struggled",
    };
  }

  // Gate 4: reps hit, form clean — check effort
  if (prev.effort != null && prev.effort >= input.settings.effort_hold_threshold) {
    return {
      next_weight: prev.actual_weight,
      next_reps: repFloor,
      decision: "hold",
      coaching_message: `Max effort last set (${w} lbs × ${r} reps, effort ${eDisplay}). Holding weight.`,
      reason: `effort_at_threshold (${prev.effort})`,
    };
  }

  // Increase
  const nextWeight = roundWeight(prev.actual_weight + input.settings.increment);
  return {
    next_weight: nextWeight,
    next_reps: repFloor,
    decision: "increase",
    coaching_message: linearMessage(prev, nextWeight),
    reason: "increase",
  };
}

function linearMessage(prev: SetRecord, nextWeight: number): string {
  const w = Math.round(prev.actual_weight);
  const r = prev.actual_reps;
  const e = prev.effort;
  const eDisplay = e != null ? e : "?";

  if (e === 9) {
    return `Last set: ${w} lbs × ${r} reps, effort 9, clean. Pushing to ${Math.round(nextWeight)} lbs.`;
  }
  if (e != null && 7 <= e && e <= 8) {
    return `Last set: ${w} lbs × ${r} reps, effort ${e}, clean. Going up to ${Math.round(nextWeight)} lbs.`;
  }
  return `Last set: ${w} lbs × ${r} reps, effort ${eDisplay}, clean. Going up to ${Math.round(nextWeight)} lbs.`;
}

export function computeProgression(input: ProgressionInput): ProgressionResult {
  if (input.model === "linear") {
    return linearProgression(input);
  }
  return linearProgression(input);
}

export interface SetRecord {
  set_index?: number;
  actual_weight: number;
  actual_reps: number;
  effort?: number;
  rir?: number;
  is_seeded?: boolean;
  completed_at?: string;
  form_quality?: number;  // 0=clean, 1=struggled, 2=broke
}

export function inferRepsTarget(isCompound: boolean): number {
  return isCompound ? 6 : 8;
}

export function computeLoad(history: SetRecord[], windowDays: number = 21): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowDays * 86400000);
  const recent = history.filter(
    (s) => s.completed_at && new Date(s.completed_at) >= cutoff && !s.is_seeded
  );
  if (!recent.length) return 0;

  // Group by session date
  const sessions: Record<string, SetRecord[]> = {};
  for (const s of recent) {
    const day = new Date(s.completed_at!).toISOString().split("T")[0];
    if (!sessions[day]) sessions[day] = [];
    sessions[day].push(s);
  }

  let totalScore = 0;
  for (const daySets of Object.values(sessions)) {
    const effort = daySets.reduce((a, s) => a + (s.effort || 2), 0) / daySets.length;
    const sets = daySets.length;
    const sessionScore = (effort / 4) * 50 + Math.min(sets / 8, 1) * 50;
    totalScore += sessionScore;
  }

  const numSessions = Object.keys(sessions).length;
  return Math.min(100, Math.floor(totalScore / Math.max(numSessions, 8)));
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
  exerciseName?: string;
  is_compound?: boolean;
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

function isDeloadWeek(rule: RuleInput, week?: number): boolean {
  if (rule.force_deload) return true;
  const cycle = Number(rule.periodization_cycle_weeks) || 0;
  if (cycle > 0) {
    const w = week ?? (Number(rule.week) || 1);
    return w % cycle === 0;
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
  // progression seed = first set of the last session, so we start from
  // where the user actually began, not where they finished.
  daySets.sort((a, b) => (a.set_index || 0) - (b.set_index || 0));
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
  const MIN_WEIGHT = 5; // 5 lb floor — round-to-5 can otherwise collapse to 0
  const rounded = Math.round(opts.next_weight / 5) * 5;
  return {
    next_weight: Math.max(MIN_WEIGHT, rounded),
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
  const inc = effectiveIncrement(Number(rule.linear_increment) || 5, rule);
  let rest = rule.rest_seconds;
  if (rule.ai_recovery_multiplier != null) rest = Math.round(rest * Number(rule.ai_recovery_multiplier));

  const exerciseMeta: ExerciseMeta = {
    name: rule.exerciseName || "",
    is_compound: rule.is_compound != null ? rule.is_compound : true,
  };
  const settings: ProgressionSettings = {
    increment: inc,
    effort_hold_threshold: 9,
    rep_floor_compound: 6,
    rep_floor_isolation: 8,
    form_clean: 0,
    form_struggled: 1,
    form_broke: 2,
  };

  const result = computeProgression({
    previous_set: topSet ?? undefined,
    exercise: exerciseMeta,
    settings,
    model: "linear",
  });

  const statusMap: Record<string, WorkloadStatus> = {
    start: "moderate",
    increase: "moderate",
    hold: "moderate",
    drop_suggested: "hard",
  };

  return buildPrescription({
    next_weight: result.next_weight,
    next_reps: result.next_reps,
    next_sets: Number(rule.sets_target) || 3,
    rest_seconds: rest,
    coaching_message: result.coaching_message,
    workload_status: statusMap[result.decision] || "moderate",
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
  const reps = topSet.actual_reps;
  const effort = topSet.effort;
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

  if (effort != null && consecutive >= threshold) {
    const nextWeight = weight + inc;
    const msg = `Last session you did ${Math.round(weight)} lbs x ${reps} reps, effort ${effort}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${rule.reps_target} reps. Double progression triggered after ${consecutive} strong sessions. Up ${inc} lbs next session.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: effort <= (rule.easy_effort_threshold ?? 2) ? "easy" : "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const msg = `Last session you did ${Math.round(weight)} lbs x ${reps} reps${effort != null ? `, effort ${effort}` : ", effort ?"}. Next workout we'll start at ${Math.round(weight)} lbs and shoot for ${rule.reps_target} reps. Build volume first (${consecutive}/${threshold} solid sessions). Keep weight until it feels easy.`;
  return buildPrescription({
    next_weight: weight,
    next_reps: rule.reps_target,
    next_sets: rule.sets_target,
    rest_seconds: rest,
    coaching_message: msg,
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
    return linearRule(rule, topSet);
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
  const effort = topSet.effort;
  const upInc = effectiveIncrement(Number(rule.pct_increment_success) || 2.5, rule);

  if (effort != null && reps >= rule.reps_target && effort <= (rule.easy_effort_threshold ?? 2)) {
    const nextWeight = weight + upInc;
    const msg = `Last session you did ${Math.round(weight)} lbs x ${reps} reps, effort ${effort}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${rule.reps_target} reps. Great session. Advanced load to ${Math.round(nextWeight)} lbs next session.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: "easy",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (reps >= rule.reps_target) {
    const nextWeight = weight + upInc * 0.5;
    const msg = `Last session you did ${Math.round(weight)} lbs x ${reps} reps${effort != null ? `, effort ${effort}` : ", effort ?"}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${rule.reps_target} reps. Solid session. Small bump next session.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: rule.reps_target,
      next_sets: rule.sets_target,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const nextWeight = Math.max(base, weight - (rule.pct_decrement_fail || 5));
  const msg = `Last session you did ${Math.round(weight)} lbs x ${reps} reps${effort != null ? `, effort ${effort}` : ", effort ?"}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${rule.reps_target} reps. Missed reps. Dropped to ${Math.round(nextWeight)} lbs to rebuild.`;
  return buildPrescription({
    next_weight: nextWeight,
    next_reps: rule.reps_target,
    next_sets: rule.sets_target,
    rest_seconds: rest,
    coaching_message: msg,
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
  const effort = topSet.effort;
  const rir = topSet.rir != null ? Number(topSet.rir) : reps - lastReps;
  const inc = effectiveIncrement((Number(rule.linear_increment) || 5) * 0.5, rule);

  if (effort != null && effort <= 2 && rir >= 2) {
    const nextWeight = lastWeight + (Number(rule.linear_increment) || 5);
    const msg = `Last session you did ${Math.round(lastWeight)} lbs x ${lastReps} reps, effort ${effort}, RIR ${rir}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${reps} reps. Easy set. Bumping to ${Math.round(nextWeight)} lbs next session.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: "easy",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (effort != null && effort <= 3 && rir >= 1) {
    const nextWeight = lastWeight + ((Number(rule.linear_increment) || 5) * 0.5);
    const msg = `Last session you did ${Math.round(lastWeight)} lbs x ${lastReps} reps, effort ${effort}, RIR ${rir}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${reps} reps. Moderate effort. Micro-load next session.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: "moderate",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }
  if (effort != null && (effort >= (rule.hard_effort_threshold ?? 4) || rir <= 0)) {
    const nextWeight = lastWeight - inc;
    const msg = `Last session you did ${Math.round(lastWeight)} lbs x ${lastReps} reps, effort ${effort}, RIR ${rir}. Next workout we'll start at ${Math.round(nextWeight)} lbs and shoot for ${reps} reps. Tough set. Dropping to ${Math.round(nextWeight)} lbs for recovery.`;
    return buildPrescription({
      next_weight: nextWeight,
      next_reps: reps,
      next_sets: sets,
      rest_seconds: rest,
      coaching_message: msg,
      workload_status: "hard",
      prescription_type: rule.progression_type,
      is_deload: false,
    });
  }

  const msg = `Last session you did ${Math.round(lastWeight)} lbs x ${lastReps} reps, effort ${effort ?? "?"}, RIR ${rir}. Next workout we'll start at ${Math.round(lastWeight)} lbs and shoot for ${reps} reps. Matching last load today.`;
  return buildPrescription({
    next_weight: lastWeight,
    next_reps: reps,
    next_sets: sets,
    rest_seconds: rest,
    coaching_message: msg,
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

export function computePrescription(rule: RuleInput, _exerciseName?: string): Prescription {
  const topSet = lastSessionTopSet(rule.history);

  // Derive actual elapsed weeks from real history dates, matching computeCoachState.
  const actualWeek = (() => {
    const real = rule.history.filter((s) => s.completed_at && !s.is_seeded);
    if (!real.length) return null;
    const oldest = new Date(real[0].completed_at!);
    for (let i = 1; i < real.length; i++) {
      const d = new Date(real[i].completed_at!);
      if (d < oldest) oldest.setTime(d.getTime());
    }
    const now = new Date();
    const elapsedDays = Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86400000));
    return Math.round(elapsedDays / 7) + 1;
  })();
  const week = actualWeek ?? (rule.week ?? 1);

  if (isDeloadWeek(rule, week)) {
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

  const base = nextPrescriptionByType(rule, topSet);
  return {
    next_weight: base.next_weight,
    next_reps: base.next_reps,
    next_sets: base.next_sets,
    rest_seconds: base.rest_seconds,
    coaching_message: base.coaching_message,
    workload_status: base.workload_status,
    prescription_type: base.prescription_type,
    is_deload: base.is_deload,
  };
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
  autoregulated: "Autoregulated / Effort",
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
    "You'll report how hard each set felt. We use effort to adjust load daily so you don't grind through fatigue. This teaches your body to self-regulate intensity and protects recovery.",
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
  load_pct: number;
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

function shouldForceDeload(history: SetRecord[], week: number, cycleWeeks: number, loadPct: number = 0, deloadMode: string = "ai_driven"): boolean {
  if (deloadMode === "calendar" && cycleWeeks > 0 && week > 0) {
    return week % cycleWeeks === 0;
  }
  // AI-driven: require both sustained load AND a visible plateau/stall pattern
  return loadPct >= 70 && detectStalls(history);
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

function weeksUntilNextDeload(_phase: CoachPhase, week: number, cycleWeeks: number): number {
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
  previous_phase?: CoachPhase;
  deload_mode?: string;
}): CoachState {
  const phase = input.current_phase ?? progressionFromHistory(input.history, input.default_progression ?? "linear");

  // Derive actual elapsed weeks from real history dates, not from a stored counter.
  const actualWeek = (() => {
    const real = input.history.filter((s) => s.completed_at && !s.is_seeded);
    if (!real.length) return null;
    const oldest = new Date(real[0].completed_at!);
    for (let i = 1; i < real.length; i++) {
      const d = new Date(real[i].completed_at!);
      if (d < oldest) oldest.setTime(d.getTime());
    }
    const now = new Date();
    const elapsedDays = Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86400000));
    return Math.round(elapsedDays / 7) + 1;
  })();

  const week = actualWeek ?? input.current_week_in_block ?? 1;
  const duration = blockDuration(phase);

  // Compute load from recent training stress
  const loadPct = computeLoad(input.history);

  const deloadDue = input.force_deload || shouldForceDeload(input.history, week, input.periodization_cycle_weeks ?? 4, loadPct, input.deload_mode);

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

  // Reset load when transitioning out of deload
  const finalLoad = input.previous_phase === "deload" && newPhase !== "deload" ? 0 : loadPct;

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
    load_pct: finalLoad,
  };
  return state;
}

