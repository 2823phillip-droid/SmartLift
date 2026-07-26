import { useEffect, useState, useMemo } from "react";
import { api, type SessionHistory, type SetLogUpdate, type SetLog } from "../api";

type SessionDetail = {
  session: SessionHistory;
  logs: SetLog[];
  messages: any[];
};

type Timeframe = "week" | "3m" | "6m" | "1y" | "5y" | "all";

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
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

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function inTimeFrame(iso?: string, timeframe: Timeframe = "all") {
  if (!iso || timeframe === "all") return true;
  const cutoff = Date.now() - TIMEFRAME_MS[timeframe];
  return new Date(iso).getTime() >= cutoff;
}

export default function HistoryScreen({
  onBack,
  viewMode: initialViewMode = "by_workout",
}: {
  onBack: () => void;
  viewMode?: "by_workout" | "by_date" | "by_exercise";
}) {
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, SessionDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [exerciseMap, setExerciseMap] = useState<Record<number, string>>({});

  const [selectedWorkout, setSelectedWorkout] = useState<string>("all");
  const [selectedExercise, setSelectedExercise] = useState<string>("all");

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [bulkTimeframe, setBulkTimeframe] = useState<Timeframe | null>(null);
  const [editingLog, setEditingLog] = useState<{ sessionId: number; log: SetLog } | null>(null);

  useEffect(() => {
    (async () => {
      const [s, t] = await Promise.all([
        api.getSessions(),
        api.getTemplatesAcrossAll().catch(() => [] as any[]),
      ]);
      setSessions(s as SessionHistory[]);
      const map: Record<string, string> = {};
      (t as any[]).forEach((tpl: any) => {
        map[`${tpl.id}`] = tpl.name || `Template ${tpl.id}`;
      });
      setTemplates(map);
    })();
  }, []);

  useEffect(() => {
    api
      .getAllExercises()
      .then((items: any[]) => {
        const map: Record<number, string> = {};
        items.forEach((e) => {
          map[e.id] = e.name || `Exercise ${e.id}`;
        });
        setExerciseMap(map);
      })
      .catch(() => {});
  }, []);

  const loadDetail = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) {
      setLoadingDetails(true);
      const [logs, messages] = await Promise.all([
        api.getSessionSetLogs(id),
        api.getCoachMessages(id),
      ]);
      const session = sessions.find((s) => s.id === id)!;
      setDetails((d) => ({ ...d, [id]: { session, logs, messages } }));
      setLoadingDetails(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    await api.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setDetails((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDeleteTarget(null);
    setExpandedId(null);
  };

  const handleDeleteSetLog = async (sessionId: number, logId: number) => {
    await api.deleteSetLog(sessionId, logId);
    setDetails((prev) => {
      const detail = prev[sessionId];
      if (!detail) return prev;
      return {
        ...prev,
        [sessionId]: {
          ...detail,
          logs: detail.logs.filter((log) => log.id !== logId),
        },
      };
    });
    setEditingLog(null);
  };

  const handleSaveSetLog = async (sessionId: number, log: SetLog, data: SetLogUpdate) => {
    const updated = await api.updateSetLog(sessionId, log.id, data);
    setDetails((prev) => {
      const detail = prev[sessionId];
      if (!detail) return prev;
      return {
        ...prev,
        [sessionId]: {
          ...detail,
          logs: detail.logs.map((l) => (l.id === log.id ? (updated as SetLog) : l)),
        },
      };
    });
    setEditingLog(null);
  };

  const handleBulkDelete = async () => {
    if (!bulkTimeframe) return;
    for (const id of sessions.filter((s) => inTimeFrame(s.started_at, bulkTimeframe)).map((s) => s.id)) {
      await api.deleteSession(id);
    }
    setSessions((prev) => prev.filter((s) => !inTimeFrame(s.started_at, bulkTimeframe)));
    setDetails((prev) => {
      const next = { ...prev };
      sessions
        .filter((s) => inTimeFrame(s.started_at, bulkTimeframe))
        .forEach((s) => delete next[s.id]);
      return next;
    });
    setExpandedId(null);
    setBulkTimeframe(null);
  };

  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (timeframe !== "all") {
      const cutoff = Date.now() - TIMEFRAME_MS[timeframe];
      list = list.filter((s) => new Date(s.started_at).getTime() >= cutoff);
    }
    if (selectedWorkout !== "all") {
      list = list.filter((s) => {
        const name = s.template_name || templates[s.id] || `Session ${s.id}`;
        return name === selectedWorkout;
      });
    }
    if (selectedExercise !== "all") {
      list = list.filter((s) => {
        const detail = details[s.id];
        if (!detail?.logs?.length) return false;
        return detail.logs.some(
          (log) => (exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`) === selectedExercise
        );
      });
    }
    return list;
  }, [sessions, timeframe, selectedWorkout, selectedExercise, templates, details, exerciseMap]);

  const uniqueWorkouts = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.template_name) set.add(s.template_name);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const uniqueExercises = useMemo(() => {
    const set = new Set<string>();
    Object.values(exerciseMap).forEach((n) => set.add(n));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [exerciseMap]);

  const groupedByDate = useMemo(() => {
    const acc: Record<string, SessionHistory[]> = {};
    for (const s of filteredSessions) {
      const key = formatDateOnly(s.started_at);
      acc[key] = acc[key] || [];
      acc[key].push(s);
    }
    return Object.entries(acc)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([date, group]) => ({ date, group }));
  }, [filteredSessions]);

  const groupedByWorkout = useMemo(() => {
    const acc: Record<string, SessionHistory[]> = {};
    for (const s of filteredSessions) {
      const name = s.template_name || templates[s.id] || `Session ${s.id}`;
      acc[name] = acc[name] || [];
      acc[name].push(s);
    }
    return Object.entries(acc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, group]) => ({ name, group: group.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) }));
  }, [filteredSessions, templates]);

  const groupedByExercise = useMemo(() => {
    const map = new Map<
      string,
      { session: SessionHistory; date: string; weight: number; reps: number }[]
    >();
    for (const s of filteredSessions) {
      const detail = details[s.id];
      if (!detail?.logs?.length) continue;
      const date = formatDateOnly(s.started_at);
      for (const log of detail.logs) {
        const name = exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`;
        const arr = map.get(name) || [];
        arr.push({
          session: s,
          date,
          weight: log.actual_weight || 0,
          reps: log.actual_reps || 0,
        });
        map.set(name, arr);
      }
    }
    return [...map.entries()]
      .map(([name, entries]) => ({
        name,
        entries: entries.sort((a, b) => new Date(a.session.started_at).getTime() - new Date(b.session.started_at).getTime()),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredSessions, details, exerciseMap]);

  const renderSubfilters = () => (
    <div className="flex flex-wrap gap-2">
      {viewMode === "by_workout" && (
        <select
          value={selectedWorkout}
          onChange={(e) => setSelectedWorkout(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
        >
          <option value="all">All workouts</option>
          {uniqueWorkouts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      {viewMode === "by_exercise" && (
        <select
          value={selectedExercise}
          onChange={(e) => setSelectedExercise(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
        >
          <option value="all">All exercises</option>
          {uniqueExercises.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const renderBulkDelete = () => (
    <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4 space-y-3">
      <div className="text-xs font-semibold text-red-300 uppercase tracking-wider">
        Bulk delete history
      </div>
      <div className="text-xs text-slate-400">Delete all sessions older than a cutoff.</div>
      <div className="flex flex-wrap gap-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setBulkTimeframe(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              bulkTimeframe === t.key
                ? "bg-red-600 text-white"
                : "border border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/40"
            }`}
          >
            Older than {t.label}
          </button>
        ))}
      </div>
      {bulkTimeframe && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-red-200">
            Delete all sessions older than <span className="font-semibold">{bulkTimeframe}</span>?
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setBulkTimeframe(null)}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const sessionTitle = (s: SessionHistory) => {
    if (viewMode === "by_workout") {
      return s.template_name || templates[s.id] || `Session #${s.id}`;
    }
    if (viewMode === "by_exercise") {
      const detail = details[s.id];
      const names = detail?.logs
        .map((log) => exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`)
        .filter(Boolean);
      const unique = [...new Set(names)];
      if (unique.length === 0) return `Session #${s.id}`;
      if (unique.length === 1) return unique[0]!;
      return `Session #${s.id}`;
    }
    return `Session #${s.id}`;
  };

  const sessionSubtitle = (s: SessionHistory) => {
    const detail = details[s.id];
    if (viewMode === "by_exercise") {
      const names = detail?.logs
        .map((log) => exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`)
        .filter(Boolean);
      const unique = [...new Set(names)].slice(0, 3).join(", ");
      const more = names && names.length ? ` +${names.length}` : "";
      return `${unique}${more}`;
    }
    if (viewMode === "by_workout" && s.context_name) {
      return `${s.context_name} · ${formatDate(s.started_at)}`;
    }
    return formatDate(s.started_at);
  };

  const renderSessionCard = (s: SessionHistory) => {
    const isExpanded = expandedId === s.id;
    const detail = details[s.id];
    const totalVolume = detail?.logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0) ?? null;
    const title = sessionTitle(s);
    const subtitle = sessionSubtitle(s);
    return (
      <div
        key={s.id}
        className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden transition-colors"
      >
        <button
          onClick={() => loadDetail(s.id)}
          className="w-full px-4 py-4 text-left flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{title}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide shrink-0 ${
                  s.ended_at ? "text-emerald-400 bg-emerald-950/40" : "text-amber-400 bg-amber-950/40"
                }`}
              >
                {s.ended_at ? "Done" : "Active"}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              {subtitle}
              {s.ended_at && ` · ${Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min`}
              {totalVolume !== null && ` · ${totalVolume.toFixed(0)} lbs`}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-600 ml-2 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="border-t border-slate-800/80 px-4 py-4 space-y-4">
            {loadingDetails ? (
              <div className="text-sm text-slate-500 text-center py-4">Loading...</div>
            ) : (
              <>
                {detail?.logs && detail.logs.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Sets</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingLog({ sessionId: s.id, log: detail.logs[0]! })}
                          className="text-[10px] text-indigo-300 hover:text-indigo-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: s.id, label: `Session #${s.id}` })}
                          className="text-[10px] text-red-300 hover:text-red-200"
                        >
                          Delete session
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {detail.logs.map((log) => {
                        const exerciseName = exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`;
                        if (editingLog && editingLog.log.id === log.id) {
                          return (
                            <div key={log.id} className="rounded-xl border border-indigo-800/60 bg-indigo-950/20 p-3 space-y-2">
                              <div className="text-xs font-semibold text-indigo-200">{exerciseName} · Edit set</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="text-[10px] text-slate-500">Weight (lbs)</div>
                                  <input
                                    type="number"
                                    defaultValue={log.actual_weight ?? ""}
                                    onChange={(e) =>
                                      ((editingLog as any).log = {
                                        ...editingLog.log,
                                        actual_weight: e.target.value === "" ? null : Number(e.target.value),
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm text-slate-200"
                                  />
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-500">Reps</div>
                                  <input
                                    type="number"
                                    defaultValue={log.actual_reps ?? ""}
                                    onChange={(e) =>
                                      ((editingLog as any).log = {
                                        ...editingLog.log,
                                        actual_reps: e.target.value === "" ? null : Number(e.target.value),
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm text-slate-200"
                                  />
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-500">Effort /5</div>
                                  <input
                                    type="number"
                                    min={1}
                                    max={5}
                                    defaultValue={log.effort ?? ""}
                                    onChange={(e) =>
                                      ((editingLog as any).log = {
                                        ...editingLog.log,
                                        effort: e.target.value === "" ? null : Number(e.target.value),
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm text-slate-200"
                                  />
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-500">Notes</div>
                                  <input
                                    type="text"
                                    defaultValue={log.notes ?? ""}
                                    onChange={(e) =>
                                      ((editingLog as any).log = {
                                        ...editingLog.log,
                                        notes: e.target.value || null,
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-sm text-slate-200"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() =>
                                    handleSaveSetLog(
                                      editingLog.sessionId,
                                      editingLog.log,
                                      {
                                        actual_weight: (editingLog.log as any).actual_weight,
                                        actual_reps: (editingLog.log as any).actual_reps,
                                        effort: (editingLog.log as any).effort,
                                        notes: (editingLog.log as any).notes,
                                      } as SetLogUpdate
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-lg text-[11px] bg-indigo-600 text-white hover:bg-indigo-500"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingLog(null)}
                                  className="px-3 py-1.5 rounded-lg text-[11px] bg-slate-900 border border-slate-800 text-slate-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleDeleteSetLog(editingLog.sessionId, log.id)}
                                  className="px-3 py-1.5 rounded-lg text-[11px] bg-red-900/40 border border-red-900 text-red-200 hover:bg-red-800/40"
                                >
                                  Delete set
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={log.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 flex items-center justify-between"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-500 font-semibold">{exerciseName}</div>
                              <div className="text-xs text-slate-400">
                                Set {log.set_index} · {log.actual_weight ?? "—"} lbs × {log.actual_reps ?? "—"} · E{log.effort ?? "—"}/5
                              </div>
                            </div>
                            <button
                              onClick={() => setEditingLog({ sessionId: s.id, log })}
                              className="text-[10px] text-indigo-300 hover:text-indigo-200 shrink-0 ml-2"
                            >
                              Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detail?.messages && detail.messages.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Coach Notes</div>
                    <div className="space-y-1.5">
                      {detail.messages.map((m: any) => (
                        <div key={m.id} className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 px-3 py-2.5">
                          <p className="text-sm text-indigo-200 leading-relaxed">{m.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!detail?.logs || detail.logs.length === 0) && (
                  <p className="text-sm text-slate-600 text-center py-3">No set data in this session.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Workout History</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      <div className="flex rounded-xl border border-slate-800 overflow-hidden">
        {(["by_workout", "by_date", "by_exercise"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 text-xs font-semibold py-2.5 transition-colors ${
              viewMode === mode ? "bg-indigo-600 text-white" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {mode === "by_workout" && "By workout"}
            {mode === "by_date" && "By date"}
            {mode === "by_exercise" && "By exercise"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTimeframe(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              timeframe === t.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {renderSubfilters()}
      {renderBulkDelete()}

      <div className="space-y-2">
        {viewMode === "by_date" && groupedByDate
          ? groupedByDate.map(({ date, group }) => (
              <div key={date} className="space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{date}</div>
                {group.map((s) => renderSessionCard(s))}
              </div>
            ))
          : viewMode === "by_workout" && groupedByWorkout
            ? groupedByWorkout.map(({ name, group }) => (
                <div key={name} className="space-y-2">
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{name}</div>
                  {group.map((s) => renderSessionCard(s))}
                </div>
              ))
            : viewMode === "by_exercise" && groupedByExercise
              ? groupedByExercise.map(({ name, entries }) => (
                  <div key={name} className="space-y-2">
                    <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{name}</div>
                    {entries.map(({ session, date, weight, reps }) => (
                      <button
                        key={session.id}
                        onClick={() => loadDetail(session.id)}
                        className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-left flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-400">{date}</div>
                          <div className="text-sm font-semibold">
                            {weight} lbs × {reps}
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-slate-600 ml-2 transition-transform ${expandedId === session.id ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                ))
              : sessions.map((s) => renderSessionCard(s))}
        {filteredSessions.length === 0 && (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800">
            <p className="text-sm text-slate-600">No workouts match this filter.</p>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
            <div className="text-sm font-semibold">Delete {deleteTarget.label}?</div>
            <div className="text-xs text-slate-400">This will also remove all sets and coach notes in this session.</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSession(deleteTarget.id)}
                className="flex-1 px-3 py-2 rounded-xl text-xs bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
