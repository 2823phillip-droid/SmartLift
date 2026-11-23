import { useState, useEffect } from "react";
import { api, resolveMediaUrl } from "../api";
import { log } from "../utils/logger";

type ExerciseLibraryItem = {
  id: number;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  primary_equipment: string | null;
  default_rest_seconds: number;
  video_url: string | null;
  image_url: string | null;
  gif_url: string | null;
  is_compound: boolean | null;
  is_custom: boolean;
  user_id: number | null;
  measurement_type: string | null;
  program_worthy: boolean | null;
  description: string | null;
  _showDescription: boolean;
};

type FilterItem = { label: string; value: string | null };

const MUSCLE_GROUPS: FilterItem[] = [
  { label: "All", value: null },
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
];

const EQUIPMENT: FilterItem[] = [
  { label: "All", value: null },
  { label: "Barbell", value: "barbell" },
  { label: "Dumbbell", value: "dumbbell" },
  { label: "Machine", value: "machine" },
  { label: "Cable", value: "cable" },
  { label: "Bodyweight", value: "bodyweight" },
  { label: "Kettlebell", value: "kettlebell" },
  { label: "Resistance Band", value: "resistance_band" },
];

const MEASUREMENT_TYPES: FilterItem[] = [
  { label: "All", value: null },
  { label: "Weight & Reps", value: "weight_reps" },
  { label: "Inverted Weight & Reps", value: "inverted_weight_reps" },
  { label: "Time & Reps", value: "time_reps" },
  { label: "Reps Only", value: "reps_only" },
  { label: "Distance", value: "distance" },
];

