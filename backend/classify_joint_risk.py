#!/usr/bin/env python3
"""
Classify joint_stress_flags, risk_score, and impact_score for all exercises.

joint_stress_flags: 7-value taxonomy (comma-separated for multiple)
  - lumbar_spine: lower back (L1-L5)
  - cervical_spine: neck (C1-C7)
  - shoulder_glenohumeral: shoulder joint
  - knee_patellofemoral: knee joint
  - hip_gluteus: hip/glute loading
  - wrist_carpal: wrist strain
  - ankle_dorsiflexion: ankle joint

risk_score (1-5): likelihood of something going wrong
  - 1: Very low (bodyweight, cables, bands, machines with safe fails)
  - 2: Low (DB/KB exercises, simple machines)
  - 3: Moderate (DB compounds, some barbells with easy failure)
  - 4: High (barbell compounds, technical lifts, overhead with load)
  - 5: Very high (heavy barbell compounds, trapped under load)

impact_score (1-5): severity if injury occurs
  - 1: Very low (minor strain, no heavy load on body)
  - 2: Low (minor joint strain, light load)
  - 3: Moderate (joint stress with moderate load)
  - 4: High (heavy load on vulnerable joints)
  - 5: Very high (heavy load on spine/neck, trapped under load)
"""

import sqlite3
import json

DB_PATH = "/Users/phillipwalters/Projects/askeo/repo/backend/exercise_v2.db"


