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
        label: "Units",
        preface: "Choose the units you prefer for weight and height.",
        options: [
          { value: "imperial", label: "Pounds & Inches" },
          { value: "metric", label: "Kg & Cm" },
        ],
        default: "imperial",
      },
      {
        key: "weight_kg",
        type: "single",
        label: "Weight",
        preface: "Enter your current weight.",
        options: [],
        preferNotToAnswer: true,
      },
      {
        key: "height_cm",
        type: "single",
        label: "Height",
        preface: "Enter your height.",
        options: [],
        preferNotToAnswer: true,
      },
      {
        key: "sex",
        type: "single",
        label: "Sex",
        preface: "Biological sex helps with calorie math.",
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "other", label: "Other" },
        ],
        preferNotToAnswer: true,
      },
      {
        key: "activity_level",
        type: "single",
        label: "Activity Level",
        preface: "How active are you outside of workouts?",
        options: [
          { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
          { value: "light", label: "Light (1-2 days/week)" },
          { value: "moderate", label: "Moderate (3-4 days/week)" },
          { value: "active", label: "Active (5-6 days/week)" },
          { value: "very_active", label: "Very Active (physical job + training)" },
        ],
        default: "moderate",
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
        type: "single",
        label: "How do you want to train?",
        preface: "Pick the approach that fits you best. You can always change later.",
        options: [
          { value: "full_program", label: "Full Program (Recommended)", description: "App rotates through phases automatically — strength, hypertrophy, deload — based on your progress. Best for most people." },
          { value: "strength", label: "Strength", description: "Heavier weights, fewer reps. Focus on compound lifts and progressive overload." },
          { value: "hypertrophy", label: "Hypertrophy", description: "Moderate weight, higher reps. Build muscle size and definition." },
          { value: "endurance", label: "Endurance", description: "Lighter weights, higher reps. Improve stamina and work capacity." },
          { value: "weight_loss", label: "Weight Loss", description: "Higher-rep circuits and shorter rest. Burn calories while preserving muscle." },
          { value: "mobility", label: "Mobility", description: "Dynamic warm-ups, controlled movements, and flexibility work." },
          { value: "general_fitness", label: "General Fitness", description: "Balanced mix of everything. Solid all-around health and performance." },
        ],
        default: "full_program",
      },
      {
        key: "experience",
        type: "single",
        label: "Experience Level",
        options: [
          { value: "beginner", label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced", label: "Advanced" },
        ],
        default: "beginner",
      },
      {
        key: "training_history",
        type: "single",
        label: "Training History",
        preface: "How long have you been training consistently? This helps us know when to switch things up.",
        options: [
          { value: "just_starting", label: "Just starting" },
          { value: "under_6_months", label: "Less than 6 months" },
          { value: "6_to_12_months", label: "6–12 months" },
          { value: "1_to_2_years", label: "1–2 years" },
          { value: "2_plus_years", label: "2+ years" },
          { value: "returning", label: "Returning after a break" },
        ],
        default: "just_starting",
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
      {
        key: "workout_location",
        type: "text",
        label: "Workout Location",
        preface: "Where will you train? (e.g., YMCA Nashville, Home, Planet Fitness)",
        placeholder: "Gym or location name (optional)",
        options: [],
      },
    ],
  },
  {
    id: "your_setup",
    title: "Your Setup",
    preface: "What equipment and gym type you have access to determines which exercises we can use.",
    questions: [
      {
        key: "gym_type",
        type: "single",
        label: "Gym Type",
        preface: "What kind of facility will you train at?",
        options: [
          { value: "full_gym", label: "Full Gym — barbells, dumbbells, machines, cables, rack" },
          { value: "planet_fitness", label: "Planet Fitness — smith machine, dumbbells, cables, machines" },
          { value: "home_gym_basic", label: "Home Gym — dumbbells, bands, maybe a bench" },
          { value: "bodyweight_only", label: "Bodyweight Only — no equipment at all" },
        ],
        default: "full_gym",
      },
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
        preface: "What's your main type of training?",
        options: [
          { value: "traditional_weight_training", label: "Traditional Weight Training" },
          { value: "powerlifting", label: "Powerlifting" },
          { value: "bodybuilding", label: "Bodybuilding" },
          { value: "hiit", label: "HIIT" },
          { value: "cardio", label: "Cardio" },
        ],
        default: "traditional_weight_training",
      },
      {
        key: "modality_secondary",
        type: "multi",
        label: "Additional Activities",
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
          { value: "together", label: "Together with lifting — warmup or finisher" },
          { value: "separate_days", label: "On separate days — its own training sessions" },
          { value: "mostly_primary", label: "Mostly lifting, with occasional cardio days" },
          { value: "both", label: "Both — warmup/finisher on lifting days AND separate cardio days" },
          { value: "single", label: "Just lifting — no cardio" },
        ],
        default: "single",
      },
      {
        key: "cardio_timing",
        type: "single",
        label: "Cardio Timing",
        preface: "When do you want to do cardio on lifting days?",
        options: [
          { value: "none", label: "No cardio on lifting days" },
          { value: "warmup_10", label: "Warmup — 10 min before lifting" },
          { value: "warmup_15", label: "Warmup — 15 min before lifting" },
          { value: "warmup_20", label: "Warmup — 20 min before lifting" },
          { value: "finisher_15", label: "Finisher — 15 min after lifting" },
          { value: "finisher_20", label: "Finisher — 20 min after lifting" },
          { value: "hiit_finisher", label: "HIIT Finisher — 15 min high intensity after lifting" },
          { value: "separate_day", label: "Separate Day — keep it on its own day" },
        ],
        default: "none",
      },
      {
        key: "incorporated_cardio_type",
        type: "single",
        label: "Lifting-Day Cardio Type",
        preface: "What kind of cardio do you want attached to your lifting days? (For 'together', 'mostly lifting', or 'both' schedules)",
        options: [
          { value: "none", label: "None — use my standalone cardio type" },
          { value: "hiit", label: "HIIT — intervals and bursts" },
          { value: "steady_state", label: "Steady State — run, bike, elliptical" },
          { value: "walking", label: "Walking — neighborhood walks, incline" },
          { value: "distance", label: "Distance Training — 5k / 10k goals" },
          { value: "mixed", label: "Mixed — I like variety" },
        ],
        default: "none",
      },
      {
        key: "cardio_type",
        type: "single",
        label: "Standalone Cardio Type",
        preface: "What kind of cardio do you want for dedicated cardio days?",
        options: [
          { value: "none", label: "None — no dedicated cardio days" },
          { value: "hiit", label: "HIIT — intervals and bursts" },
          { value: "steady_state", label: "Steady State — run, bike, elliptical" },
          { value: "walking", label: "Walking — neighborhood walks, incline" },
          { value: "distance", label: "Distance Training — 5k / 10k goals" },
          { value: "mixed", label: "Mixed — I like variety" },
        ],
        default: "none",
      },
      {
        key: "cardio_days_per_week",
        type: "single",
        label: "Cardio Days Per Week",
        preface: "How many dedicated cardio days per week? (For 'separate days', 'mostly lifting', or 'both' schedules)",
        options: [
          { value: "0", label: "0 — no dedicated cardio days" },
          { value: "1", label: "1 day" },
          { value: "2", label: "2 days" },
          { value: "3", label: "3 days" },
          { value: "4", label: "4 days" },
          { value: "5", label: "5 days" },
          { value: "6", label: "6 days" },
          { value: "7", label: "7 days — every day" },
        ],
        default: "0",
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
    id: "your_progress",
    title: "Your Progress",
    preface: "How you add weight over time keeps you improving safely.",
    questions: [
      {
        key: "progression_type",
        type: "single",
        label: "Starting Progression Method",
        preface: "How do you want to add weight?",
        options: [
          { value: "linear", label: "Linear — add weight every session" },
          { value: "double", label: "Double — add reps first, then weight" },
          { value: "percentage", label: "Percentage — based on a max lift" },
        ],
        default: "linear",
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
