# Workout Structure Specification
# Generated from progression.py templates + fitness domain knowledge
# Purpose: define every valid week structure so the questionnaire can be designed backwards from here.

# ============================================================
# DIMENSIONS (axes that define a workout week)
# ============================================================

# 1. SPLIT - how the week is divided into day types
# 2. MODALITY - what kind of training
# 3. DAYS - how many days per week (2-6)
# 4. PRIORITY - which muscle group gets first slot in alternating splits
# 5. EXPERIENCE - beginner/intermediate/advanced (affects volume, complexity)
# 6. GOAL - strength/hypertrophy/endurance/weight_loss/general_fitness
# 7. EQUIPMENT - bodyweight_only/dumbbells/barbell/full_gym/kettlebells
# 8. LIMITATIONS - injuries/mobility issues (filter exercises)
# 9. PROGRESSION - linear/double/percentage (how weight changes week to week)

# ============================================================
# SPLIT DEFINITIONS (focus field)
# ============================================================

SPLITS = {
    # --- Full Body: every day hits all major groups ---
    "full_body": {
        "label": "Full Body",
        "description": "Every session hits all major movement patterns",
        "valid_days": [2, 3, 4, 5, 6],
        "day_types": ["Full Body"],  # same template every day, different exercise selection via RNG
        "needs_priority": False,
        "notes": "No A/B suffix. Structure is constant. Only prescription/exercises change.",
    },

    # --- Upper/Lower: alternating upper and lower body ---
    "upper_lower_split": {
        "label": "Upper/Lower Split",
        "description": "Alternating upper and lower body days",
        "valid_days": [3, 4, 5, 6],
        "day_types": ["Upper", "Lower"],
        "needs_priority": True,  # Which group starts the week
        "priority_options": {
            "upper_first": "Upper A, Lower A, Upper B, Lower B...",
            "lower_first": "Lower A, Upper A, Lower B, Upper B...",
        },
        "notes": "A/B/C suffix tracks occurrences within the week. "
                 "Priority determines starting group for odd-day counts.",
    },

    # --- Push/Pull/Legs: three day types, rotate ---
    "push_pull_legs": {
        "label": "Push / Pull / Legs",
        "description": "Three day types: push (chest/triceps/shoulders), pull (back/biceps), legs",
        "valid_days": [3, 6],  # 3-day (PPL once) or 6-day (PPL twice)
        "day_types": ["Push", "Pull", "Legs"],
        "needs_priority": False,
        "notes": "6-day adds A/B suffix (Push A/B, Pull A/B, Legs A/B). "
                 "4-day and 5-day are awkward for PPL — should we allow or redirect?",
    },

    # --- Body Part Split: each day targets one or two muscle groups ---
    "body_part_split": {
        "label": "Body Part Split",
        "description": "Each day targets specific muscle groups (bro split style)",
        "valid_days": [5, 6],
        "day_types": ["Chest & Triceps", "Back & Biceps", "Legs & Core", "Shoulders", "Arms"],
        "needs_priority": False,
        "notes": "5-day: one day per group. 6-day: one group gets hit twice or Arms merges with another. "
                 "Currently no A/B suffix — 6-day logic needs definition.",
    },

    # --- Custom removed — every questionnaire path already generates a custom workout ---
}

# ============================================================
# MODALITY DEFINITIONS
# ============================================================

MODALITIES = {
    "traditional_weight_training": {
        "label": "Traditional Weight Training",
        "splits": ["full_body", "upper_lower_split", "push_pull_legs", "body_part_split"],
        "builder": "_build_weight_training_days",
        "description": "Standard gym-based weight training with compounds and accessories",
    },
    "powerlifting": {
        "label": "Powerlifting",
        "splits": ["upper_lower_split", "full_body"],
        "builder": "_build_weight_training_days",
        "description": "Focus on squat, bench, deadlift. Lower body prioritized in upper/lower.",
        "implicit_priority": "lower_first",
    },
    "bodybuilding": {
        "label": "Bodybuilding",
        "splits": ["body_part_split", "upper_lower_split", "push_pull_legs", "full_body"],
        "builder": "_build_weight_training_days",
        "description": "Hypertrophy-focused, higher volume, isolation work",
        "implicit_priority": "upper_first",
    },
    "strongman": {
        "label": "Strongman",
        "splits": ["upper_lower_split", "full_body"],
        "builder": "_build_weight_training_days",
        "description": "Heavy compounds, odd implements, lower body prioritized",
        "implicit_priority": "lower_first",
    },
    "hiit": {
        "label": "HIIT",
        "splits": ["full_body"],
        "builder": "_build_hiit",
        "description": "High-intensity intervals, plyometrics, timed work",
    },
    "cardio": {
        "label": "Cardio",
        "splits": ["full_body"],
        "builder": "_build_cardio",
        "description": "Zone-based, steady state or intervals",
    },
}