def classify_joint_stress(name, movement_pattern, muscle_group):
    """Classify joint stress flags based on movement pattern, muscle group, and name."""
    name_lower = name.lower().strip() if name else ""
    mg_lower = muscle_group.lower().strip() if muscle_group else ""
    
    flags = []
    
    # ===== LUMBAR SPINE =====
    # Deadlifts, good mornings, heavy hinges, core work, heavy squats
    if movement_pattern in ("hinge_compound", "hip_compound"):
        if "deadlift" in name_lower or "rdl" in name_lower or "good morning" in name_lower:
            flags.append("lumbar_spine")
        elif "hip thrust" in name_lower or "glute bridge" in name_lower:
            pass  # minimal lumbar under tension
        else:
            flags.append("lumbar_spine")
    elif movement_pattern in ("squat_compound", "squat_bodyweight"):
        if "leg press" in name_lower:
            pass  # supported back
        else:
            flags.append("lumbar_spine")  # all squats stress lumbar to some degree
    elif movement_pattern.startswith("core_"):
        if movement_pattern == "core_flexion":
            flags.append("lumbar_spine")
        elif movement_pattern == "core_anti_extension":
            pass  # anti-extension is protective
        elif movement_pattern == "core_anti_rotation":
            flags.append("lumbar_spine")
        elif movement_pattern == "core_circumduction":
            flags.append("lumbar_spine")
    elif "deadlift" in name_lower or "good morning" in name_lower:
        flags.append("lumbar_spine")
    
    # ===== CERVICAL SPINE =====
    # Overhead work with barbell, heavy shrugs, neck exercises
    if movement_pattern == "push_vertical_compound":
        if "behind neck" in name_lower or "behind the neck" in name_lower:
            flags.append("cervical_spine")
        elif "barbell" in name_lower and "press" in name_lower:
            flags.append("cervical_spine")  # barbell overhead = neck position
        elif "military" in name_lower:
            flags.append("cervical_spine")
    elif "shrug" in name_lower and ("barbell" in name_lower or "heavy" in name_lower):
        flags.append("cervical_spine")
    elif "neck" in name_lower or "harness" in name_lower:
        flags.append("cervical_spine")
    elif movement_pattern == "push_vertical_compound" and "overhead" in name_lower:
        if "barbell" in name_lower:
            flags.append("cervical_spine")
    
    # ===== SHOULDER GLENOHUMERAL =====
    # Any pushing, pulling, or shoulder-specific work
    if movement_pattern in ("push_flat_compound", "push_incline_compound", "push_decline_compound",
                           "push_vertical_compound", "push_up", "push_flat_isolation",
                           "push_vertical_isolation", "push_tricep_isolation", "push_tricep_compound",
                           "tricep_isolation"):
        flags.append("shoulder_glenohumeral")
    elif movement_pattern in ("pull_vertical_compound", "pull_horizontal_compound",
                             "pull_vertical_isolation", "pull_horizontal_isolation", "pull_bicep_isolation",
                             "pull_shrug", "reverse_curl"):
        flags.append("shoulder_glenohumeral")
    elif movement_pattern == "scapular_retraction":
        flags.append("shoulder_glenohumeral")
    elif movement_pattern == "shoulder_external_rotation":
        flags.append("shoulder_glenohumeral")
    elif movement_pattern == "mobility_shoulder":
        flags.append("shoulder_glenohumeral")
    elif "shoulder" in name_lower or "deltoid" in name_lower or "delt" in name_lower:
        flags.append("shoulder_glenohumeral")
    elif "fly" in name_lower or "crossover" in name_lower or "pullover" in name_lower:
        flags.append("shoulder_glenohumeral")
    elif "row" in name_lower or "pull" in name_lower or "chin" in name_lower or "up" in name_lower:
        if movement_pattern and not movement_pattern.startswith("squat") and not movement_pattern.startswith("hinge") and not movement_pattern.startswith("hip") and not movement_pattern.startswith("core") and not movement_pattern.startswith("mobility"):
            if "row" in name_lower or "pull" in name_lower:
                flags.append("shoulder_glenohumeral")
    
    # ===== KNEE PATELLOFEMORAL =====
    # Squats, lunges, leg exercises, jumping
    if movement_pattern in ("squat_compound", "squat_bodyweight", "squat_isolation"):
        flags.append("knee_patellofemoral")
    elif movement_pattern == "lunge_compound":
        flags.append("knee_patellofemoral")
    elif movement_pattern == "hip_compound":
        if "kick" in name_lower or "abduction" in name_lower or "adduction" in name_lower:
            pass  # minimal knee
        else:
            flags.append("knee_patellofemoral")
    elif movement_pattern in ("cardio_plio", "plyometric"):
        if "jump" in name_lower or "squat" in name_lower or "lunge" in name_lower:
            flags.append("knee_patellofemoral")
    elif "leg extension" in name_lower:
        flags.append("knee_patellofemoral")
    elif "leg curl" in name_lower:
        flags.append("knee_patellofemoral")
    elif "calf" in name_lower and "raise" in name_lower:
        flags.append("knee_patellofemoral")
    elif "squat" in name_lower or "lunge" in name_lower or "split squat" in name_lower:
        flags.append("knee_patellofemoral")
    elif movement_pattern == "squat_isolation":
        flags.append("knee_patellofemoral")
    elif "step" in name_lower and ("up" in name_lower or "down" in name_lower):
        flags.append("knee_patellofemoral")
    elif "deadlift" in name_lower or "rdl" in name_lower:
        flags.append("knee_patellofemoral")  # deadlifts stress knees too
    
    # ===== HIP GLUTEUS =====
    # Heavy hinge, hip thrusts, glute work
    if movement_pattern == "hinge_compound":
        if "deadlift" in name_lower or "rdl" in name_lower or "good morning" in name_lower:
            flags.append("hip_gluteus")
        elif "clean" in name_lower or "snatch" in name_lower or "jerk" in name_lower:
            flags.append("hip_gluteus")
    elif movement_pattern == "hip_compound":
        flags.append("hip_gluteus")
    elif "hip thrust" in name_lower or "glute bridge" in name_lower or "glute" in name_lower:
        flags.append("hip_gluteus")
    elif "kickback" in name_lower and "tricep" not in name_lower:
        flags.append("hip_gluteus")
    elif "clamshell" in name_lower or "fire hydrant" in name_lower:
        flags.append("hip_gluteus")
    elif movement_pattern == "hip_compound":
        flags.append("hip_gluteus")
    
    # ===== WRIST CARPAL =====
    # Barbell curls, overhead carries, behind-the-neck moves, heavy gripping
    if "wrist" in name_lower or "finger" in name_lower or "grip" in name_lower:
        flags.append("wrist_carpal")
    elif movement_pattern == "push_vertical_compound":
        if "barbell" in name_lower or "overhead" in name_lower:
            flags.append("wrist_carpal")
    elif movement_pattern == "push_tricep_compound":
        if "close-grip" in name_lower or "bench" in name_lower:
            flags.append("wrist_carpal")
    elif movement_pattern in ("push_flat_compound", "push_incline_compound", "push_decline_compound"):
        if "barbell" in name_lower and "bench" in name_lower:
            flags.append("wrist_carpal")
    elif "curl" in name_lower and ("barbell" in name_lower or "ez bar" in name_lower):
        flags.append("wrist_carpal")
    elif "front raise" in name_lower and "barbell" in name_lower:
        flags.append("wrist_carpal")
    elif "upright row" in name_lower:
        flags.append("wrist_carpal")
    elif "shad" in name_lower:  # shrugs
        if "barbell" in name_lower:
            flags.append("wrist_carpal")
    elif movement_pattern in ("push_tricep_isolation", "tricep_isolation"):
        if "pushdown" in name_lower:
            pass  # cable pushdowns are wrist-neutral
        elif "skull crusher" in name_lower or "french" in name_lower:
            flags.append("wrist_carpal")
        elif "overhead" in name_lower:
            flags.append("wrist_carpal")
    elif "handling" in name_lower or "farmer" in name_lower or "carry" in name_lower:
        flags.append("wrist_carpal")
    elif "deadlift" in name_lower and "barbell" in name_lower:
        flags.append("wrist_carpal")
    
    # ===== ANKLE DORSIFLEXION =====
    # Deep squat positions, calf raises, ankle-specific work
    if movement_pattern == "squat_compound":
        if "deep" in name_lower or "full" in name_lower or "ass" in name_lower:
            flags.append("ankle_dorsiflexion")
        elif "back squat" in name_lower or "barbell squat" in name_lower:
            flags.append("ankle_dorsiflexion")
        elif "front squat" in name_lower:
            flags.append("ankle_dorsiflexion")  # requires more ankle
        elif "goblet" in name_lower:
            flags.append("ankle_dorsiflexion")
    elif movement_pattern == "squat_bodyweight":
        flags.append("ankle_dorsiflexion")
    elif movement_pattern == "lunge_compound":
        flags.append("ankle_dorsiflexion")
    elif "calf" in name_lower and "raise" in name_lower:
        flags.append("ankle_dorsiflexion")
    elif "ankle" in name_lower:
        flags.append("ankle_dorsiflexion")
    elif "deep squat" in name_lower:
        flags.append("ankle_dorsiflexion")
    elif "asian" in name_lower and "squat" in name_lower:
        flags.append("ankle_dorsiflexion")
    
    return ",".join(flags) if flags else ""


