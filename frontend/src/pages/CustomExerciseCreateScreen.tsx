import { useState, useEffect } from "react";
import { api } from "../api";

// Tile option types
type TileOption = {
  label: string;
  value: string | boolean | number;
  description?: string;
};

const COMPOUND_OPTIONS: TileOption[] = [
  { label: "Compound", value: true },
  { label: "Isolation", value: false },
];

const MOVEMENT_PATTERN_OPTIONS: TileOption[] = [
  { label: "Push", value: "push" },
  { label: "Pull", value: "pull" },
  { label: "Legs", value: "legs" },
  { label: "Core", value: "core" },
  { label: "Cardio", value: "cardio" },
  { label: "Full Body", value: "full_body" },
  { label: "Other", value: "other" },
];

const MUSCLE_GROUP_OPTIONS: TileOption[] = [
  { label: "Chest", value: "chest" },
  { label: "Back", value: "back" },
  { label: "Shoulders", value: "shoulders" },
  { label: "Arms", value: "arms" },
  { label: "Upper Legs", value: "upper legs" },
  { label: "Lower Legs", value: "lower legs" },
  { label: "Core", value: "core" },
  { label: "Waist", value: "waist" },
  { label: "Cardio", value: "cardio" },
  { label: "Full Body", value: "full_body" },
  { label: "Other", value: "other" },
];

const EQUIPMENT_OPTIONS: TileOption[] = [
  { label: "Barbell", value: "barbell" },
  { label: "Dumbbell", value: "dumbbell" },
  { label: "Machine", value: "machine" },
  { label: "Cable", value: "cable" },
  { label: "Bodyweight", value: "bodyweight" },
  { label: "Kettlebell", value: "kettlebell" },
  { label: "Resistance Band", value: "resistance_band" },
  { label: "Other", value: "other" },
];

const EXERCISE_ROLE_OPTIONS_COMPOUND: TileOption[] = [
  { label: "Main Compound", value: "main_compound", description: "Primary, heavy compound — the core of the workout" },
  { label: "Secondary", value: "secondary_compound", description: "Secondary compound movements complementing the main ones" },
  { label: "Accessory", value: "accessory", description: "Smaller movements targeting specific muscles or weaknesses" },
  { label: "Warmup", value: "warmup", description: "Pre-workout preparation" },
  { label: "Prehab", value: "prehab_activation", description: "Injury prevention work" },
  { label: "Cool Down", value: "cool_down", description: "Post-workout recovery" },
];

const EXERCISE_ROLE_OPTIONS_ISOLATION: TileOption[] = [
  { label: "Secondary", value: "secondary_compound", description: "Isolation movement complementing a main compound elsewhere" },
  { label: "Accessory", value: "accessory", description: "Smaller isolation movements targeting specific muscles" },
  { label: "Warmup", value: "warmup", description: "Pre-workout preparation" },
  { label: "Prehab", value: "prehab_activation", description: "Injury prevention work" },
  { label: "Cool Down", value: "cool_down", description: "Post-workout recovery" },
];

const MEASUREMENT_TYPE_OPTIONS: TileOption[] = [
  { label: "Weight & Reps", value: "weight_reps", description: "Standard resistance training — add weight to progress" },
  { label: "Inverted Weight & Reps", value: "inverted_weight_reps", description: "Assistance machines — remove weight to progress (more weight = easier)" },
  { label: "Time & Reps", value: "time_reps", description: "Endurance holds — increase time or reps to progress" },
  { label: "Reps Only", value: "reps_only", description: "Bodyweight exercises — increase reps to progress" },
  { label: "Distance", value: "distance", description: "Cardio — increase distance to progress" },
];

type TileGroupProps = {
  title: string;
  options: TileOption[];
  selected?: string | boolean | number | null;
  multiSelect?: boolean;
  selectedItems?: (string | boolean | number)[];
  onSelect?: (value: string | boolean | number) => void;
  onToggleMulti?: (value: string | boolean | number) => void;
};

