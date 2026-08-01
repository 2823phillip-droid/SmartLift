export interface Context {
  id: number;
  name: string;
  description?: string;
  equipment_tags: string[];
  is_active: boolean;
  default_rest_seconds: number;
}

export interface ExerciseLibraryItem {
  id: number;
  name: string;
  muscle_group?: string;
  equipment?: string;
  default_rest_seconds: number;
  video_url?: string | null;
  image_url?: string | null;
  gif_url?: string | null;
}

export interface SetSuggestion {
  weight: number;
  reps: number;
  effort: number;
}

export interface ExerciseEntry {
  id: number;
  template_id: number;
  exercise_library_id?: number;
  name: string;
  sets_target: number;
  reps_target: number;
  start_weight: number;
  rest_seconds: number;
  order: number;
  notes?: string;
  per_set_data?: string;
  progression_type?: string;
  deload_override?: boolean;
}

export interface WorkoutTemplate {
  id: number;
  context_id: number;
  name: string;
  type: string;
  order: number;
  default_rest_seconds?: number;
  exercises: ExerciseEntry[];
}

export interface WorkoutTemplateUpdate {
  name: string;
  type?: string;
  order?: number;
  default_rest_seconds?: number;
}

export interface WorkoutSession {
  id: number;
  template_id?: number;
  started_at: string;
  ended_at?: string;
  pre_workout_mood?: string;
  pre_workout_tags: string[];
  status: string;
  template_name?: string;
  context_name?: string;
}

export interface SetLog {
  id: number;
  session_id: number;
  exercise_entry_id: number;
  set_index: number;
  suggested_weight?: number;
  suggested_reps?: number;
  actual_weight?: number;
  actual_reps?: number;
  effort?: number;
  rir?: number;
  notes?: string;
}

export interface CoachMessage {
  id: number;
  session_id: number;
  role: string;
  content: string;
  timestamp: string;
}

export interface ExerciseProgressPoint {
  date: string;
  weight: number;
  reps: number;
}

export interface ExerciseProgressResponse {
  exercise_entry_id: number;
  name: string;
  points: ExerciseProgressPoint[];
}

export interface ExerciseNameProgressResponse {
  name: string;
  points: ExerciseProgressPoint[];
  seeded?: boolean;
}

export interface BodyWeightLog {
  id: number;
  weight_lbs: number;
  logged_at: string;
  notes?: string;
}

export interface WorkoutLibraryExercise {
  id: number;
  workout_library_id: number;
  name: string;
  muscle_group?: string;
  equipment?: string;
  sets_target: number;
  reps_target: number;
  start_weight: number;
  rest_seconds: number;
  order: number;
  notes?: string;
  gif_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
}

export interface WorkoutLibrary {
  id: number;
  name: string;
  category: string;
  difficulty: string;
  description?: string;
  estimated_minutes?: number;
  exercises: WorkoutLibraryExercise[];
}

export interface WorkoutLibraryImportResult {
  context_id: number;
  template_id: number;
  exercises_imported: number;
}

export interface AITrainerAdjustment {
  id: number;
  session_id: number;
  template_id?: number;
  exercise_entry_id?: number;
  exercise_name: string;
  proposed_weight?: number;
  proposed_reps?: number;
  proposed_sets?: number;
  proposed_rest_seconds?: number;
  proposed_order?: number;
  effort_avg?: number;
  progression_type?: string;
  applied: boolean;
  created_at: string;
}