def classify_risk(name, movement_pattern, primary_equipment, muscle_group):
    """Classify risk score (1-5) based on equipment safety and exercise type."""
    name_lower = name.lower().strip() if name else ""
    pe_lower = primary_equipment.lower().strip() if primary_equipment else ""
    
    # Base risk by equipment
    if pe_lower == "bodyweight":
        base = 1
    elif pe_lower == "cable":
        base = 1
    elif pe_lower == "resistance_band":
        base = 1
    elif pe_lower == "machine":
        base = 2
    elif pe_lower == "dumbbell":
        base = 2
    elif pe_lower == "kettlebell":
        base = 2
    elif pe_lower == "barbell":
        base = 4
    elif pe_lower == "other":
        base = 2
    else:
        base = 2
    
    # Adjust based on exercise type
    if movement_pattern in ("hinge_compound",):
        if "deadlift" in name_lower or "rdl" in name_lower:
            base = max(base, 3)  # technical, can't drop safely
        elif "clean" in name_lower or "snatch" in name_lower or "jerk" in name_lower:
            base = max(base, 4)  # highly technical
        elif "good morning" in name_lower:
            base = max(base, 3)
    elif movement_pattern == "push_vertical_compound":
        if "behind neck" in name_lower:
            base = max(base, 4)
        elif "barbell" in name_lower and "press" in name_lower:
            base = max(base, 3)  # bar across shoulders, can roll
    elif movement_pattern == "push_flat_compound":
        if "barbell" in name_lower and "bench" in name_lower:
            base = max(base, 3)  # need spotter for heavy
    elif movement_pattern == "squat_compound":
        if "barbell" in name_lower and ("back" in name_lower or "back squat" in name_lower):
            base = max(base, 4)  # trapped under bar
        elif "front squat" in name_lower:
            base = max(base, 3)
        elif "goblet" in name_lower:
            base = min(base, 2)  # can drop DBs
        elif "leg press" in name_lower:
            base = min(base, 2)  # machine, safe
    elif movement_pattern == "push_tricep_compound":
        if "dip" in name_lower:
            if "assisted" in name_lower:
                base = min(base, 2)
            elif "chest dip" in name_lower or "weighted" in name_lower:
                base = max(base, 3)
    elif movement_pattern == "pull_vertical_compound":
        if "pull-up" in name_lower or "chin-up" in name_lower:
            if "assisted" in name_lower:
                base = min(base, 1)
            elif "weighted" in name_lower:
                base = max(base, 3)
    elif movement_pattern == "pull_horizontal_compound":
        if "barbell" in name_lower and "row" in name_lower:
            base = max(base, 2)
    
    # Special cases
    if "assisted" in name_lower:
        base = min(base, 2)
    if "machine" in pe_lower or "machine" in name_lower:
        base = min(base, 2)
    if "bodyweight" in pe_lower or "calisthenics" in name_lower:
        base = min(base, 1)
    if "smith" in name_lower:  # Smith machine
        base = min(base, 2)
    # Barbell isolation exercises (curls, raises, extensions) - can drop weight
    if "barbell" in pe_lower and movement_pattern in ("pull_bicep_isolation", "push_vertical_isolation",
                                                      "push_flat_isolation", "push_tricep_isolation",
                                                      "tricep_isolation", "wrist_curl", "reverse_curl"):
        base = min(base, 2)
    
    # Clamp to 1-5
    return max(1, min(5, base))