# ============================================================
# VALID SPLIT × MODALITY × DAYS COMBINATIONS
# ============================================================
# Only list combinations that produce sensible, complete weeks.

VALID_COMBINATIONS = [
    # Full Body — works with everything, 2-6 days
    ("full_body", "traditional_weight_training", 2),
    ("full_body", "traditional_weight_training", 3),
    ("full_body", "traditional_weight_training", 4),
    ("full_body", "traditional_weight_training", 5),
    ("full_body", "traditional_weight_training", 6),
    ("full_body", "powerlifting", 3),
    ("full_body", "bodybuilding", 3),
    ("full_body", "hiit", 3),
    ("full_body", "cardio", 3),

    # Upper/Lower — weight training only, 3-6 days
    ("upper_lower_split", "traditional_weight_training", 3),
    ("upper_lower_split", "traditional_weight_training", 4),
    ("upper_lower_split", "traditional_weight_training", 5),
    ("upper_lower_split", "traditional_weight_training", 6),
    ("upper_lower_split", "powerlifting", 3),
    ("upper_lower_split", "powerlifting", 4),
    ("upper_lower_split", "powerlifting", 5),
    ("upper_lower_split", "powerlifting", 6),
    ("upper_lower_split", "bodybuilding", 3),
    ("upper_lower_split", "bodybuilding", 4),
    ("upper_lower_split", "strongman", 3),
    ("upper_lower_split", "strongman", 4),

    # Push/Pull/Legs — 3 or 6 days only
    ("push_pull_legs", "traditional_weight_training", 3),
    ("push_pull_legs", "traditional_weight_training", 6),
    ("push_pull_legs", "bodybuilding", 3),
    ("push_pull_legs", "bodybuilding", 6),
    ("push_pull_legs", "powerlifting", 3),
    ("push_pull_legs", "powerlifting", 6),

    # Body Part Split — 5 or 6 days
    ("body_part_split", "traditional_weight_training", 5),
    ("body_part_split", "traditional_weight_training", 6),
    ("body_part_split", "bodybuilding", 5),
    ("body_part_split", "bodybuilding", 6),
]

# ============================================================
# WEEK STRUCTURE EXAMPLES
# ============================================================
# Shows exactly what each combination produces.

WEEK_STRUCTURES = {
    # --- FULL BODY ---
    ("full_body", "traditional_weight_training", 3): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Full Body", "Full Body", "Full Body"],
        "notes": "Same template each day, different exercise selection per day via seeded RNG",
    },
    ("full_body", "traditional_weight_training", 4): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Full Body", "Full Body", "Full Body", "Full Body"],
        "notes": "4 full body days — may be too much for beginners. Questionnaire should warn.",
    },

    # --- UPPER/LOWER ---
    ("upper_lower_split", "traditional_weight_training", 3): {
        "plan_name": "Traditional Weight Training Plan",
        "days_upper_first": ["Upper A", "Lower A", "Upper B"],
        "days_lower_first": ["Lower A", "Upper A", "Lower B"],
        "notes": "Odd day count leaves one group with one extra session. Priority determines which.",
    },
    ("upper_lower_split", "traditional_weight_training", 4): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Upper A", "Lower A", "Upper B", "Lower B"],
        "notes": "Balanced — same count for both groups regardless of priority.",
    },
    ("upper_lower_split", "traditional_weight_training", 5): {
        "plan_name": "Traditional Weight Training Plan",
        "days_upper_first": ["Upper A", "Lower A", "Upper B", "Lower B", "Upper C"],
        "days_lower_first": ["Lower A", "Upper A", "Lower B", "Upper B", "Lower C"],
        "notes": "5-day upper/lower — odd count, priority matters.",
    },
    ("upper_lower_split", "powerlifting", 3): {
        "plan_name": "Powerlifting Plan",
        "days": ["Lower A", "Upper A", "Lower B"],
        "notes": "Powerlifting defaults to lower_first. Lower body gets 2 sessions, upper gets 1.",
    },
    ("upper_lower_split", "powerlifting", 4): {
        "plan_name": "Powerlifting Plan",
        "days": ["Lower A", "Upper A", "Lower B", "Upper B"],
        "notes": "Powerlifting defaults to lower_first but 4-day is balanced.",
    },

    # --- PPL ---
    ("push_pull_legs", "traditional_weight_training", 3): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Push", "Pull", "Legs"],
        "notes": "Standard 3-day PPL. Each day type appears once.",
    },
    ("push_pull_legs", "traditional_weight_training", 6): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Push", "Pull", "Legs", "Push B", "Pull B", "Legs B"],
        "notes": "6-day PPL with A/B suffix on second occurrence. Same template each occurrence, different exercises.",
    },

    # --- BODY PART SPLIT ---
    ("body_part_split", "traditional_weight_training", 5): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Chest & Triceps", "Back & Biceps", "Legs & Core", "Shoulders", "Arms"],
        "notes": "5-day bro split. Each group gets its own day.",
    },
    ("body_part_split", "traditional_weight_training", 6): {
        "plan_name": "Traditional Weight Training Plan",
        "days": ["Chest & Triceps", "Back & Biceps", "Legs & Core", "Shoulders", "Arms", "Chest & Triceps B"],
        "notes": "6-day body part split — legs/Chest & Triceps repeat with B suffix. "
                 "Arms stays on its own day since it only appears once.",
        "open_question": False,
    },

}

