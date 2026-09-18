#!/usr/bin/env python3
"""Quick smoke test for the new prescription message pipeline.

Verifies:
- Set 1 (Session Target) uses new wording with exercise/routine name
- Set 2+ (Set Target) seeds from just-logged set
- Hold logic on form broke / form struggled / reps missed
- Increase path for set 2+ shows "move up 5 lbs"
"""
from __future__ import annotations

import sys, os
from datetime import datetime, timezone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from rules import (
    RuleInput,
    SetRecord,
    compute_prescription,
    WorkloadStatus,
    ProgressionType,
)

def _dt(iso: str) -> datetime:
    """Parse an ISO datetime string into a timezone-aware UTC datetime."""
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)

EX_NAME = "Bench Press"
ROUTINE_NAME = "Upper Body A"

def set1_seed():
    """Last session's set 1: 75 lbs x 8 reps, effort 8, clean form."""
    return SetRecord(
        actual_weight=75.0,
        actual_reps=8,
        effort=8,
        form_quality=0,
        completed_at=_dt("2026-09-17T10:00:00+00:00"),
        set_index=1,
    )

def set2_log():
    """Just-logged set 1 of current session: 80 lbs x 6 reps, effort 8, clean."""
    return SetRecord(
        actual_weight=80.0,
        actual_reps=6,
        effort=8,
        form_quality=0,
        completed_at=_dt("2026-09-18T10:00:00+00:00"),
        set_index=1,
    )

def logged_set(weight, reps, effort, form_quality):
    """A set the user just logged — seed for the next set's prescription."""
    return SetRecord(
        actual_weight=weight,
        actual_reps=reps,
        effort=effort,
        form_quality=form_quality,
        set_index=2,
    )

def base_rule(seed=None, history=None):
    return RuleInput(
        start_weight=75.0,
        reps_target=6,
        sets_target=3,
        rest_seconds=90,
        progression_type=ProgressionType.linear,
        history=history or [],
        linear_increment=5.0,
        exercise_name=EX_NAME,
        routine_name=ROUTINE_NAME,
        seed_set=seed,
    )

def run():
    fails = []

    # --- SET 1: Session Target, new wording ---
    # Set 1 uses history (last session's data), NOT seed_set.
    # _last_session_top_set pulls the first set from history by date.
    r = base_rule(seed=None, history=[set1_seed()])
    p = compute_prescription(r)
    msg = p.coaching_message
    print(f"[SET 1] coaching_message: {msg}")
    checks = [
        ("mentions exercise name", EX_NAME in msg),
        ("mentions routine name", ROUTINE_NAME in msg),
        ("says 'In this session, you will start'", "In this session, you will start" in msg),
        ("mentions +5 lbs", "5 lbs" in msg),
        ("is NOT 'Last session you did'", "Last session you did" not in msg),
        ("not set target label", "On your last set" not in msg),
        ("workload moderate", p.workload_status == WorkloadStatus.moderate),
        ("next_weight 80", p.next_weight == 80.0),
        ("next_reps 6", p.next_reps == 6),
    ]
    for desc, ok in checks:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET1: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- SET 2+: increase path (clean set, reps hit) ---
    r2 = base_rule(seed=set2_log())
    p2 = compute_prescription(r2)
    msg2 = p2.coaching_message
    print(f"[SET 2+] increase path: {msg2}")
    checks2 = [
        ("says 'On your last set'", "On your last set" in msg2),
        ("mentions exercise name", EX_NAME in msg2),
        ("says move up 5 lbs", "move up 5 lbs heavier" in msg2),
        ("next weight 85", p2.next_weight == 85.0),
        ("next reps 6 (target)", p2.next_reps == 6),
        ("workload moderate", p2.workload_status == WorkloadStatus.moderate),
    ]
    for desc, ok in checks2:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET2_INC: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- SET 2+: hold path — form broke ---
    rb = base_rule(seed=logged_set(80.0, 6, 8, form_quality=2))
    pb = compute_prescription(rb)
    msgb = pb.coaching_message
    print(f"[SET 2+] form broke hold: {msgb}")
    checks_b = [
        ("says 'On your last set'", "On your last set" in msgb),
        ("mentions form that broke", "form that broke" in msgb),
        ("says holding weight", "holding weight" in msgb),
        ("same weight 80", pb.next_weight == 80.0),
        ("same reps 6", pb.next_reps == 6),
        ("workload hard", pb.workload_status == WorkloadStatus.hard),
    ]
    for desc, ok in checks_b:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET2_FORM_BROKE: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- SET 2+: hold path — form struggled ---
    rs = base_rule(seed=logged_set(80.0, 6, 8, form_quality=1))
    ps = compute_prescription(rs)
    msgss = ps.coaching_message
    print(f"[SET 2+] form struggled hold: {msgss}")
    checks_s = [
        ("mentions form that struggled", "form that struggled" in msgss),
        ("says holding weight", "holding weight" in msgss),
        ("same weight 80", ps.next_weight == 80.0),
        ("same reps 6", ps.next_reps == 6),
        ("workload moderate", ps.workload_status == WorkloadStatus.moderate),
    ]
    for desc, ok in checks_s:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET2_FORM_STRUGGLED: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- SET 2+: hold path — reps below floor ---
    rm = base_rule(seed=logged_set(80.0, 4, 8, form_quality=0))
    pm = compute_prescription(rm)
    msgm = pm.coaching_message
    print(f"[SET 2+] reps below floor hold: {msgm}")
    checks_m = [
        ("says 'On your last set'", "On your last set" in msgm),
        ("says holding weight", "holding weight" in msgm),
        ("same weight 80", pm.next_weight == 80.0),
        ("same reps 4", pm.next_reps == 4),
        ("workload hard", pm.workload_status == WorkloadStatus.hard),
    ]
    for desc, ok in checks_m:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET2_REPS_MISS: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- SET 2+: increase with effort 9 above rep floor ---
    r9 = base_rule(seed=logged_set(80.0, 8, 9, form_quality=0))
    p9 = compute_prescription(r9)
    msg9 = p9.coaching_message
    print(f"[SET 2+] effort 9 above floor increase: {msg9}")
    checks_9 = [
        ("says 'On your last set'", "On your last set" in msg9),
        ("says move up", "move up 5 lbs" in msg9),
        ("next weight 85", p9.next_weight == 85.0),
        ("next reps 6", p9.next_reps == 6),
    ]
    for desc, ok in checks_9:
        status = "OK" if ok else "FAIL"
        if not ok:
            fails.append(f"SET2_EFFORT9_ABOVE: {desc}")
        print(f"  [{status}] {desc}")
    print()

    # --- Summary ---
    if fails:
        print(f"FAILED: {len(fails)} check(s)")
        for f in fails:
            print(f"  - {f}")
        return 1
    else:
        print("ALL CHECKS PASSED")
        return 0

if __name__ == "__main__":
    sys.exit(run())
