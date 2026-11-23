import { useState } from "react";
import { api } from "../api";

// Tile option types
type TileOption = {
  label: string;
  value: string | boolean | number;
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

const EXERCISE_ROLE_OPTIONS: TileOption[] = [
  { label: "Main Compound", value: "main_compound" },
  { label: "Secondary", value: "secondary_compound" },
  { label: "Accessory", value: "accessory" },
  { label: "Isolation", value: "isolation_technical" },
  { label: "Warmup", value: "warmup" },
  { label: "Prehab", value: "prehab_activation" },
  { label: "Cool Down", value: "cool_down" },
];

const MUSCLE_GROUP_OPTIONS: TileOption[] = [
  { label: "Chest", value: "chest" },
  { label: "Back", value: "back" },
  { label: "Shoulders", value: "shoulders" },
  { label: "Arms", value: "arms" },
  { label: "Legs", value: "legs" },
  { label: "Core", value: "core" },
  { label: "Cardio", value: "cardio" },
  { label: "Full Body", value: "full_body" },
  { label: "Other", value: "other" },
];

const EQUIPMENT_OPTIONS: TileOption[] = [
  { label: "Bodyweight", value: "bodyweight" },
  { label: "Barbell", value: "barbell" },
  { label: "Dumbbell", value: "dumbbell" },
  { label: "Cable", value: "cable" },
  { label: "Machine", value: "machine" },
  { label: "Bands", value: "bands" },
  { label: "Kettlebell", value: "kettlebell" },
  { label: "Other", value: "other" },
];

const REST_OPTIONS: TileOption[] = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "120s", value: 120 },
  { label: "150s", value: 150 },
  { label: "180s", value: 180 },
];

const LOAD_SCORE_OPTIONS: TileOption[] = [
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
];

const JOINT_OPTIONS: TileOption[] = [
  { label: "Shoulder", value: "shoulder" },
  { label: "Elbow", value: "elbow" },
  { label: "Wrist", value: "wrist" },
  { label: "Knee", value: "knee" },
  { label: "Hip", value: "hip" },
  { label: "Ankle", value: "ankle" },
  { label: "Spine", value: "spine" },
];

const MOVEMENT_TYPE_OPTIONS: TileOption[] = [
  { label: "Compound", value: "compound" },
  { label: "Isolation", value: "isolation" },
  { label: "Helper", value: "helper" },
];

const BASE_MOVEMENT_OPTIONS: TileOption[] = [
  { label: "Horiz. Push", value: "horizontal_push" },
  { label: "Horiz. Pull", value: "horizontal_pull" },
  { label: "Vert. Push", value: "vertical_push" },
  { label: "Vert. Pull", value: "vertical_pull" },
  { label: "Squat", value: "squat" },
  { label: "Hinge", value: "hinge" },
  { label: "Lunge", value: "lunge" },
  { label: "Rotation", value: "rotation" },
  { label: "Carry", value: "carry" },
  { label: "Other", value: "other" },
];