# ============================================================
# QUESTIONNAIRE MAPPING
# ============================================================
# For each dimension, what question captures it, and what are the options?

QUESTIONNAIRE_DIMENSIONS = {
    "split": {
        "question": "How do you want to organize your training week?",
        "key": "focus",
        "options": [
            {"value": "full_body", "label": "Full Body — every session hits all groups"},
            {"value": "upper_lower_split", "label": "Upper / Lower — alternating days"},
            {"value": "push_pull_legs", "label": "Push / Pull / Legs — three day types"},
            {"value": "body_part_split", "label": "Body Part Split — chest/tris, back/bis, legs, etc."},
        ],
        "default": "full_body",
        "constraints": {
            "push_pull_legs": "Only 3 or 6 days allowed",
            "body_part_split": "5 or 6 days recommended",
            "upper_lower_split": "3-6 days allowed",
        }
    },

    "modality": {
        "question": "What type of training do you prefer?",
        "key": "workout_modality",
        "options": [
            {"value": "traditional_weight_training", "label": "Traditional Weight Training"},
            {"value": "powerlifting", "label": "Powerlifting (Squat/Bench/Deadlift focus)"},
            {"value": "bodybuilding", "label": "Bodybuilding (Hypertrophy focus)"},
            {"value": "strongman", "label": "Strongman"},
            {"value": "hiit", "label": "HIIT / Intervals"},
            {"value": "cardio", "label": "Cardio / Steady State"},
        ],
        "default": "traditional_weight_training",
        "constraints": {
            # Modality → allowed splits
            "hiit": ["full_body"],
            "cardio": ["full_body"],
            "powerlifting": ["upper_lower_split", "full_body"],
            "strongman": ["upper_lower_split", "full_body"],
            "bodybuilding": ["body_part_split", "upper_lower_split", "push_pull_legs", "full_body"],
        }
    },

    "days_per_week": {
        "question": "How many days per week can you train?",
        "key": "days_per_week",
        "type": "integer",
        "min": 2,
        "max": 6,
        "default": 3,
        "constraints": {
            # (split, modality) → valid day counts
            ("push_pull_legs", "*"): [3, 6],
            ("body_part_split", "*"): [5, 6],
            ("full_body", "hiit"): [3, 4, 5],
            ("upper_lower_split", "*"): [3, 4, 5, 6],
        }
    },

    "priority": {
        "question": "Which muscle group do you want to prioritize?",
        "key": "focus_priority",  # NEW field needed
        "type": "single",
        "when_asked": "Only when split='upper_lower_split' AND days is odd (3 or 5)",
        "options": [
            {"value": "upper", "label": "Upper body first (Upper A, Lower A, Upper B...)"},
            {"value": "lower", "label": "Lower body first (Lower A, Upper A, Lower B...)"},
        ],
        "default": "upper",
        "implicit_defaults": {
            "powerlifting": "lower",
            "strongman": "lower",
            "bodybuilding": "upper",
            "traditional_weight_training": "upper",
        },
        "notes": "For even day counts, priority doesn't affect balance — but we still record it for consistency.",
    },

    "experience": {
        "question": "How long have you been training consistently?",
        "key": "experience",
        "options": ["beginner", "intermediate", "advanced"],
        "default": "beginner",
        "notes": "Affects volume, exercise complexity, and default progression type.",
    },

    "goal": {
        "question": "What's your primary goal?",
        "key": "goal",
        "type": "multi",  # Can have multiple
        "options": [
            {"value": "strength", "label": "Build Strength"},
            {"value": "hypertrophy", "label": "Build Muscle / Size"},
            {"value": "endurance", "label": "Improve Endurance"},
            {"value": "weight_loss", "label": "Lose Weight"},
            {"value": "general_fitness", "label": "General Fitness / Stay Active"},
            {"value": "flexibility", "label": "Improve Flexibility / Mobility"},
        ],
        "default": ["general_fitness"],
        "notes": "Primary goal determines volume ranges (sets/reps/rest). "
                 "Flexibility as primary goal may push toward cardio or custom modality.",
    },

    "equipment": {
        "question": "What equipment do you have access to?",
        "key": "equipment",
        "options": [
            {"value": "bodyweight_only", "label": "Bodyweight only (no equipment)"},
            {"value": "dumbbells", "label": "Dumbbells"},
            {"value": "barbell", "label": "Barbell + plates"},
            {"value": "kettlebells", "label": "Kettlebells"},
            {"value": "full_gym", "label": "Full gym (cables, machines, racks, etc.)"},
            {"value": "resistance_bands", "label": "Resistance bands"},
        ],
        "default": "bodyweight_only",
        "notes": "Filters exercise whitelist. Combined with limitations to determine safe exercise pool.",
    },

    "limitations": {
        "question": "Do you have any injuries or limitations we should work around?",
        "key": "limitations",
        "type": "multi",
        "options": [
            {"value": "none", "label": "None"},
            {"value": "shoulder_issues", "label": "Shoulder issues (avoid overhead pressing)"},
            {"value": "knee_issues", "label": "Knee issues (avoid deep squats/lunges)"},
            {"value": "back_issues", "label": "Back issues (avoid heavy compounds)"},
            {"value": "wrist_issues", "label": "Wrist issues (avoid gripping)"},
            {"value": "limited_mobility", "label": "Limited mobility (reduce range of motion)"},
            {"value": "high_impact_aversion", "label": "Avoid high-impact movements"},
        ],
        "default": ["none"],
        "notes": "Filters exercises from whitelist. Can select multiple.",
    },

    "progression": {
        "question": "How should we adjust weights as you get stronger?",
        "key": "progression_type",
        "options": [
            {"value": "linear", "label": "Linear — add 2.5-5 lbs each week until I stall"},
            {"value": "double", "label": "Double progression — add reps, then weight (8→12, then +5 lbs)"},
            {"value": "percentage", "label": "Percentage-based — follow a prescribed % of 1RM"},
        ],
        "default": "linear",
        "notes": "Determines how the progression engine updates week-to-week prescriptions.",
    },
}