def classify_impact(name, movement_pattern, primary_equipment, muscle_group, joint_stress):
    """Classify impact score (1-5) based on load magnitude and joint vulnerability."""
    name_lower = name.lower().strip() if name else ""
    pe_lower = primary_equipment.lower().strip() if primary_equipment else ""
    joints = set(joint_stress.split(",")) if joint_stress else set()
    
    # Base impact by movement pattern
    if movement_pattern in ("hinge_compound",):
        if "deadlift" in name_lower or "rdl" in name_lower:
            base = 4  # heavy load on spine
        elif "clean" in name_lower or "snatch" in name_lower:
            base = 5  # explosive, technical, heavy
        elif "good morning" in name_lower:
            base = 4
        elif "jerk" in name_lower:
            base = 4
        else:
            base = 3
    elif movement_pattern == "squat_compound":
        if "barbell" in name_lower and ("back" in name_lower or "back squat" in name_lower):
            base = 4  # heavy axial load
        elif "front squat" in name_lower:
            base = 3
        elif "goblet" in name_lower:
            base = 2  # lighter, self-spotting
        elif "leg press" in name_lower:
            base = 2  # machine, safe fails
        elif "belt squat" in name_lower:
            base = 2
        else:
            base = 3
    elif movement_pattern == "push_flat_compound":
        if "barbell" in name_lower and "bench" in name_lower:
            base = 3  # bar across chest, moderate load
        elif "incline" in name_lower:
            base = 3
        elif "dumbbell" in name_lower:
            base = 2  # can drop DBs
        elif "machine" in pe_lower or "machine" in name_lower:
            base = 2
        elif "smith" in name_lower:
            base = 2
        else:
            base = 3
    elif movement_pattern == "push_vertical_compound":
        if "barbell" in name_lower:
            base = 4  # heavy overhead, cervical + shoulder risk
        elif "dumbbell" in name_lower:
            base = 2  # can drop DBs
        elif "machine" in pe_lower or "machine" in name_lower:
            base = 2
        elif "push press" in name_lower or "jerk" in name_lower:
            base = 4
        else:
            base = 3
    elif movement_pattern == "pull_vertical_compound":
        if "barbell" in name_lower and ("pull-up" in name_lower or "chin-up" in name_lower):
            base = 3
        elif "lat pulldown" in name_lower or "pulldown" in name_lower:
            base = 2  # cable machine, safe
        elif "weighted" in name_lower:
            base = 3
        else:
            base = 2
    elif movement_pattern == "pull_horizontal_compound":
        if "barbell" in name_lower and "row" in name_lower:
            base = 2  # can drop bar
        elif "chest supported" in name_lower:
            base = 1  # supported
        elif "machine" in pe_lower:
            base = 1
        elif "cable" in pe_lower:
            base = 1
        elif "dumbbell" in name_lower:
            base = 2
        else:
            base = 2
    elif movement_pattern in ("push_tricep_compound", "push_tricep_isolation"):
        if "dip" in name_lower:
            base = 3
        elif "skull crusher" in name_lower or "french" in name_lower:
            base = 3
        elif "pushdown" in name_lower:
            base = 1  # cable
        elif "overhead" in name_lower:
            base = 2
        else:
            base = 2
    elif movement_pattern == "push_vertical_isolation":
        if "upright row" in name_lower:
            base = 2
        elif "lateral raise" in name_lower or "side raise" in name_lower:
            base = 1  # light weight
        elif "front raise" in name_lower:
            base = 1
        elif "face pull" in name_lower:
            base = 1
        else:
            base = 1
    elif movement_pattern == "push_flat_isolation":
        if "fly" in name_lower or "pullover" in name_lower or "crossover" in name_lower:
            base = 1  # light weight, stretch position
        elif "peck deck" in name_lower or "machine fly" in name_lower:
            base = 1
        else:
            base = 1
    elif movement_pattern == "pull_bicep_isolation":
        if "barbell" in name_lower or "ez bar" in name_lower:
            base = 2  # can drop bar
        elif "cable" in pe_lower:
            base = 1
        elif "machine" in pe_lower:
            base = 1
        elif "dumbbell" in name_lower:
            base = 1  # can drop DBs
        else:
            base = 1
    elif movement_pattern == "wrist_curl":
        base = 1  # very light weight
    elif movement_pattern == "reverse_curl":
        base = 1
    elif movement_pattern == "squat_isolation":
        if "leg extension" in name_lower:
            base = 2  # knee shear but machine
        else:
            base = 2
    elif movement_pattern == "hinge_isolation":
        if "leg curl" in name_lower:
            base = 2
        elif "hyperextension" in name_lower:
            base = 2
        else:
            base = 2
    elif movement_pattern == "hip_compound":
        if "hip thrust" in name_lower or "glute bridge" in name_lower:
            base = 2  # can drop, supported
        elif "kick" in name_lower or "abduction" in name_lower:
            base = 1
        elif "pull through" in name_lower:
            base = 2
        else:
            base = 2
    elif movement_pattern == "lunge_compound":
        base = 2  # can step back, moderate load
    elif movement_pattern == "calf_raise":
        base = 1  # light, isolated
    elif movement_pattern == "cardio_plio":
        if "jump" in name_lower:
            base = 2  # landing impact, but bodyweight
        elif "burpee" in name_lower:
            base = 2
        elif "box jump" in name_lower:
            base = 2  # landing on box
        else:
            base = 1
    elif movement_pattern == "plyometric":
        base = 2
    elif movement_pattern in ("core_anti_extension", "core_anti_rotation", "core_flexion", "core_circumduction"):
        if movement_pattern == "core_anti_extension" and ("plank" in name_lower or "dead bug" in name_lower or "hollow" in name_lower):
            base = 1
        elif "ab wheel" in name_lower or "roller" in name_lower:
            base = 2  # can fall forward
        elif "weighted" in name_lower:
            base = 2
        else:
            base = 1
    elif movement_pattern == "core_carries":
        if "farmer" in name_lower or "suitcase" in name_lower:
            base = 2  # heavy load, but can drop
        elif "overhead" in name_lower:
            base = 3  # overhead load
        else:
            base = 2
    elif movement_pattern.startswith("mobility"):
        base = 1
    elif movement_pattern == "scapular_retraction":
        base = 1
    elif movement_pattern == "shoulder_external_rotation":
        base = 1
    elif movement_pattern == "boxing":
        base = 1  # light, dynamic
    elif movement_pattern == "olympic_lifting":
        base = 4  # heavy, technical, explosive
    elif movement_pattern == "strongman":
        base = 4  # very heavy, rough
    elif movement_pattern == "push_up":
        base = 1  # bodyweight
    else:
        base = 2
    
    # Adjust for specific risks
    if "barbell" in name_lower and "behind neck" in name_lower:
        base = max(base, 4)
    if "barbell" in name_lower and "shrug" in name_lower:
        base = max(base, 2)
    if "weighted" in name_lower and ("pull-up" in name_lower or "dip" in name_lower or "chin-up" in name_lower):
        base = max(base, 3)
    if "machine" in pe_lower:
        base = min(base, 3)
    if "cable" in pe_lower:
        base = min(base, 2)
    if "bodyweight" in pe_lower:
        base = min(base, 1)
    if "band" in pe_lower or "resistance_band" in pe_lower:
        base = min(base, 1)
    
    # Severe joint involvement increases impact (but not for lighter variations)
    if "lumbar_spine" in joints:
        # Only bump for heavy compounds - lighter variations stay low
        if movement_pattern == "squat_compound" and "barbell" in pe_lower and "goblet" not in name_lower and "front" not in name_lower:
            base = max(base, 3)
        elif movement_pattern == "hinge_compound" and ("barbell" in pe_lower or "deadlift" in name_lower or "rdl" in name_lower):
            base = max(base, 3)
        elif movement_pattern == "push_vertical_compound" and "barbell" in pe_lower:
            base = max(base, 3)
    if "cervical_spine" in joints:
        base = max(base, 3)  # neck injury is serious
    
    # Clamp to 1-5
    return max(1, min(5, base))


