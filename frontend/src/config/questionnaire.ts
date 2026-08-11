export type QuestionType = "single" | "multi" | "text";

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface Question {
  key: string;
  type: QuestionType;
  label: string;
  preface?: string;
  options: QuestionOption[];
  default?: string | string[];
  preferNotToAnswer?: boolean;
  placeholder?: string;
  page?: number | string;
}

export interface Section {
  id: string;
  title: string;
  preface: string;
  questions: Question[];
}

export const questionnaireSections: Section[] = [
  {
    id: "about_you",
    title: "About You",
    preface: "Basics that help us tailor everything to your body.",
    questions: [
      {
        key: "units_preference",
        type: "single",
        label: "Select Measurement System",
        options: [
          { value: "imperial", label: "Imperial (lbs, ft, in)" },
          { value: "metric", label: "Metric (kg, cm)" },
        ],
        default: "imperial",
        page: "basics",
      },
      {
        key: "height_cm",
        type: "text",
        label: "Height",
        options: [],
        preferNotToAnswer: true,
        placeholder: "Enter height",
        page: "basics",
      },
      {
        key: "weight_kg",
        type: "text",
        label: "Weight",
        options: [],
        preferNotToAnswer: true,
        placeholder: "Enter weight",
        page: "basics",
      },
      {
        key: "sex",
        type: "single",
        label: "Sex",
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "other", label: "Other" },
        ],
        preferNotToAnswer: true,
        page: "basics",
      },
      {
        key: "current_training_status",
        type: "single",
        label: "Current Training Status",
        options: [
          { value: "not_training", label: "Not currently training / returning from a break" },
          { value: "inconsistent", label: "Training inconsistently" },
          { value: "1-2_days", label: "Training 1–2 days/week" },
          { value: "3-4_days", label: "Training 3–4 days/week" },
          { value: "5-6_days", label: "Training 5–6 days/week" },
        ],
        default: "not_training",
      },
      {
        key: "experience",
        type: "single",
        label: "Experience Level",
        options: [
          { value: "beginner", label: "Beginner — new to working out, unfamiliar with most movements" },
          { value: "intermediate", label: "Intermediate — familiar and comfortable with basic exercises" },
          { value: "advanced", label: "Advanced — very familiar with working out" },
        ],
        default: "beginner",
      },
      {
        key: "training_history",
        type: "single",
        label: "Training History",
        preface: "Helpful context for Intermediate and Advanced — Beginners can skip this.",
        options: [
          { value: "under_6_months", label: "Trained under 6 months total" },
          { value: "6_to_12_months", label: "Trained 6–12 months" },
          { value: "1_to_2_years", label: "Trained 1–2 years" },
          { value: "2_plus_years", label: "Trained 2+ years" },
          { value: "returning", label: "Returned after a break" },
          { value: "younger_athlete", label: "Trained as a younger athlete" },
        ],
        default: "under_6_months",
      },
    ],
  },
  {
    id: "your_goals",
    title: "Your Goals",
    preface: "What you want to get out of training shapes everything we build.",
    questions: [
      {
        key: "goal",
        type: "multi",
        label: "What are you working toward?",
        preface: "Pick all that apply. We’ll recommend Full Program and shape it around these choices.",
        options: [
          { value: "strength", label: "Strength — get stronger at lifting" },
          { value: "muscle", label: "Muscle — build size and definition" },
          { value: "endurance", label: "Endurance — last longer, recover faster" },
          { value: "weight_loss", label: "Weight Loss — burn fat, keep muscle" },
          { value: "mobility", label: "Mobility — move better, feel less stiff" },
          { value: "appearance", label: "Appearance — look better, feel more confident" },
          { value: "general_fitness", label: "General Fitness — balanced, all-around health" },
        ],
        default: ["general_fitness"],
      },
    ],
  },
  {
    id: "your_schedule",
    title: "Your Schedule",
    preface: "How much time you can spend shapes the plan we build.",
    questions: [
      {
        key: "days_per_week",
        type: "single",
        label: "Days Per Week",
        options: [
          { value: "2", label: "2 days" },
          { value: "3", label: "3 days" },
          { value: "4", label: "4 days" },
          { value: "5", label: "5 days" },
          { value: "6", label: "6 days" },
        ],
        default: "3",
      },
      {
        key: "minutes_per_session",
        type: "single",
        label: "Minutes Per Session",
        options: [
          { value: "20", label: "20 min" },
          { value: "30", label: "30 min" },
          { value: "45", label: "45 min" },
          { value: "60", label: "60 min" },
        ],
        default: "30",
      },
    ],
  },
  {
    id: "your_setup",
    title: "Your Setup",
    preface: "What equipment you have access to determines which exercises we can use.",
    questions: [
      {
        key: "equipment",
        type: "multi",
        label: "Available Equipment",
        preface: "Pick everything you have access to.",
        options: [
          { value: "barbell", label: "Barbell & Plates" },
          { value: "dumbbells", label: "Dumbbells" },
          { value: "cable", label: "Cable Machine" },
          { value: "machines", label: "Selectorized Machines" },
          { value: "resistance_bands", label: "Resistance Bands" },
          { value: "bodyweight", label: "Bodyweight Only" },
          { value: "kettlebells", label: "Kettlebells" },
        ],
        default: ["barbell", "dumbbells"],
      },
    ],
  },
  {
    id: "your_style",
    title: "Your Style",
    preface: "How you like to train — this shapes exercise selection and weekly structure.",
    questions: [
      {
        key: "workout_modality",
        type: "single",
        label: "Primary Training Style",
        options: [
          { value: "traditional_weight_training", label: "Traditional Weight Training", description: "Balanced mix of compounds and accessories, moderate reps. Good all-around choice." },
          { value: "powerlifting", label: "Powerlifting", description: "Focused on squat, bench, and deadlift. Low reps, heavy weight, minimal accessories. Best if your main goal is getting stronger on those lifts." },
          { value: "bodybuilding", label: "Bodybuilding", description: "Higher volume, more exercises, higher rep ranges. Focuses on muscle size and definition rather than just lifting heavy." },
          { value: "hiit", label: "HIIT", description: "Short bursts of high effort with rest intervals. Efficient for conditioning and fat loss." },
          { value: "cardio", label: "Cardio", description: "Running, cycling, elliptical, or steady-state work. If your main focus is endurance or calorie burn." },
        ],
        default: "traditional_weight_training",
      },
      {
        key: "modality_secondary",
        type: "multi",
        label: "Supplementary Activities",
        preface: "Anything else you do or want to include? Pick all that apply.",
        options: [
          { value: "cardio", label: "Cardio" },
          { value: "hiit", label: "HIIT" },
          { value: "none", label: "None — just my primary style" },
        ],
        default: ["none"],
      },
      {
        key: "modality_mix",
        type: "single",
        label: "How to Organize Cardio",
        preface: "How do you want to include cardio in your week?",
        options: [
          { value: "together", label: "As part of my lifting workouts — warmup or finisher" },
          { value: "separate", label: "Separate from my lifting workouts — dedicated cardio plan" },
        ],
        default: "together",
      },
      {
        key: "cardio_timing",
        type: "single",
        label: "Cardio Timing",
        preface: "When do you want to do cardio on lifting days?",
        options: [
          { value: "warmup_10", label: "Warmup — 10 min before lifting" },
          { value: "warmup_15", label: "Warmup — 15 min before lifting" },
          { value: "warmup_20", label: "Warmup — 20 min before lifting" },
          { value: "finisher_15", label: "Finisher — 15 min after lifting" },
          { value: "finisher_20", label: "Finisher — 20 min after lifting" },
        ],
        default: "warmup_10",
      },
      {
        key: "cardio_type",
        type: "multi",
        label: "What Kind of Cardio",
        preface: "Pick all that apply.",
        options: [
          { value: "hiit", label: "HIIT — intervals and bursts" },
          { value: "treadmill_run", label: "Treadmill — Run" },
          { value: "treadmill_walk", label: "Treadmill — Walk / Incline" },
          { value: "elliptical", label: "Elliptical" },
          { value: "stationary_bike", label: "Stationary Bike" },
          { value: "rowing", label: "Rowing" },
          { value: "stair_climber", label: "Stair Climber" },
          { value: "swimming", label: "Swimming" },
        ],
        default: ["hiit"],
      },
      {
        key: "cardio_days_per_week",
        type: "single",
        label: "How Many Cardio Days Per Week",
        options: [
          { value: "1", label: "1 day" },
          { value: "2", label: "2 days" },
          { value: "3", label: "3 days" },
          { value: "4", label: "4 days" },
          { value: "5", label: "5 days" },
          { value: "6", label: "6 days" },
          { value: "7", label: "7 days" },
        ],
        default: "2",
      },
      {
        key: "cardio_session_minutes",
        type: "single",
        label: "Cardio Session Length",
        options: [
          { value: "20", label: "20 min" },
          { value: "30", label: "30 min" },
          { value: "45", label: "45 min" },
          { value: "60", label: "60 min" },
        ],
        default: "30",
      },
      {
        key: "cardio_distance_goal",
        type: "single",
        label: "Distance Goal",
        preface: "Optional — only if you have a running or cycling goal.",
        options: [
          { value: "none", label: "None" },
          { value: "5k", label: "5k" },
          { value: "10k", label: "10k" },
          { value: "half_marathon", label: "Half Marathon" },
          { value: "marathon", label: "Marathon" },
          { value: "other", label: "Other distance" },
        ],
        default: "none",
      },
      {
        key: "focus",
        type: "single",
        label: "Split Style",
        preface: "How do you want to organize your training week?",
        options: [
          { value: "full_body", label: "Full Body — every session hits all groups" },
          { value: "upper_lower_split", label: "Upper / Lower — alternating days" },
          { value: "push_pull_legs", label: "Push / Pull / Legs — three day types" },
          { value: "body_part_split", label: "Body Part Split — chest/tris, back/bis, legs, etc." },
        ],
        default: "full_body",
      },
      {
        key: "build_mode",
        type: "single",
        label: "Build Mode",
        preface: "Do you want a pre-built template, or to build your own?",
        options: [
          { value: "template", label: "Pre-built Template — we structure the week for you" },
          { value: "custom", label: "Custom Builder — I choose the exercises" },
        ],
        default: "template",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    preface: "We'll avoid painful or risky movements.",
    questions: [
      {
        key: "limitations",
        type: "multi",
        label: "Limitations / Injuries",
        preface: "We'll avoid painful movements.",
        options: [
          { value: "none", label: "None" },
          { value: "shoulder_issues", label: "Shoulder Issues" },
          { value: "knee_issues", label: "Knee Issues" },
          { value: "back_issues", label: "Back Issues" },
          { value: "wrist_issues", label: "Wrist Issues" },
          { value: "limited_mobility", label: "Limited Mobility" },
          { value: "high_impact_aversion", label: "High-Impact Aversion" },
        ],
        default: ["none"],
      },
    ],
  },
];
