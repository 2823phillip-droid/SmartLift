/**
 * Smoke test for the frontend prescription message pipeline.
 * Mirrors backend/smoke_test_prescription.py — must produce identical messages.
 */
import {
  RuleInput,
  SetRecord,
  computePrescription,
} from "./src/rules";

const EX_NAME = "Bench Press";
const ROUTINE_NAME = "Upper Body A";
const LINEAR = "linear";
const MODERATE = "moderate";
const HARD = "hard";

function dt(iso: string): string {
  return iso;
}

function set1Seed(): SetRecord {
  return {
    actual_weight: 75.0,
    actual_reps: 8,
    effort: 8,
    form_quality: 0,
    completed_at: dt("2026-09-17T10:00:00+00:00"),
    set_index: 1,
  };
}

function set2Log(): SetRecord {
  return {
    actual_weight: 80.0,
    actual_reps: 6,
    effort: 8,
    form_quality: 0,
    completed_at: dt("2026-09-18T10:00:00+00:00"),
    set_index: 1,
  };
}

function loggedSet(weight: number, reps: number, effort: number | undefined, formQuality: number | undefined): SetRecord {
  return {
    actual_weight: weight,
    actual_reps: reps,
    effort,
    form_quality: formQuality,
    set_index: 2,
  };
}

function baseRule(seed?: SetRecord, history?: SetRecord[]): RuleInput {
  return {
    start_weight: 75.0,
    reps_target: 6,
    sets_target: 3,
    rest_seconds: 90,
    progression_type: LINEAR,
    history: history || [],
    linear_increment: 5.0,
    exerciseName: EX_NAME,
    routineName: ROUTINE_NAME,
    seedSet: seed,
  };
}

function run() {
  const fails: string[] = [];

  // --- SET 1: Session Target, new wording ---
  const r1 = baseRule(undefined, [set1Seed()]);
  const p1 = computePrescription(r1);
  const msg1 = p1.coaching_message;
  console.log(`[SET 1] coaching_message: ${msg1}`);
  const checks1: Array<[string, boolean]> = [
    ["mentions exercise name", msg1.includes(EX_NAME)],
    ["mentions routine name", msg1.includes(ROUTINE_NAME)],
    ["says 'In this session, you will start'", msg1.includes("In this session, you will start")],
    ["mentions +5 lbs", msg1.includes("5 lbs")],
    ["is NOT 'Last session you did'", !msg1.includes("Last session you did")],
    ["not set target label", !msg1.includes("On your last set")],
    ["workload moderate", p1.workload_status === MODERATE],
    ["next_weight 80", p1.next_weight === 80],
    ["next_reps 6", p1.next_reps === 6],
  ];
  for (const [desc, ok] of checks1) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET1: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  // --- SET 2+: increase path (clean set, reps hit) ---
  const r2 = baseRule(set2Log());
  const p2 = computePrescription(r2);
  const msg2 = p2.coaching_message;
  console.log(`[SET 2+] increase path: ${msg2}`);
  const checks2: Array<[string, boolean]> = [
    ["says 'On your last set'", msg2.includes("On your last set")],
    ["mentions exercise name", msg2.includes(EX_NAME)],
    ["says move up 5 lbs", msg2.includes("move up 5 lbs heavier")],
    ["next weight 85", p2.next_weight === 85],
    ["next reps 6 (target)", p2.next_reps === 6],
    ["workload moderate", p2.workload_status === MODERATE],
  ];
  for (const [desc, ok] of checks2) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET2_INC: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  // --- SET 2+: hold path — form broke ---
  const rb = baseRule(loggedSet(80, 6, 8, 2));
  const pb = computePrescription(rb);
  const msgb = pb.coaching_message;
  console.log(`[SET 2+] form broke hold: ${msgb}`);
  const checksB: Array<[string, boolean]> = [
    ["says 'On your last set'", msgb.includes("On your last set")],
    ["mentions form that broke", msgb.includes("form that broke")],
    ["says holding weight", msgb.includes("holding weight")],
    ["same weight 80", pb.next_weight === 80],
    ["same reps 6", pb.next_reps === 6],
    ["workload hard", pb.workload_status === HARD],
  ];
  for (const [desc, ok] of checksB) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET2_FORM_BROKE: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  // --- SET 2+: hold path — form struggled ---
  const rs = baseRule(loggedSet(80, 6, 8, 1));
  const ps = computePrescription(rs);
  const msgSS = ps.coaching_message;
  console.log(`[SET 2+] form struggled hold: ${msgSS}`);
  const checksS: Array<[string, boolean]> = [
    ["mentions form that struggled", msgSS.includes("form that struggled")],
    ["says holding weight", msgSS.includes("holding weight")],
    ["same weight 80", ps.next_weight === 80],
    ["same reps 6", ps.next_reps === 6],
    ["workload moderate", ps.workload_status === MODERATE],
  ];
  for (const [desc, ok] of checksS) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET2_FORM_STRUGGLED: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  // --- SET 2+: hold path — reps below floor (4 < 6) ---
  const rm = baseRule(loggedSet(80, 4, 8, 0));
  const pm = computePrescription(rm);
  const msgM = pm.coaching_message;
  console.log(`[SET 2+] reps below floor hold: ${msgM}`);
  const checksM: Array<[string, boolean]> = [
    ["says 'On your last set'", msgM.includes("On your last set")],
    ["says holding weight", msgM.includes("holding weight")],
    ["same weight 80", pm.next_weight === 80],
    ["same reps 4", pm.next_reps === 4],
    ["workload hard", pm.workload_status === HARD],
  ];
  for (const [desc, ok] of checksM) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET2_REPS_MISS: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  // --- SET 2+: increase with effort 9 above rep floor (8 reps > 6+1) ---
  const r9 = baseRule(loggedSet(80, 8, 9, 0));
  const p9 = computePrescription(r9);
  const msg9 = p9.coaching_message;
  console.log(`[SET 2+] effort 9 above floor increase: ${msg9}`);
  const checks9: Array<[string, boolean]> = [
    ["says 'On your last set'", msg9.includes("On your last set")],
    ["says move up", msg9.includes("move up 5 lbs")],
    ["next weight 85", p9.next_weight === 85],
    ["next reps 6", p9.next_reps === 6],
  ];
  for (const [desc, ok] of checks9) {
    const status = ok ? "OK" : "FAIL";
    if (!ok) fails.push(`SET2_EFFORT9_ABOVE: ${desc}`);
    console.log(`  [${status}] ${desc}`);
  }
  console.log();

  if (fails.length > 0) {
    console.log(`FAILED: ${fails.length} check(s)`);
    for (const f of fails) console.log(`  - ${f}`);
    return 1;
  } else {
    console.log("ALL CHECKS PASSED");
    return 0;
  }
}

const exitCode = run();
if (typeof process !== "undefined" && process.exit) {
  process.exit(exitCode);
}
