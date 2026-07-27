import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { api } from "../api";
import { log } from "../utils/logger";
import type { ExerciseLibraryItem, WorkoutTemplate } from "../types";

type SetRow = { weight: number; reps: number };

type DraftExercise = {
  localId: string;
  id?: number;
  name: string;
  sets: SetRow[];
  rest_seconds: number;
};

const toTitle = (v: string) =>
  v
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

const DRAFT_KEY = "new-routine-draft-v1";

export default function TemplateEditorScreen({
  contextId,
  templateId,
  onBack,
  onSaved,
  onCancel,
}: {
  contextId: number;
  templateId?: number;
  onBack: () => void;
  onSaved: (templateId: number) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("strength");
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [exerciseRestOverrides, setExerciseRestOverrides] = useState<Record<string, number>>({});
  const [exerciseRestEditing, setExerciseRestEditing] = useState<Record<string, boolean>>({});
  const [exerciseRestDraft, setExerciseRestDraft] = useState<Record<string, string>>({});

  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);

  const [globalRest, setGlobalRest] = useState<number>(90);

  const openPreview = async (url: string) => {
    if (!url) return;
    try {
      if (Capacitor.getPlatform() === "ios") {
        await Browser.open({ url, presentationStyle: "fullscreen" });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error("preview_failed", e);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const loadDraft = (): { name: string; type: string; exercises: DraftExercise[] } | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const saveDraft = (data: { name: string; type: string; exercises: DraftExercise[] }) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  useEffect(() => {
    if (templateId) {
      setLoading(true);
      api
        .getTemplate(templateId)
        .then((tpl: WorkoutTemplate) => {
          setName(tpl.name);
          setType(tpl.type);
          setExercises(
            (tpl.exercises || []).map((ex) => ({
              localId: `server-${ex.id}`,
              id: ex.id,
              name: ex.name,
              rest_seconds: ex.rest_seconds,
              sets: ex.per_set_data
                ? JSON.parse(ex.per_set_data).map((s: SetRow) => ({
                    weight: s.weight ?? 0,
                    reps: s.reps ?? 10,
                  }))
                : [{ weight: ex.start_weight || 0, reps: ex.reps_target || 10 }],
            }))
          );
        })
        .catch((e) => log.error("template_load_failed", { template_id: templateId, error: e }))
        .finally(() => setLoading(false));
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .getSetting("global_rest_seconds")
      .then((setting) => {
        if (!cancelled && setting?.value) {
          setGlobalRest(Number(setting.value));
        }
      })
      .catch(() => {});

    const draft = loadDraft();
    if (draft) {
      setName(draft.name);
      setType(draft.type);
      if (draft.exercises?.length) {
        setExercises(draft.exercises);
      }
    }
    if (!cancelled) setLoading(false);

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (templateId) return;
    saveDraft({ name, type, exercises });
  }, [name, type, exercises, templateId]);

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
        sets: [...next[exIdx].sets, { weight: 0, reps: 0 }],
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
        })) as WorkoutTemplate;
      } else {
        tpl = (await api.createTemplate({
          context_id: contextId,
          name,
          type,
          order: 0,
        })) as WorkoutTemplate;
      }

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
          ex.sets.map((s) => ({ weight: s.weight, reps: s.reps }))
        );
        const base = {
          template_id: tpl.id,
          name: ex.name,
          sets_target: ex.sets.length,
          reps_target: ex.sets[0]?.reps ?? 10,
          start_weight: ex.sets[0]?.weight ?? 0,
          rest_seconds: exerciseRestOverrides[ex.localId] ?? ex.rest_seconds,
          order: idx,
          per_set_data: perSetData,
        };
        if (ex.id) {
          await api.updateExercise(ex.id, base);
        } else {
          await api.createExercise(base);
        }
      }

      clearDraft();
      onSaved(tpl.id);
    } catch (e) {
      log.error("template_save_failed", { template_id: templateId, context_id: contextId, error: e });
      alert("Save failed. Check console.");
    } finally {
      setSaving(false);
    }
  };

  const addFromLibrary = (ex: ExerciseLibraryItem) => {
    const newEx: DraftExercise = {
      localId: `new-${Date.now()}-${Math.random()}`,
      name: ex.name,
      sets: [{ weight: 0, reps: 0 }],
      rest_seconds: globalRest,
    };
    setExercises((e) => [...e, newEx]);
    setSearch("");
    setSelectedMuscle(null);
    setSelectedEquipment(null);
  };

  useEffect(() => {
    setLoadingLibrary(true);
    api
      .searchExerciseLibrary("")
      .then((data) => {
        setLibrary(data as ExerciseLibraryItem[]);
        setLoadingLibrary(false);
      })
      .catch(() => setLoadingLibrary(false));
  }, []);

  const muscleFilters = useMemo(() => {
    const map = new Map<string, number>();
    for (const ex of library) {
      const raw = (ex.muscle_group || "").trim();
      if (!raw) continue;
      const display = toTitle(raw);
      map.set(display, (map.get(display) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [library]);

  const equipmentFilters = useMemo(() => {
    const map = new Map<string, number>();
    for (const ex of library) {
      const raw = (ex.equipment || "").trim();
      if (!raw) continue;
      const display = toTitle(raw);
      map.set(display, (map.get(display) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [library]);

  const results = useMemo(() => {
    let items = library;
    const q = search.trim().toLowerCase();
    if (q.length >= 2) {
      items = items.filter((ex) => ex.name.toLowerCase().includes(q));
    }
    if (selectedMuscle) {
      items = items.filter((ex) => {
        const raw = (ex.muscle_group || "").trim();
        return raw && toTitle(raw) === selectedMuscle;
      });
    }
    if (selectedEquipment) {
      items = items.filter((ex) => {
        const raw = (ex.equipment || "").trim();
        return raw && toTitle(raw) === selectedEquipment;
      });
    }
    return items;
  }, [library, search, selectedMuscle, selectedEquipment]);

  const toggleExerciseRestEdit = (ex: DraftExercise, enabled: boolean) => {
    const key = ex.localId;
    if (enabled) {
      setExerciseRestEditing((prev) => ({ ...prev, [key]: true }));
      setExerciseRestDraft((prev) => ({
        ...prev,
        [key]: String(exerciseRestOverrides[key] ?? ex.rest_seconds),
      }));
    } else {
      setExerciseRestEditing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setExerciseRestDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const commitExerciseRest = (ex: DraftExercise, value: string) => {
    const val = parseInt(value, 10);
    if (!Number.isNaN(val) && val >= 0) {
      setExerciseRestOverrides((prev) => ({ ...prev, [ex.localId]: val }));
    }
  };

  const removeExercise = (idx: number) => {
    setExercises((list) => list.filter((_, i) => i !== idx));
  };

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

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Exercises</h3>
              <span className="text-xs text-slate-500">
                {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
              </span>
            </div>

            {exercises.map((ex, idx) => (
              <div
                key={ex.localId}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 space-y-3"
              >
                <div className="space-y-3">
                  <div
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 truncate"
                    title={ex.name}
                  >
                    {ex.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={exerciseRestDraft[ex.localId] ?? String(ex.rest_seconds)}
                        disabled={!exerciseRestEditing[ex.localId]}
                        onChange={(e) => {
                          commitExerciseRest(ex, e.target.value);
                          setExerciseRestDraft((prev) => ({ ...prev, [ex.localId]: e.target.value }));
                        }}
                        className={`w-12 rounded-md border px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors ${
                          exerciseRestEditing[ex.localId]
                            ? "border-indigo-500 bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-400"
                            : "border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExerciseRestEdit(ex, !exerciseRestEditing[ex.localId])}
                        className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
                          exerciseRestEditing[ex.localId]
                            ? "border-indigo-500 bg-indigo-600 justify-end"
                            : "border-slate-700 bg-slate-800 justify-start"
                        }`}
                        title={exerciseRestEditing[ex.localId] ? "Use global rest" : "Override rest"}
                      >
                        <div className="h-3 w-3 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                    <span className="text-xs text-slate-500">sec</span>
                    <button
                      onClick={() => removeExercise(idx)}
                      className="ml-auto text-xs text-rose-500 hover:text-rose-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-rose-950/30 font-medium"
                    >
                      Remove
                    </button>
                    <div className="inline-flex items-center gap-1 ml-1">
                      <button
                        onClick={() => moveExercise(idx, -1)}
                        disabled={idx === 0}
                        className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1.5 py-1 rounded-lg hover:bg-slate-800/60"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveExercise(idx, 1)}
                        disabled={idx === exercises.length - 1}
                        className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-30 px-1.5 py-1 rounded-lg hover:bg-slate-800/60"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Sets</div>
                  <div className="grid gap-2">
                    {ex.sets.map((s, setIdx) => (
                      <div
                        key={setIdx}
                        className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-1.5 bg-slate-950/50 rounded-xl px-2 py-1.5"
                      >
                        <div className="text-[11px] font-bold text-slate-500 w-6 text-center">{setIdx + 1}</div>
                        <input
                          type="number"
                          value={s.weight || ""}
                          onChange={(e) => updateSet(idx, setIdx, { weight: Number(e.target.value) || 0 })}
                          placeholder="Lbs"
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm font-semibold text-center"
                        />
                        <input
                          type="number"
                          value={s.reps || ""}
                          onChange={(e) => updateSet(idx, setIdx, { reps: Number(e.target.value) || 0 })}
                          placeholder="Reps"
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm font-semibold text-center"
                        />
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
            {exercises.length === 0 && (
              <div className="text-xs text-slate-600 text-center py-2">
                Add exercises from the library below.
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="font-semibold text-sm text-slate-400">Exercise Library</h3>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Choose Body Part</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedMuscle(null)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                    selectedMuscle === null
                      ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  All
                </button>
                {muscleFilters.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => setSelectedMuscle(selectedMuscle === name ? null : name)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                      selectedMuscle === name
                        ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                        : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {name} <span className="text-slate-600">({count})</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Equipment</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedEquipment(null)}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                    selectedEquipment === null
                      ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  All
                </button>
                {equipmentFilters.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => setSelectedEquipment(selectedEquipment === name ? null : name)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                      selectedEquipment === name
                        ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                        : "border-slate-700 bg-slate-900 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {name} <span className="text-slate-600">({count})</span>
                  </button>
                ))}
              </div>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm"
            />
            {loadingLibrary && <div className="text-xs text-slate-500">Searching...</div>}
            {!loadingLibrary && search.trim().length >= 2 && results.length === 0 && (
              <div className="text-xs text-slate-500">No matches. Try adjusting your filters or search term.</div>
            )}
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
              {results.map((ex) => (
                <div className="flex items-center gap-2" key={ex.id}>
                  <div
                    onClick={() => {
                      const url = ex.gif_url || ex.image_url;
                      if (url) openPreview(url);
                    }}
                    className="shrink-0"
                  >
                    {ex.gif_url ? (
                      <img
                        src={ex.gif_url}
                        alt={ex.name}
                        className="h-12 w-12 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0"
                        loading="lazy"
                      />
                    ) : ex.image_url ? (
                      <img
                        src={ex.image_url}
                        alt={ex.name}
                        className="h-12 w-12 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl border border-slate-800 bg-slate-900 shrink-0 flex items-center justify-center text-xs font-semibold text-slate-300">
                        {ex.name.trim()[0] ? ex.name.trim()[0].toUpperCase() : "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{ex.name}</div>
                    <div className="text-xs text-slate-400 space-x-2">
                      {ex.muscle_group ? <span>{toTitle(ex.muscle_group)}</span> : null}
                      {ex.equipment ? <span>· {toTitle(ex.equipment)}</span> : null}
                      <span>· {ex.default_rest_seconds}s rest</span>
                    </div>
                  </div>
                  <button
                    onClick={() => addFromLibrary(ex)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              clearDraft();
              if (typeof onCancel === "function") {
                onCancel();
              } else {
                onBack();
              }
            }}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold py-3 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 text-sm transition-colors disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save Routine"}
          </button>
        </>
      )}
    </div>
  );
}
