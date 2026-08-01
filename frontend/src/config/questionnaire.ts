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
        label: "Workout Style",
        preface: "What type of training do you prefer?",
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
        key: "workout_location",
        type: "text",
        label: "Workout Location",
        preface: "Where will you train? (e.g., YMCA Nashville, Home, Planet Fitness)",
        placeholder: "Gym or location name",
        options: [],
      },
      {
        key: "age_range",
        type: "single",
        label: "Age Range",
        options: [
          { value: "under_25", label: "Under 25" },
          { value: "26-40", label: "26-40" },
          { value: "41-55", label: "41-55" },
          { value: "56+", label: "56+" },
        ],
        default: "26-40",
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
        label: "Workout Focus",
        options: [
          { value: "full_body", label: "Full Body" },
          { value: "upper_lower_split", label: "Upper / Lower Split" },
          { value: "push_pull_legs", label: "Push / Pull / Legs" },
          { value: "custom", label: "Custom" },
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
  {
    id: "nutrition",
    title: "Nutrition",
    preface: "We use this to build meal plans matched to your training targets. No calorie tracking required.",
    questions: [
      {
        key: "meal_plan_opt_in",
        type: "single",
        label: "Generate Meal Plan?",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No, just workouts" },
        ],
        default: "no",
      },
      {
        key: "diet_type",
        type: "single",
        label: "Diet Type",
        preface: "Only shown if you opt in.",
        options: [
          { value: "omnivore", label: "Omnivore" },
          { value: "vegetarian", label: "Vegetarian" },
          { value: "vegan", label: "Vegan" },
          { value: "pescatarian", label: "Pescatarian" },
          { value: "keto_friendly", label: "Keto Friendly" },
          { value: "paleo_friendly", label: "Paleo Friendly" },
        ],
        default: "omnivore",
      },
      {
        key: "cooking_skill",
        type: "single",
        label: "Cooking Skill",
        options: [
          { value: "quick_simple", label: "Quick & Simple" },
          { value: "moderate", label: "Moderate" },
          { value: "elaborate", label: "Elaborate" },
        ],
        default: "moderate",
      },
      {
        key: "allergies",
        type: "multi",
        label: "Allergies / Restrictions",
        options: [
          { value: "none", label: "None" },
          { value: "nuts", label: "Nuts" },
          { value: "dairy", label: "Dairy" },
          { value: "gluten", label: "Gluten" },
          { value: "soy", label: "Soy" },
          { value: "shellfish", label: "Shellfish" },
          { value: "eggs", label: "Eggs" },
        ],
        default: ["none"],
      },
      {
        key: "meals_per_day",
        type: "single",
        label: "Meals Per Day",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
        ],
        default: "3",
      },
    ],
  },
];
