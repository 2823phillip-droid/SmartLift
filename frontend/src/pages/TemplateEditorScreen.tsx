import { useEffect, useState } from "react";
import { api } from "../api";
import { log } from "../utils/logger";
import type { ExerciseLibraryItem, WorkoutTemplate } from "../types";

type SetRow = { weight: number; reps: number; effort: number };

const BODY_PARTS = ["All", "Chest", "Shoulders", "Back", "Biceps", "Triceps", "Legs", "Calves", "Core"];

export default function TemplateEditorScreen({
  contextId,
  templateId,
  onBack,
  onSaved,
}: {
  contextId: number;
  templateId?: number;
  onBack: () => void;
  onSaved: (templateId: number) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("strength");
  const [routineRest, setRoutineRest] = useState(90);
  const [exercises, setExercises] = useState<
    { id?: number; name: string; sets: SetRow[]; rest_seconds: number }[]
  >([{ name: "", sets: [{ weight: 0, reps: 0, effort: 3 }], rest_seconds: 90 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ExerciseLibraryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [selectedBodyPart, setSelectedBodyPart] = useState("All");

  useEffect(() => {
    if (templateId) {
      setLoading(true);
      api.getTemplate(templateId)
        .then((tpl: WorkoutTemplate) => {
          setName(tpl.name);
          setType(tpl.type);
          setRoutineRest(tpl.default_rest_seconds || 90);
          setExercises(
            (tpl.exercises || []).map((ex) => ({
              id: ex.id,
              name: ex.name,
              rest_seconds: ex.rest_seconds,
              sets: ex.per_set_data
                ? JSON.parse(ex.per_set_data).map((s: SetRow) => ({
                    weight: s.weight ?? 0,
                    reps: s.reps ?? 10,
                    effort: s.effort ?? 3,
                  }))
                : [{ weight: ex.start_weight || 0, reps: ex.reps_target || 10, effort: 3 }],
            }))
          );
        })
        .catch((e) => log.error("template_load_failed", { template_id: templateId, error: e }))
        .finally(() => setLoading(false));
    }
  }, [templateId]);

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<SetRow>) => {
    setExercises((list) => {
      const next = [...list];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], ...patch };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });
  };

  const addSet = (exIdx: number) => {
    setExercises((list) => {
      const next = [...list];
      next[exIdx] = {
        ...next[exIdx],
        sets: [...next[exIdx].sets, { weight: 0, reps: 0, effort: 3 }],
      };
      return next;
    });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((list) => {
      const next = [...list];
      if (next[exIdx].sets.length <= 1) return list;
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.filter((_, i) => i !== setIdx),
      };
      return next;
    });
  };

  const moveExercise = (idx: number, direction: -1 | 1) => {
    setExercises((list) => {
      const next = [...list];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return list;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      let tpl: WorkoutTemplate;
      if (templateId) {
        tpl = (await api.updateTemplate(templateId, {
          name,
          type,
          default_rest_seconds: routineRest,
        })) as WorkoutTemplate;
      } else {
        tpl = (await api.createTemplate({
          context_id: contextId,
          name,
          type,
          order: 0,
          default_rest_seconds: routineRest,
        })) as WorkoutTemplate;
      }

      // Sync exercises: anything with an existing id and not in the saved list will be removed.
      // For simplicity in this flow: remove all existing not present, create/update present.
      const existing = exercises.filter((ex) => ex.id);
      const existingIds = existing.map((ex) => ex.id!).filter(Boolean);
      const currentExercises = await api.getExercises(tpl.id);
      for (const cur of currentExercises) {
        if (!existingIds.includes(cur.id)) {
          await api.deleteExercise(cur.id);
        }
      }

      for (let idx = 0; idx < exercises.length; idx++) {
        const ex = exercises[idx];
        if (!ex.name.trim()) continue;
        const perSetData = JSON.stringify(
          ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, effort: s.effort }))
        );
        const base = {
          template_id: tpl.id,
          name: ex.name,
          sets_target: ex.sets.length,
          reps_target: ex.sets[0]?.reps ?? 10,
          start_weight: ex.sets[0]?.weight ?? 0,
          rest_seconds: ex.rest_seconds,
          order: idx,
          per_set_data: perSetData,
        };
        if (ex.id) {
          await api.updateExercise(ex.id, base);
        } else {
          await api.createExercise(base);
        }
      }

      onSaved(tpl.id);
    } catch (e) {
      log.error("template_save_failed", { template_id: templateId, context_id: contextId, error: e });
      alert("Save failed. Check console.");
    } finally {
      setSaving(false);
    }
  };

  const addFromLibrary = (ex: ExerciseLibraryItem) => {
    setExercises((e) => [
      ...e,
      { name: ex.name, sets: [{ weight: 0, reps: 0, effort: 3 }], rest_seconds: ex.default_rest_seconds || 90 },
    ]);
    setSearch("");
    setResults([]);
  };

  const searchLibrary = async (query: string) => {
    setSearch(query);
    setLoadingLibrary(true);
    try {
      const q = query.trim();
      let items: ExerciseLibraryItem[];
      if (q.length >= 2) {
        items = (await api.searchExerciseLibrary(q)) as ExerciseLibraryItem[];
      } else {
        items = (await api.searchExerciseLibrary("")) as ExerciseLibraryItem[];
      }
      if (selectedBodyPart !== "All") {
        items = items.filter((item) => item.muscle_group === selectedBodyPart);
      }
      setResults(items);
    } finally {
      setLoadingLibrary(false);
    }
  };

  useEffect(() => {
    searchLibrary(search);
  }, [selectedBodyPart, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{templateId ? "Edit Routine" : "New Routine"}</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 text-center py-6">Loading routine...</div>
      ) : (
        <>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Routine name"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm"
            >
              <option value="strength">Strength</option>
              <option value="hiit">HIIT</option>
              <option value="active_rest">Active Rest</option>
            </select>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-semibold text-sm">Routine Rest Timer</div>
                <p className="text-xs text-slate-500">Default rest between exercises (overridable per exercise).</p>
              </div>
            </div>
            <input
              type="number"
              value={routineRest}
              onChange={(e) => setRoutineRest(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-center font-semibold"
            />
            <div className="flex justify-center gap-2">
              {[60, 90, 120, 180].map((s) => (
                <button
                  key={s}
                  onClick={() => setRoutineRest(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                    routineRest === s
                      ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Exercises</h3>
              <span className="text-xs text-slate-500">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</span>
            </div>

            {exercises.map((ex, idx) => (
              <div
                key={ex.id ?? `new-${idx}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4"
              >
                <div className="space-y-3">
                  <input
                    value={ex.name}
                    onChange={(e) => {
                      const next = [...exercises];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setExercises(next);
                    }}
                    placeholder="Exercise name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={ex.rest_seconds}
                      onChange={(e) => {
                        const next = [...exercises];
                        next[idx] = { ...next[idx], rest_seconds: Number(e.target.value) };
                        setExercises(next);
                      }}
                      className="w-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-center font-medium"
                      placeholder="Rest"
                    />
                    <span className="text-xs text-slate-500">sec rest</span>
                    {exercises.length > 1 && (
                      <button
                        onClick={() => setExercises(exercises.filter((_, i) => i !== idx))}
                        className="ml-auto text-xs text-rose-500 hover:text-rose-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-950/30 font-medium"
                      >
                        Remove
                      </button>
                    )}
                    <div className="inline-flex items-center gap-1 ml-1">
                      <button
                        onClick={() => moveExercise(idx, -1)}
                        disabled={idx === 0}
                        className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1.5 py-1 rounded-lg hover:bg-slate-800/60"
                      >↑</button>
                      <button
                        onClick={() => moveExercise(idx, 1)}
                        disabled={idx === exercises.length - 1}
                        className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1.5 py-1 rounded-lg hover:bg-slate-800/60"
                      >↓</button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Sets</div>
                  <div className="grid gap-2">
                    {ex.sets.map((s, setIdx) => (
                      <div
                        key={setIdx}
                        className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2 bg-slate-950/50 rounded-xl p-2"
                      >
                        <div className="text-xs font-semibold text-slate-500 w-12">{setIdx + 1}</div>
                        <input
                          type="number"
                          value={s.weight || ""}
                          onChange={(e) => updateSet(idx, setIdx, { weight: Number(e.target.value) || 0 })}
                          placeholder="Lbs"
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-center"
                        />
                        <input
                          type="number"
                          value={s.reps || ""}
                          onChange={(e) => updateSet(idx, setIdx, { reps: Number(e.target.value) || 0 })}
                          placeholder="Reps"
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-center"
                        />
                        <select
                          value={s.effort}
                          onChange={(e) => updateSet(idx, setIdx, { effort: Number(e.target.value) })}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-center"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>E{n}</option>
                          ))}
                        </select>
                        {ex.sets.length > 1 && (
                          <button
                            onClick={() => removeSet(idx, setIdx)}
                            className="text-rose-500/80 hover:text-rose-400 transition-colors px-2 py-1 rounded-lg hover:bg-rose-950/30"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addSet(idx)}
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-indigo-950/30"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Set
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => setExercises([...exercises, { name: "", sets: [{ weight: 0, reps: 0, effort: 3 }], rest_seconds: 90 }])}
              className="w-full rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-500/50 px-4 py-4 text-sm text-slate-500 hover:text-indigo-300 transition-colors font-medium"
            >
              + Add Exercise
            </button>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-sm text-slate-400">Exercise Library</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {BODY_PARTS.map((bp) => (
                <button
                  key={bp}
                  onClick={() => setSelectedBodyPart(bp)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                    selectedBodyPart === bp
                      ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {bp}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => searchLibrary(e.target.value)}
              placeholder="Search exercises..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm"
            />
            {loadingLibrary && <div className="text-xs text-slate-500">Searching...</div>}
            {!loadingLibrary && search.trim().length >= 2 && results.length === 0 && (
              <div className="text-xs text-slate-500">No matches. Try a different body part or search term.</div>
            )}
            <div className="grid grid-cols-1 gap-2">
              {results.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => addFromLibrary(ex)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 px-4 py-3 text-left transition-colors"
                >
                  <div className="font-semibold text-sm">{ex.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{ex.muscle_group} · {ex.equipment}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {saving ? "Saving..." : templateId ? "Save Changes" : "Save Routine"}
          </button>
        </>
      )}
    </div>
  );
}
