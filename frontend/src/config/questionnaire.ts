export type QuestionType = "single" | "multi" | "text";

export interface QuestionOption {
  value: string;
  label: string;
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
    id: "body_metrics",
    title: "Body Metrics",
    preface: "We use this to calculate your calorie and macro targets for meal plans.",
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
    id: "training_profile",
    title: "Training Profile",
    preface: "This shapes exercise selection, split structure, volume, and intensity.",
    questions: [
      {
        key: "goal",
        type: "multi",
        label: "Primary Goals",
        preface: "Pick all that apply.",
        options: [
          { value: "strength", label: "Strength" },
          { value: "hypertrophy", label: "Hypertrophy" },
          { value: "endurance", label: "Endurance" },
          { value: "weight_loss", label: "Weight Loss" },
          { value: "mobility", label: "Mobility" },
          { value: "general_fitness", label: "General Fitness" },
        ],
        default: ["general_fitness"],
      },
      {
        key: "equipment",
        type: "single",
        label: "Available Equipment",
        preface: "What do you have access to?",
        options: [
          { value: "bodyweight_only", label: "Bodyweight Only" },
          { value: "dumbbells", label: "Dumbbells" },
          { value: "barbell", label: "Barbell" },
          { value: "machines", label: "Machines / Cable" },
          { value: "resistance_bands", label: "Resistance Bands" },
          { value: "full_gym", label: "Full Gym" },
        ],
        default: "bodyweight_only",
      },
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
          { value: "calisthenics", label: "Calisthenics" },
          { value: "yoga", label: "Yoga / Mobility" },
          { value: "cardio", label: "Cardio" },
          { value: "crossfit", label: "CrossFit" },
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
          { value: "yoga", label: "Yoga / Mobility" },
          { value: "calisthenics", label: "Calisthenics" },
          { value: "none", label: "None — just my primary style" },
        ],
        default: ["none"],
      },
      {
        key: "modality_mix",
        type: "single",
        label: "How to Organize",
        preface: "How should we mix your primary style with additional activities?",
        options: [
          { value: "together", label: "Together in the same session" },
          { value: "separate_days", label: "On separate days" },
          { value: "mostly_primary", label: "Mostly primary, with occasional extras" },
          { value: "single", label: "Just my primary style — no extras" },
        ],
        default: "single",
      },
      {
        key: "workout_location",
        type: "text",
        label: "Workout Location",
        preface: "Where will you train? (e.g., YMCA Nashville, Home, Planet Fitness)",
        placeholder: "Gym or location name (optional)",
        options: [],
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
        key: "focus",
        type: "single",
        label: "Split Style",
        preface: "How do you want to organize your training week?",
        options: [
          { value: "full_body", label: "Full Body — every session hits all groups" },
          { value: "upper_lower_split", label: "Upper / Lower — alternating days" },
          { value: "push_pull_legs", label: "Push / Pull / Legs — three day types" },
          { value: "body_part_split", label: "Body Part Split — chest/tris, back/bis, legs, etc." },
          { value: "custom", label: "Custom — AI coach builds my schedule" },
        ],
        default: "full_body",
      },
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