# ============================================================
# OPEN QUESTIONS / GAPS
# ============================================================

OPEN_QUESTIONS = """
1. BODY_PART_SPLIT 6-DAY: Solved — wraps around with B suffix (Chest & Triceps B).
   → Implicit: first group to repeat is Chest & Triceps. Should we let user choose?

2. PPL 4-DAY AND 5-DAY: Currently not in VALID_COMBINATIONS. Should we:
   a) Only allow 3 or 6 days for PPL (redirect user if they pick 4/5)
   b) Allow 4-day as Push/Pull + Legs + Push or Pull
   c) Allow 5-day as Push/Pull/Legs + Push + Pull
   → Recommendation: only allow 3 and 6 for PPL. Keep it clean.

3. FULL_BODY 2-DAY: Should we allow 2-day full body? Most programs are 3+. 
   → Current VALID_COMBINATIONS starts at 2 for full_body. Consider raising to 3.

4. FULL_BODY 5-6 DAY: Is full body 5+ days sensible? Probably not for most people.
   → Consider warning or restricting to 3-4 for full_body.

5. MODALITY MIXING: The system supports modality_secondary and modality_mix fields,
   but the builder only routes to ONE modality per plan. Future AI layer may handle mixing.

7. FOCUS_PRIORITY FIELD: Logic implemented (powerlifting/strongman → lower_first) but
   not exposed in questionnaire. Need to decide: implicit from modality, or explicit question?

8. NAMING: Yoga/Calisthenics removed. CrossFit now uses WOD names + format (Fran — AMRAP 12 min).
   HIIT/Cardio still use "Day N" numbering — acceptable as category labels, but could be cleaner.
"""