function TileGroup({
  title,
  options,
  selected,
  multiSelect,
  selectedItems,
  onSelect,
  onToggleMulti,
}: TileGroupProps) {
  return (
    <div className="mb-4">
      <div className="text-xs font-medium text-slate-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected =
            multiSelect && selectedItems?.includes(opt.value)
              ? true
              : selected === opt.value;
          return (
            <div key={String(opt.value)} className="flex flex-col">
              <button
                onClick={() => {
                  if (multiSelect && onToggleMulti) {
                    onToggleMulti(opt.value);
                  } else if (onSelect) {
                    onSelect(opt.value);
                  }
                }}
                className={`rounded-xl border px-3 py-2 text-xs transition-colors w-full ${
                  isSelected
                    ? "border-amber-400 bg-amber-900/40 text-amber-200"
                    : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
                }`}
              >
                {opt.label}
              </button>
              {opt.description && (
                <div className="mt-1 text-[10px] text-slate-500 leading-tight">
                  {opt.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {multiSelect && selectedItems && selectedItems.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-slate-500">Selected:</span>
          {selectedItems.map((v, i) => (
            <span key={String(v)} className="inline-flex items-center gap-1 rounded-lg bg-amber-900/30 border border-amber-700/50 px-2 py-0.5 text-xs text-amber-300">
              {i + 1}. {String(v)}
            </span>
          ))}
          <button
            onClick={() => onToggleMulti && onToggleMulti("__clear__")}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default function CustomExerciseCreateScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const [name, setName] = useState("");
  const [isCompound, setIsCompound] = useState<boolean | null>(null);
  const [movementPattern, setMovementPattern] = useState<string | null>(null);
  const [exerciseRole, setExerciseRole] = useState<string | null>(null);
  const [measurementType, setMeasurementType] = useState<string | null>(null);
  const [muscleGroup, setMuscleGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);

  // Clear exercise role when compound/isolation changes if role is no longer valid
  useEffect(() => {
    if (isCompound === true && exerciseRole === "isolation_technical") {
      setExerciseRole(null);
    } else if (isCompound === false && exerciseRole === "main_compound") {
      setExerciseRole(null);
    }
  }, [isCompound, exerciseRole]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter an exercise name");
      return;
    }
    if (isCompound === null) {
      setError("Please select Compound or Isolation");
      return;
    }
    if (movementPattern === null) {
      setError("Please select a movement pattern");
      return;
    }
    if (exerciseRole === null) {
      setError("Please select an exercise role");
      return;
    }
    if (measurementType === null) {
      setError("Please select a measurement type");
      return;
    }
    if (muscleGroup === null) {
      setError("Please select a muscle group");
      return;
    }
    if (equipment === null) {
      setError("Please select equipment");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload: any = {
        name: name.trim(),
        is_compound: isCompound,
        measurement_type: measurementType,
        movement_pattern: movementPattern,
        exercise_role: exerciseRole,
        muscle_group: muscleGroup,
        equipment: equipment,
      };

      await api.createExerciseLibraryEntry(payload);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create exercise");
    } finally {
      setLoading(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="rounded-2xl border border-green-700/50 bg-green-900/20 p-8 text-center">
          <div className="mb-4 text-4xl">✓</div>
          <h2 className="text-xl font-semibold text-green-200">Exercise Created</h2>
          <p className="mt-2 text-sm text-slate-400">
            "{name}" has been added to your exercise library.
          </p>
          <button
            onClick={onBack}
            className="mt-6 rounded-xl border border-amber-700/60 bg-amber-900/30 px-6 py-3 text-sm font-medium text-amber-200 hover:bg-amber-900/50 transition-colors"
          >
            Back to Workouts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Create Custom Exercise</h1>
        <button
          onClick={onBack}
          className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Required fields */}
      <div className="mb-6">
        <div className="text-xs font-medium text-slate-400 mb-2">Required</div>
      </div>

      <div className="mb-4">
        <label className="text-xs font-medium text-slate-400 mb-2 block">Exercise Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Arsenal Strength Fly Machine"
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/60 focus:outline-none transition-colors"
        />
      </div>

      <TileGroup
        title="Compound or Isolation?"
        options={COMPOUND_OPTIONS}
        selected={isCompound}
        onSelect={(v) => setIsCompound(v as boolean)}
      />

      <TileGroup
        title="Movement Pattern"
        options={MOVEMENT_PATTERN_OPTIONS}
        selected={movementPattern}
        onSelect={(v) => setMovementPattern(v as string)}
      />

      <TileGroup
        title="Exercise Role"
        options={isCompound ? EXERCISE_ROLE_OPTIONS_COMPOUND : EXERCISE_ROLE_OPTIONS_ISOLATION}
        selected={exerciseRole}
        onSelect={(v) => setExerciseRole(v as string)}
      />

      <TileGroup
        title="Measurement Type"
        options={MEASUREMENT_TYPE_OPTIONS}
        selected={measurementType}
        onSelect={(v) => setMeasurementType(v as string)}
      />

      <TileGroup
        title="Muscle Group"
        options={MUSCLE_GROUP_OPTIONS}
        selected={muscleGroup}
        onSelect={(v) => setMuscleGroup(v as string)}
      />

      <TileGroup
        title="Equipment"
        options={EQUIPMENT_OPTIONS}
        selected={equipment}
        onSelect={(v) => setEquipment(v as string)}
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={loading}
        className="mt-6 w-full rounded-2xl border border-amber-700/60 bg-amber-900/30 px-4 py-4 text-sm font-semibold text-amber-200 hover:bg-amber-900/50 transition-colors disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Exercise"}
      </button>
    </div>
  );
}