const WARMUP_TYPE_OPTIONS: TileOption[] = [
  { label: "Dynamic", value: "dynamic" },
  { label: "Static", value: "static" },
  { label: "Activation", value: "activation" },
  { label: "General", value: "general" },
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
            <button
              key={String(opt.value)}
              onClick={() => {
                if (multiSelect && onToggleMulti) {
                  onToggleMulti(opt.value);
                } else if (onSelect) {
                  onSelect(opt.value);
                }
              }}
              className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                isSelected
                  ? "border-amber-400 bg-amber-900/40 text-amber-200"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
              }`}
            >
              {opt.label}
            </button>
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

  // Optional multi-select
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [jointStress, setJointStress] = useState<string[]>([]);

  // Optional single-select
  const [primaryEquipment, setPrimaryEquipment] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<string | null>(null);
  const [defaultRest, setDefaultRest] = useState<number | null>(null);
  const [systemicFatigueLoad, setSystemicFatigueLoad] = useState<number | null>(null);
  const [structuralSafetyScore, setStructuralSafetyScore] = useState<number | null>(null);
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [impactScore, setImpactScore] = useState<number | null>(null);
  const [baseMovement, setBaseMovement] = useState<string | null>(null);
  const [hittWorthy, setHittWorthy] = useState<boolean | null>(null);
  const [warmupType, setWarmupType] = useState<string | null>(null);

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

    setLoading(true);
    setError("");

    try {
      const payload: any = {
        name: name.trim(),
        is_compound: isCompound,
        movement_pattern: movementPattern,
        exercise_role: exerciseRole,
      };

      // Optional fields
      if (muscleGroups.length > 0) payload.muscle_group = JSON.stringify(muscleGroups);
      if (equipment.length > 0) payload.equipment = JSON.stringify(equipment);
      if (jointStress.length > 0) payload.joint_stress_flags = JSON.stringify(jointStress);
      if (primaryEquipment) payload.primary_equipment = primaryEquipment;
      if (movementType) payload.movement_type = movementType;
      if (defaultRest) payload.default_rest_seconds = defaultRest;
      if (systemicFatigueLoad !== null) payload.systemic_fatigue_load = systemicFatigueLoad;
      if (structuralSafetyScore !== null) payload.structural_safety_score = structuralSafetyScore;
      if (riskScore !== null) payload.risk_score = riskScore;
      if (impactScore !== null) payload.impact_score = impactScore;
      if (baseMovement) payload.base_movement = baseMovement;
      if (hittWorthy !== null) payload.hitt_worthy = hittWorthy ? 1 : 0;
      if (warmupType) payload.warmup_type = warmupType;

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
        options={EXERCISE_ROLE_OPTIONS}
        selected={exerciseRole}
        onSelect={(v) => setExerciseRole(v as string)}
      />

      {/* Optional fields */}
      <div className="my-6 border-t border-slate-800 pt-4">
        <button
          onClick={() => document.getElementById("optional-fields")?.scrollIntoView({ behavior: "smooth" })}
          className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          <span className="transition-transform">▼</span>
          <span className="font-medium">Optional Fields</span>
        </button>
      </div>

      <div id="optional-fields" className="space-y-1">
        <TileGroup
          title="Muscle Groups (tap in order: primary first)"
          options={MUSCLE_GROUP_OPTIONS}
          multiSelect
          selectedItems={muscleGroups}
          onToggleMulti={(v) => {
            if (v === "__clear__") {
              setMuscleGroups([]);
            } else if (muscleGroups.includes(v as string)) {
              setMuscleGroups(muscleGroups.filter((m) => m !== v));
            } else {
              setMuscleGroups([...muscleGroups, v as string]);
            }
          }}
        />

        <TileGroup
          title="Equipment Used"
          options={EQUIPMENT_OPTIONS}
          multiSelect
          selectedItems={equipment}
          onToggleMulti={(v) => {
            if (v === "__clear__") {
              setEquipment([]);
            } else if (equipment.includes(v as string)) {
              setEquipment(equipment.filter((e) => e !== v));
            } else {
              setEquipment([...equipment, v as string]);
            }
          }}
        />

        <TileGroup
          title="Primary Equipment"
          options={EQUIPMENT_OPTIONS.filter((e) => ["barbell", "dumbbell", "cable", "machine", "bodyweight", "bands", "kettlebell"].includes(e.value as string))}
          selected={primaryEquipment}
          onSelect={(v) => setPrimaryEquipment(v as string)}
        />

        <TileGroup
          title="Movement Type"
          options={MOVEMENT_TYPE_OPTIONS}
          selected={movementType}
          onSelect={(v) => setMovementType(v as string)}
        />

        <TileGroup
          title="Default Rest (seconds)"
          options={REST_OPTIONS}
          selected={defaultRest}
          onSelect={(v) => setDefaultRest(v as number)}
        />

        <TileGroup
          title="Systemic Fatigue Load (0-5)"
          options={LOAD_SCORE_OPTIONS}
          selected={systemicFatigueLoad}
          onSelect={(v) => setSystemicFatigueLoad(v as number)}
        />

        <TileGroup
          title="Structural Safety Score (0-5)"
          options={LOAD_SCORE_OPTIONS}
          selected={structuralSafetyScore}
          onSelect={(v) => setStructuralSafetyScore(v as number)}
        />

        <TileGroup
          title="Risk Score (0-5)"
          options={LOAD_SCORE_OPTIONS}
          selected={riskScore}
          onSelect={(v) => setRiskScore(v as number)}
        />

        <TileGroup
          title="Impact Score (0-5)"
          options={LOAD_SCORE_OPTIONS}
          selected={impactScore}
          onSelect={(v) => setImpactScore(v as number)}
        />

        <TileGroup
          title="Base Movement"
          options={BASE_MOVEMENT_OPTIONS}
          selected={baseMovement}
          onSelect={(v) => setBaseMovement(v as string)}
        />

        <TileGroup
          title="HIIT Worthy?"
          options={[{ label: "Yes", value: true }, { label: "No", value: false }]}
          selected={hittWorthy}
          onSelect={(v) => setHittWorthy(v as boolean)}
        />

        <TileGroup
          title="Warmup Type"
          options={WARMUP_TYPE_OPTIONS}
          selected={warmupType}
          onSelect={(v) => setWarmupType(v as string)}
        />

        <TileGroup
          title="Joint Stress (tap in order)"
          options={JOINT_OPTIONS}
          multiSelect
          selectedItems={jointStress}
          onToggleMulti={(v) => {
            if (v === "__clear__") {
              setJointStress([]);
            } else if (jointStress.includes(v as string)) {
              setJointStress(jointStress.filter((j) => j !== v));
            } else {
              setJointStress([...jointStress, v as string]);
            }
          }}
        />
      </div>

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
