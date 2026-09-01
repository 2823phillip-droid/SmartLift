import { useMemo, useState, useEffect } from "react";
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
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { GripVertical } from "lucide-react";
import { api, withRetry } from "../api";
import type { ExerciseNameProgressResponse } from "../types";
import ProgressWidget from "../components/ProgressWidget";
import BodyWeightWidget from "../components/BodyWeightWidget";
import { formatWeight, getUnitsPreference } from "../utils/units";

const WIDGETS_KEY = "askeo.widgets";

function loadWidgets(): Widget[] {
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Widget[];
  } catch {
    return [];
  }
}

function saveWidgets(next: Widget[]) {
  try {
    localStorage.setItem(WIDGETS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

type Timeframe = "week" | "3m" | "6m" | "1y" | "5y" | "all";

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "3m", label: "3 Months" },
  { key: "6m", label: "6 Months" },
  { key: "1y", label: "1 Year" },
  { key: "5y", label: "5 Years" },
  { key: "all", label: "All" },
];

const TIMEFRAME_MS: Record<Timeframe, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  "5y": 1825 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

function fmtShortDate(iso: string) {
  const d = new Date(iso);
  if (d.getFullYear() === new Date().getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function filterPoints(points: { date: string; weight: number; reps: number }[], timeframe: Timeframe) {
  if (timeframe === "all") return points;
  const cutoff = Date.now() - TIMEFRAME_MS[timeframe];
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

export type Widget = {
  name: string;
  points: { date: string; weight: number; reps: number }[];
  seeded?: boolean;
};

export default function HomeScreen() {
  const [widgets, setWidgets] = useState<Widget[]>(loadWidgets);
  const [allExercises, setAllExercises] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [addingName, setAddingName] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [streak, setStreak] = useState<number | null>(null);
  const [totalVolume, setTotalVolume] = useState<number | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [deloadMode, setDeloadMode] = useState<string | null>(null);

  const filteredWidgets = useMemo(
    () => widgets.map((w) => ({ ...w, points: filterPoints(w.points, timeframe) })),
    [widgets, timeframe]
  );

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  const refreshWidgets = async (names: string[]) => {
    setWidgetRefreshRunning(true);
    const results = await Promise.all(
      names.map((name) =>
        withRetry(() => api.getExerciseNameProgress(name), { retries: 3, baseDelayMs: 500 }).catch(
          (err) => {
            setLastError(`Widget refresh failed for ${name}: ${(err as Error)?.message || String(err)}`.slice(0, 200));
            return null;
          }
        )
      )
    );
    setWidgets((prev) =>
      prev.map((w, idx) => {
        const fresh = results[idx];
        if (!fresh || fresh.points.length === 0) return w;
        return { name: fresh.name, points: fresh.points, seeded: fresh.seeded };
      })
    );
    setWidgetRefreshRunning(false);
  };

  useEffect(() => {
    const names = widgets.map((w) => w.name);
    if (names.length > 0) {
      refreshWidgets(names);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    Promise.all([
      withRetry(() => api.getTotalVolume(), { retries: 3, baseDelayMs: 500 }),
      withRetry(() => api.getStreak(), { retries: 3, baseDelayMs: 500 }),
      withRetry(() => api.getCoachState(), { retries: 3, baseDelayMs: 500 }),
    ]).then(([vol, s, coach]) => {
      if (cancelled) return;
      setTotalVolume((vol as any)?.total_volume ?? null);
      setStreak((s as any)?.streak ?? null);
      setLoadPct((coach as any)?.coach_load_pct ?? null);
      setDeloadMode((coach as any)?.coach_deload_mode ?? null);
      setStatsLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setStatsLoading(false);
      const msg = (err as Error)?.message || String(err);
      if (!/load failed|network error|cors|failed to fetch|AUTH_TIMEOUT/i.test(msg)) {
        setLastError(msg.slice(0, 300));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const addedNames = useMemo(() => new Set(widgets.map((w) => w.name)), [widgets]);

  const loadProgress = async (name: string): Promise<Widget | null> => {
    setAddingName(name);
    try {
      const resp: ExerciseNameProgressResponse = await api.getExerciseNameProgress(name);
      if (resp.points.length === 0) return null;
      return { name: resp.name, points: resp.points, seeded: resp.seeded };
    } catch (e) {
      setLastError(String(e).slice(0, 160));
      return null;
    } finally {
      setAddingName(null);
    }
  };

  const addWidget = async (name: string) => {
    const w = await loadProgress(name);
    if (!w) return;
    setWidgets((prev) => [...prev, w]);
    setOpen(false);
  };

  const removeWidget = (name: string) => setWidgets((prev) => prev.filter((w) => w.name !== name));

  const activeIds = useMemo(() => new Set(filteredWidgets.map((w) => w.name)), [filteredWidgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [isDragActive, setIsDragActive] = useState(false);
  const [widgetRefreshRunning, setWidgetRefreshRunning] = useState(false);

  function handleDragStart() {
    setIsDragActive(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setIsDragActive(false);
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const visible = prev.filter((w) => activeIds.has(w.name));
      const hidden = prev.filter((w) => !activeIds.has(w.name));
      const newVisible = arrayMove(visible, visible.findIndex((w) => w.name === active.id), visible.findIndex((w) => w.name === over.id));
      return [...newVisible, ...hidden];
    });
  }

  function handleDragCancel() {
    setIsDragActive(false);
  }

  const sortableItems = useMemo(() => filteredWidgets.map((w) => w.name), [filteredWidgets]);

  // Load all distinct exercise names once for the picker
  const loadPicker = async () => {
    setLastError(null);
    try {
      const items: string[] = await api.getExerciseNames();
      setAllExercises(items);
      setOpen(true);
    } catch (e) {
      setLastError(String(e).slice(0, 160));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-indigo-800/60 bg-gradient-to-br from-indigo-950 to-slate-950 p-6 relative overflow-hidden">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400 mb-2">Askeo</div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">Your lift, upgraded.</h2>
        <p className="text-slate-400 text-sm">Track progress at a glance. Add widgets below.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Streak</div>
          <div className="text-xl font-bold">{streak !== null ? `${streak} day${streak === 1 ? '' : 's'}` : (statsLoading ? '...' : '--')}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Total volume</div>
          <div className="text-xl font-bold">{totalVolume !== null ? formatWeight(totalVolume, getUnitsPreference()) : (statsLoading ? '...' : '--')}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Load</div>
          <div className="text-xl font-bold">{loadPct !== null ? `${loadPct}%` : (statsLoading ? '...' : '--')}</div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (loadPct ?? 0) >= 100
                  ? "bg-amber-400"
                  : (loadPct ?? 0) >= 70
                  ? "bg-orange-400"
                  : "bg-indigo-400"
              }`}
              style={{ width: `${Math.min(100, loadPct ?? 0)}%` }}
            />
          </div>
              {deloadMode && (
                <div className="text-[10px] text-slate-500 mt-1.5">
                  Deload: {deloadMode === "ai_driven" ? "AI Driven" : "Calendar"}
                </div>
              )}
        </div>
      </div>

      {lastError && !statsLoading && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-300">
          STATS_DIAG: {lastError}
        </div>
      )}

      <BodyWeightWidget timeframe={timeframe} />

      <div className="flex flex-wrap gap-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTimeframe(t.key)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              timeframe === t.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Widgets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold px-1">Goals</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshWidgets(widgets.map((w) => w.name))}
              disabled={widgetRefreshRunning || widgets.length === 0}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-slate-200 transition-colors disabled:opacity-60"
            >
              {widgetRefreshRunning ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={loadPicker}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-800 bg-indigo-950/40 text-indigo-200 hover:border-indigo-500/60 transition-colors"
            >
              + Add Widget
            </button>
          </div>
        </div>

        {widgets.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-500 space-y-1">
            <div className="text-slate-400 font-semibold">Widget debug</div>
            {widgets.map((w) => (
              <div key={w.name} className="flex items-center justify-between">
                <span className="text-slate-300 truncate mr-2">{w.name}</span>
                <span className="text-slate-500">{w.points.length} point{w.points.length === 1 ? '' : 's'}{w.points[0] ? ` · ${fmtShortDate(w.points[0].date)} → ${fmtShortDate(w.points[w.points.length - 1].date)}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {widgets.length === 0 && !open && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-6 text-center">
            <div className="text-xs text-slate-600">Tap "+ Add Widget" to track an exercise.</div>
            <div className="text-[11px] text-slate-700 mt-1">Bench Press, Squat, Deadlift, etc.</div>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 gap-3">
              {filteredWidgets.map((w) => (
                <SortableWidget key={w.name} id={w.name} widget={w} onRemove={() => removeWidget(w.name)} isCompact={isDragActive} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Picker bottom sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg rounded-t-3xl border-t border-x border-slate-800 bg-slate-950 p-5 max-h-[80vh] flex flex-col">
            <div className="text-sm font-semibold mb-3">Pick an exercise</div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {allExercises.map((name) => {
                const canAdd = !addedNames.has(name);
                const loading = addingName === name;
                return (
                  <button
                    key={name}
                    disabled={!canAdd}
                    onClick={() => addWidget(name)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                      canAdd ? "border-slate-800 bg-slate-900/50 hover:border-indigo-500/60" : "border-slate-900 bg-slate-900/30 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{name}</div>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {!canAdd ? "Added" : loading ? "Loading..." : "Add"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setOpen(false)} className="mt-4 w-full rounded-xl border border-slate-800 py-3 text-sm text-slate-400 hover:text-slate-200 transition-colors">Close</button>
            {lastError && <div className="mt-2 text-xs text-rose-400">{lastError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableWidget({ id, widget, onRemove, isCompact }: { id: string; widget: Widget; onRemove: () => void; isCompact?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 1 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...listeners}
        {...attributes}
        className="absolute left-2 top-2 z-10 flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 px-1.5 py-1 text-slate-600 active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <div className="pl-8">
        {isCompact ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold px-1">{widget.name}</div>
          </div>
        ) : (
          <ProgressWidget widget={widget} onRemove={onRemove} units={getUnitsPreference()} />
        )}
      </div>
    </div>
  );
}
