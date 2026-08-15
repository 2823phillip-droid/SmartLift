import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../api";
import { log } from "../utils/logger";
import { toTitle } from "../utils/format";
import type { ExerciseLibraryItem } from "../types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";

type SplitStyle = "full_body" | "upper_lower_split" | "push_pull_legs" | "body_part_split";

interface DraftExercise {
  localId: string;
  id?: number;
  libraryExerciseId?: number;
  name: string;
  sets: { weight: number; reps: number }[];
  rest_seconds: number;
  muscle_group?: string;
  tier?: number;
}

interface DayDraft {
  name: string;
  focus: string;
  exercises: DraftExercise[];
}

type BuilderPhase = "split_selection" | "day_building" | "saving";

const SPLIT_OPTIONS: { value: SplitStyle; label: string; description: string }[] = [
  { value: "full_body", label: "Full Body", description: "Every session hits all major muscle groups" },
  { value: "upper_lower_split", label: "Upper / Lower Split", description: "Alternate between upper and lower body days" },
  { value: "push_pull_legs", label: "Push / Pull / Legs", description: "Three distinct day types rotating through the week" },
  { value: "body_part_split", label: "Body Part Split", description: "One or two muscle groups per day (bro split)" },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function SortableItem({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 1 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={className || ""} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function CustomWorkoutBuilderScreen({
  onBack,
  onSaved,
  initialAnswers,
}: {
  onBack: () => void;
  onSaved?: () => void;
  initialAnswers?: Record<string, any>;
}) {
  const [phase, setPhase] = useState<BuilderPhase>("split_selection");
  const [splitStyle, setSplitStyle] = useState<SplitStyle | null>(null);
  const [days, setDays] = useState<DayDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysPerWeek = useMemo(() => {
    if (!initialAnswers) return 3;
    const raw = initialAnswers.days_per_week;
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return Number.isFinite(n) ? Math.min(6, Math.max(2, n)) : 3;
  }, [initialAnswers]);

  const initializeDays = useCallback(
    (style: SplitStyle) => {
      const newDays: DayDraft[] = [];

      if (style === "full_body") {
        for (let i = 0; i < daysPerWeek; i++) {
          newDays.push({ name: "Full Body", focus: "full_body", exercises: [] });
        }
      } else if (style === "upper_lower_split") {
        // Default: upper first, then alternate
        let upperCount = 0;
        let lowerCount = 0;
        for (let i = 0; i < daysPerWeek; i++) {
          const isUpper = i % 2 === 0;
          if (isUpper) {
            upperCount++;
            newDays.push({ name: `Upper${upperCount > 1 ? ` ${String.fromCharCode(64 + upperCount)}` : ""}`, focus: "upper", exercises: [] });
          } else {
            lowerCount++;
            newDays.push({ name: `Lower${lowerCount > 1 ? ` ${String.fromCharCode(64 + lowerCount)}` : ""}`, focus: "lower", exercises: [] });
          }
        }
      } else if (style === "push_pull_legs") {
        const order = ["push", "pull", "legs"];
        const counts: Record<string, number> = { push: 0, pull: 0, legs: 0 };
        for (let i = 0; i < daysPerWeek; i++) {
          const focus = order[i % 3];
          counts[focus]++;
          const suffix = counts[focus] > 1 ? ` ${String.fromCharCode(64 + counts[focus])}` : "";
          const labels: Record<string, string> = { push: "Push", pull: "Pull", legs: "Legs" };
          newDays.push({ name: `${labels[focus]}${suffix}`, focus, exercises: [] });
        }
      } else if (style === "body_part_split") {
        const order = ["chest", "back", "legs", "shoulders", "arms"];
        const counts: Record<string, number> = {};
        for (let i = 0; i < daysPerWeek; i++) {
          const focus = order[i % 5];
          counts[focus] = (counts[focus] || 0) + 1;
          const suffix = counts[focus] > 1 ? ` ${String.fromCharCode(64 + counts[focus])}` : "";
          const labels: Record<string, string> = { chest: "Chest & Triceps", back: "Back & Biceps", legs: "Legs & Core", shoulders: "Shoulders", arms: "Arms" };
          newDays.push({ name: `${labels[focus]}${suffix}`, focus, exercises: [] });
        }
      }

      setDays(newDays);
      setPhase("day_building");
    },
    [daysPerWeek]
  );

  const [library, setLibrary] = useState<ExerciseLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState<string>("all");
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLibraryLoading(true);
    api
      .searchExerciseLibrary("")
      .then((items: any) => {
        if (!cancelled) setLibrary(items as ExerciseLibraryItem[]);
      })
      .catch((e) => log.error("library_load_failed", e))
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const muscleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const ex of library) {
      const mg = ex.muscle_group || "";
      if (mg) groups.add(mg);
    }
    return Array.from(groups).sort();
  }, [library]);

  const filteredLibrary = useMemo(() => {
    let list = library;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((ex) => ex.name.toLowerCase().includes(q));
    }
    if (filterMuscle !== "all") {
      list = list.filter((ex) => (ex.muscle_group || "") === filterMuscle);
    }
    return list;
  }, [library, searchQuery, filterMuscle]);

  const addExerciseToDay = (dayIndex: number, ex: ExerciseLibraryItem) => {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[dayIndex], exercises: [...next[dayIndex].exercises] };
      day.exercises.push({
        localId: uid(),
        libraryExerciseId: ex.id,
        name: toTitle(ex.name),
        sets: [{ weight: 0, reps: 10 }],
        rest_seconds: 90,
        muscle_group: ex.muscle_group,
      });
      next[dayIndex] = day;
      return next;
    });
  };

  const removeExerciseFromDay = (dayIndex: number, localId: string) => {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[dayIndex], exercises: next[dayIndex].exercises.filter((e) => e.localId !== localId) };
      next[dayIndex] = day;
      return next;
    });
  };

  const updateExercise = (dayIndex: number, localId: string, patch: Partial<DraftExercise>) => {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[dayIndex], exercises: [...next[dayIndex].exercises] };
      day.exercises = day.exercises.map((e) => (e.localId === localId ? { ...e, ...patch } : e));
      next[dayIndex] = day;
      return next;
    });
  };

  const reorderExercise = (dayIndex: number, localId: string, direction: -1 | 1) => {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[dayIndex], exercises: [...next[dayIndex].exercises] };
      const idx = day.exercises.findIndex((e) => e.localId === localId);
      const target = idx + direction;
      if (target < 0 || target >= day.exercises.length) return prev;
      [day.exercises[idx], day.exercises[target]] = [day.exercises[target], day.exercises[idx]];
      next[dayIndex] = day;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Find or create context
      const location = (initialAnswers?.workout_location as string) || "My Workouts";
      let ctx = (await api.getContexts())?.find((c: any) => c.name.toLowerCase() === location.toLowerCase());
      if (!ctx) {
        ctx = await api.createContext({ name: location, order: 0 });
      }

      const savedIds: number[] = [];
      for (const day of days) {
        const tpl = await api.createTemplate({
          name: day.name,
          type: "strength",
          context_id: ctx.id,
          order: savedIds.length,
        });

        for (let idx = 0; idx < day.exercises.length; idx++) {
          const ex = day.exercises[idx];
          if (!ex.name.trim()) continue;
          await api.createExercise({
            template_id: tpl.id,
            name: ex.name,
            exercise_library_id: ex.libraryExerciseId,
            order: idx,
            sets_target: ex.sets.length,
            reps_target: ex.sets[0]?.reps || 10,
            start_weight: ex.sets[0]?.weight || 0,
            rest_seconds: ex.rest_seconds,
            notes: null,
          });
        }
        savedIds.push(tpl.id);
      }

      onSaved?.();
    } catch (err: any) {
      setError(err?.message || "Failed to save workout.");
      log.error("custom_builder_save_failed", err);
    } finally {
      setSaving(false);
    }
  };

  // Split selection phase
  if (phase === "split_selection" || !splitStyle) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Build Your Workout</h2>
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50">
            Back
          </button>
        </div>
        <p className="text-xs text-slate-500">Choose a structure for your week. You'll customize each day next.</p>

        <div className="space-y-2">
          {SPLIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setSplitStyle(opt.value);
                initializeDays(opt.value);
              }}
              className="w-full rounded-2xl border border-indigo-800 bg-indigo-950/40 hover:border-indigo-500/60 px-4 py-4 text-left transition-colors"
            >
              <div className="font-semibold text-sm text-indigo-200">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const activeDay = days[activeDayIndex];
  if (!activeDay) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Build Your Workout</h2>
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50">
            Back
          </button>
        </div>
        <p className="text-sm text-slate-400">No days configured.</p>
      </div>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDays((prev) => {
      const dayIndex = prev.findIndex((d) => d.exercises.some((e) => e.localId === active.id));
      if (dayIndex < 0) return prev;
      const next = [...prev];
      const day = { ...next[dayIndex], exercises: [...next[dayIndex].exercises] };
      const activeIndex = day.exercises.findIndex((e) => e.localId === active.id);
      const overIndex = day.exercises.findIndex((e) => e.localId === over.id);
      day.exercises = arrayMove(day.exercises, activeIndex, overIndex);
      next[dayIndex] = day;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Build Your Workout</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPhase("split_selection");
              setSplitStyle(null);
              setDays([]);
            }}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            Change structure
          </button>
          <button onClick={onBack} className="text-sm text-rose-400 hover:text-rose-300 transition-colors px-2 py-1 rounded-lg hover:bg-rose-950/50">
            Cancel
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day, idx) => (
          <button
            key={day.name + idx}
            onClick={() => setActiveDayIndex(idx)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-colors border ${
              activeDayIndex === idx
                ? "border-indigo-500 bg-indigo-950/60 text-indigo-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {day.name}
            {day.exercises.length > 0 && <span className="ml-1 text-slate-500">({day.exercises.length})</span>}
          </button>
        ))}
      </div>

      {/* Day editor */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 mt-0.5">{days.length} days this week</div>
        </div>

        {/* Exercises for this day */}
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeDay.exercises.map((ex) => ex.localId)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {activeDay.exercises.map((ex, idx) => (
                  <SortableItem key={ex.localId} id={ex.localId} className="relative rounded-xl border border-slate-800 bg-slate-950/60 p-3 pl-8 space-y-2">
                    <div
                      className="absolute left-2 top-2 z-10 flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 px-1.5 py-1 text-slate-600 active:cursor-grabbing"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-200">{ex.name}</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => reorderExercise(activeDayIndex, ex.localId, -1)}
                    disabled={idx === 0}
                    className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 px-1"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => reorderExercise(activeDayIndex, ex.localId, 1)}
                    disabled={idx === activeDay.exercises.length - 1}
                    className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 px-1"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeExerciseFromDay(activeDayIndex, ex.localId)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex gap-2 text-xs text-slate-500">
                <span className="rounded-lg bg-slate-900 px-2 py-1 border border-slate-800">
                  Sets: {ex.sets.length}
                </span>
                <span className="rounded-lg bg-slate-900 px-2 py-1 border border-slate-800">
                  Reps: {ex.sets[0]?.reps || 10}
                </span>
                <span className="rounded-lg bg-slate-900 px-2 py-1 border border-slate-800">
                  Rest: {ex.rest_seconds}s
                </span>
                {ex.tier && (
                  <span className="rounded-lg bg-slate-900 px-2 py-1 border border-slate-800">
                    {ex.tier === 1 ? "Compound" : ex.tier === 2 ? "Accessory" : ex.tier === 3 ? "Isolation" : `Tier ${ex.tier}`}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={ex.sets[0]?.reps || 10}
                  onChange={(e) => {
                    const reps = parseInt(e.target.value, 10) || 10;
                    updateExercise(activeDayIndex, ex.localId, {
                      sets: [{ weight: ex.sets[0]?.weight || 0, reps }],
                    });
                  }}
                  className="w-16 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300 text-center"
                  placeholder="Reps"
                />
                <input
                  type="number"
                  value={ex.rest_seconds}
                  onChange={(e) => updateExercise(activeDayIndex, ex.localId, { rest_seconds: parseInt(e.target.value, 10) || 90 })}
                  className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300 text-center"
                  placeholder="Rest"
                />
              </div>
            </div>
                  </SortableItem>
              </div>
            </SortableContext>
          </DndContext>

          {activeDay.exercises.length === 0 && (
            <div className="text-xs text-slate-600 py-4 text-center">No exercises yet. Search and add from the library below.</div>
          )}
        </div>
      </div>

      {/* Exercise library picker */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Exercise Library</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exercises..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
          />
          <select
            value={filterMuscle}
            onChange={(e) => setFilterMuscle(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="all">All muscles</option>
            {muscleGroups.map((mg) => (
              <option key={mg} value={mg}>
                {mg}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
          {libraryLoading && <div className="text-xs text-slate-500 py-2 text-center">Loading library...</div>}
          {!libraryLoading &&
            filteredLibrary.map((ex) => {
              const alreadyAdded = activeDay.exercises.some((d) => d.libraryExerciseId === ex.id);
              return (
                <button
                  key={ex.id}
                  onClick={() => !alreadyAdded && addExerciseToDay(activeDayIndex, ex)}
                  disabled={alreadyAdded}
                  className={`text-left rounded-xl px-3 py-2.5 transition-colors border text-sm ${
                    alreadyAdded
                      ? "border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed"
                      : "border-slate-800 bg-slate-950/60 hover:border-indigo-500/40 text-slate-300 hover:text-slate-100"
                  }`}
                >
                  <div className="font-medium">{toTitle(ex.name)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {ex.muscle_group} · {ex.equipment || "any"}
                  </div>
                </button>
              );
            })}
          {!libraryLoading && filteredLibrary.length === 0 && (
            <div className="text-xs text-slate-600 py-3 text-center">No exercises found.</div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || days.every((d) => d.exercises.length === 0)}
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3.5 font-semibold text-sm hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? "Saving..." : "Save Workout"}
        </button>
        <button onClick={onBack} className="rounded-xl border border-slate-800 px-4 py-3.5 text-sm text-slate-300 hover:text-slate-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