export default function ExerciseLibraryScreen({ onBack }: { onBack: () => void }) {
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState<string | null>(null);
  const [filterEquipment, setFilterEquipment] = useState<string | null>(null);
  const [filterMeasurement, setFilterMeasurement] = useState<string | null>(null);
  const [showCustomOnly, setShowCustomOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .searchExerciseLibrary("")
      .then((data: any[]) => {
        if (!cancelled) setExercises(data.map((item) => ({ ...item, _showDescription: false })) as ExerciseLibraryItem[]);
      })
      .catch((e) => log.error("exercise_library_load_failed", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = exercises.filter((ex) => {
    if (showCustomOnly && !ex.is_custom) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (!ex.name.toLowerCase().includes(q)) return false;
    }
    if (filterMuscle && ex.muscle_group !== filterMuscle) return false;
    if (filterEquipment && ex.primary_equipment !== filterEquipment) return false;
    if (filterMeasurement && ex.measurement_type !== filterMeasurement) return false;
    return true;
  });

  const resetFilters = () => {
    setSearchQuery("");
    setFilterMuscle(null);
    setFilterEquipment(null);
    setFilterMeasurement(null);
    setShowCustomOnly(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-slate-100">Exercise Library</h2>
        <div className="w-10" />
      </div>

      {/* Search and filters */}
      <div className="px-4 py-3 space-y-3 border-b border-slate-800/80">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search exercises..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/60 focus:outline-none transition-colors"
        />

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Muscle</label>
            <select
              value={filterMuscle || ""}
              onChange={(e) => setFilterMuscle(e.target.value || null)}
              className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none w-24"
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m.value || "all"} value={m.value || ""}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Equip</label>
            <select
              value={filterEquipment || ""}
              onChange={(e) => setFilterEquipment(e.target.value || null)}
              className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none w-20"
            >
              {EQUIPMENT.map((e) => (
                <option key={e.value || "all"} value={e.value || ""}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Measure</label>
            <select
              value={filterMeasurement || ""}
              onChange={(e) => setFilterMeasurement(e.target.value || null)}
              className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none w-24"
            >
              {MEASUREMENT_TYPES.map((m) => (
                <option key={m.value || "all"} value={m.value || ""}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowCustomOnly(!showCustomOnly)}
            className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
              showCustomOnly
                ? "border-amber-400 bg-amber-900/40 text-amber-200"
                : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500"
            }`}
          >
            {showCustomOnly ? "Custom Only" : "All Ex."}
          </button>

          {(filterMuscle || filterEquipment || filterMeasurement || showCustomOnly) && (
            <button
              onClick={resetFilters}
              className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 hover:border-slate-500 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-800/60">
        {loading ? "Loading..." : `${filtered.length} exercises`}
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
            Loading library...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
            No exercises found.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filtered.map((ex) => (
              <div
                key={ex.id}
                className="px-4 py-3 flex gap-3 hover:bg-slate-900/50 transition-colors cursor-pointer"
                onClick={() => setSelectedId(selectedId === ex.id ? null : ex.id)}
              >
                {/* GIF tile */}
                <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
                  {ex.gif_url ? (
                    <img
                      src={resolveMediaUrl(ex.gif_url)!}
                      alt={ex.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : ex.image_url ? (
                    <img
                      src={ex.image_url}
                      alt={ex.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-600 bg-slate-800">
                      {ex.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Exercise info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase ${
                        ex.is_custom
                          ? "text-amber-300 border-amber-700/60 bg-amber-900/30"
                          : "text-slate-400 border-slate-700 bg-slate-800/50"
                      }`}>
                        {ex.is_custom ? "Custom" : "Library"}
                      </span>
                      {ex.measurement_type && (
                        <span className="text-[10px] text-slate-500">
                          {ex.measurement_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
                      {ex.name}
                    </h3>
                    {ex.muscle_group && (
                      <span className="text-xs text-slate-500">{ex.muscle_group}</span>
                    )}
                    {ex.primary_equipment && (
                      <span className="text-xs text-slate-500">· {ex.primary_equipment}</span>
                    )}
                  </div>
                  {ex.description && (
                    <button
                      onClick={() => {
                        setExercises((prev) =>
                          prev.map((e) =>
                            e.id === ex.id ? { ...e, _showDescription: !e._showDescription } : e
                          )
                        );
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 shrink-0"
                    >
                      {ex._showDescription ? "hide" : "describe"}
                    </button>
                  )}
                </div>
                {ex._showDescription && ex.description && (
                  <p className="text-xs text-slate-400 pl-2 border-l-2 border-amber-700/40 pl-3 mt-1 leading-relaxed">
                    {ex.description}
                  </p>
                )}
                {!ex.description && ex.is_custom && (
                  <p className="text-[10px] text-slate-600 italic pl-2 border-l-2 border-slate-700/40 pl-3 mt-1">
                    No description provided.
                  </p>
                )}
              </div>
            </div>
            ))}
          </div>
        )}
      </div>

      {/* Exercise detail view */}
      {selectedId && (() => {
        const ex = exercises.find((e) => e.id === selectedId);
        if (!ex) return null;
        return (
          <div className="border-t border-slate-800/80 bg-slate-900/50">
            <div className="max-w-2xl mx-auto px-4 py-4">
              <div className="flex gap-4 items-start">
                {/* Large GIF */}
                {ex.gif_url ? (
                  <div className="shrink-0">
                    <img
                      src={resolveMediaUrl(ex.gif_url)!}
                      alt={ex.name}
                      className="w-32 h-32 rounded-xl object-cover border border-slate-700 bg-slate-800"
                    />
                  </div>
                ) : (
                  <div className="shrink-0 w-32 h-32 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <span className="text-xs text-slate-500">No GIF</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-slate-100">{ex.name}</h3>
                  <div className="mt-2 space-y-1">
                    {ex.is_custom && (
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase text-amber-300 border-amber-700/60 bg-amber-900/30">
                        Custom
                      </span>
                    )}
                    {ex.measurement_type && (
                      <span className="text-xs text-slate-400">
                        Measurement: {ex.measurement_type.replace(/_/g, " ")}
                      </span>
                    )}
                    {ex.muscle_group && (
                      <span className="text-xs text-slate-400">
                        Muscle Group: {ex.muscle_group}
                      </span>
                    )}
                    {ex.primary_equipment && (
                      <span className="text-xs text-slate-400">
                        Equipment: {ex.primary_equipment}
                      </span>
                    )}
                    {ex.default_rest_seconds !== undefined && (
                      <span className="text-xs text-slate-400">
                        Rest: {ex.default_rest_seconds}s
                      </span>
                    )}
                  </div>
                  {ex.description ? (
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed border-l-2 border-amber-700/40 pl-3">
                      {ex.description}
                    </p>
                  ) : ex.is_custom ? (
                    <p className="mt-2 text-[10px] text-slate-600 italic">
                      No description provided.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