# Main execution
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== Classifying joint_stress_flags, risk_score, impact_score ===")
print()

exercises = cur.execute(
    "SELECT id, name, movement_pattern, primary_equipment, muscle_group, joint_stress_flags FROM exercise_library ORDER BY id"
).fetchall()

total = len(exercises)
updated_js = 0
updated_risk = 0
updated_impact = 0

for ex in exercises:
    js = classify_joint_stress(ex["name"], ex["movement_pattern"], ex["muscle_group"])
    risk = classify_risk(ex["name"], ex["movement_pattern"], ex["primary_equipment"], ex["muscle_group"])
    impact = classify_impact(ex["name"], ex["movement_pattern"], ex["primary_equipment"], ex["muscle_group"], js)
    
    # Update if changed
    if js != ex["joint_stress_flags"]:
        cur.execute("UPDATE exercise_library SET joint_stress_flags = ? WHERE id = ?", (js, ex["id"]))
        updated_js += 1
    
    cur.execute("UPDATE exercise_library SET risk_score = ?, impact_score = ? WHERE id = ?", (risk, impact, ex["id"]))
    updated_risk += 1
    updated_impact += 1

conn.commit()

print(f"Total: {total}")
print(f"joint_stress_flags updated: {updated_js}")
print(f"risk_score set: {updated_risk}")
print(f"impact_score set: {updated_impact}")
print()

# Distribution summary
print("=== joint_stress_flags distribution ===")
cur.execute("SELECT joint_stress_flags, COUNT(*) FROM exercise_library GROUP BY joint_stress_flags ORDER BY COUNT(*) DESC")
for r in cur.fetchall():
    print(f"  '{r[0]}': {r[1]}")
print()

print("=== risk_score distribution ===")
cur.execute("SELECT risk_score, COUNT(*) FROM exercise_library GROUP BY risk_score ORDER BY risk_score")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")
print()

print("=== impact_score distribution ===")
cur.execute("SELECT impact_score, COUNT(*) FROM exercise_library GROUP BY impact_score ORDER BY impact_score")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

conn.close()
print()
print("Done!")
