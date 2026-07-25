import { useEffect, useState, useMemo } from "react";
import { api } from "../api";
import type { WorkoutSession, SetLog, CoachMessage } from "../types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type SessionDetail = {
  session: WorkoutSession;
  logs: SetLog[];
  messages: CoachMessage[];
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

function filterPoints(
  points: { date: string; weight: number; reps: number }[],
  timeframe: Timeframe
) {
  if (timeframe === "all") return points;
  const cutoff = Date.now() - TIMEFRAME_MS[timeframe];
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

export default function HistoryScreen({
  onBack,
  viewMode: initialViewMode = "by_workout",
}: {
  onBack: () => void;
  viewMode?: "by_workout" | "by_date" | "by_exercise";
}) {
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, SessionDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [exerciseMap, setExerciseMap] = useState<Record<number, string>>({});

  useEffect(() => {
    api.getSessions().then(setSessions);
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

  const expand = async (id: number) => {
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

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDateOnly = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const groupedSessions =
    viewMode === "by_date"
      ? sessions.reduce<Record<string, WorkoutSession[]>>((acc, s) => {
          const key = formatDateOnly(s.started_at);
          acc[key] = acc[key] || [];
          acc[key].push(s);
          return acc;
        }, {})
      : null;

  const exerciseHistory = useMemo(() => {
    if (viewMode !== "by_exercise") return null;
    const map = new Map<string, { date: string; weight: number; reps: number }[]>();
    for (const session of sessions) {
      const detail = details[session.id];
      if (!detail?.logs?.length) continue;
      const date = formatDateOnly(session.started_at);
      for (const log of detail.logs) {
        const name = exerciseMap[log.exercise_entry_id] || `Exercise ${log.exercise_entry_id}`;
        const arr = map.get(name) || [];
        arr.push({ date, weight: log.actual_weight || 0, reps: log.actual_reps || 0 });
        map.set(name, arr);
      }
    }
    return map;
  }, [viewMode, sessions, details, exerciseMap]);

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

      {viewMode === "by_exercise" && exerciseHistory && (
        <div className="space-y-4">
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

          {[...exerciseHistory.entries()]
            .map(([name, entries]) => ({ name, entries: filterPoints(entries, timeframe) }))
            .filter((entry) => entry.entries.length > 0)
            .sort((a, b) => b.name.localeCompare(a.name))
            .map(({ name, entries }) => {
              const sorted = entries.sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
              );
              const chartData = sorted.map((e) => ({
                date: e.date,
                weight: e.weight,
                reps: e.reps,
                shortDate: new Date(e.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
              }));

              return (
                <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                  <div className="font-semibold text-sm">{name}</div>
                  <div className="text-xs text-slate-400">Weight over time</div>
                  {chartData.length > 1 ? (
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="setFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="rgb(99,102,241)" stopOpacity={0.1} />
                              <stop offset="95%" stopColor="rgb(99,102,241)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                          <XAxis
                            dataKey="shortDate"
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                            tickLine={false}
                            minTickGap={40}
                          />
                          <YAxis
                            tickFormatter={(v: number) => `${Math.round(v)} lbs`}
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                            width={55}
                          />
                          <Tooltip
                            formatter={(value: any) => [`${Math.round(value)} lbs`, "Weight"]}
                            labelFormatter={(label) => {
                              const pt = chartData.find((d) => d.shortDate === label);
                              return pt ? pt.date : label;
                            }}
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "1px solid #1e293b",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                            labelStyle={{ color: "#94a3b8" }}
                            itemStyle={{ color: "#e2e8f0" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="rgb(99,102,241)"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "rgb(99,102,241)" }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : chartData.length === 1 ? (
                    <div className="text-xs text-slate-500 text-center py-3">
                      {chartData[0].shortDate}: {chartData[0].weight} lbs
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 text-center py-3">No data</div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-500 px-1">
                    {sorted.length > 0 && (
                      <span>
                        {new Date(sorted[0].date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    {sorted.length > 1 && (
                      <span>
                        {new Date(sorted[sorted.length - 1].date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <div className="space-y-2">
        {viewMode === "by_date" && groupedSessions
          ? Object.entries(groupedSessions).map(([date, group]) => (
              <div key={date} className="space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{date}</div>
                {group.map((s) => renderSessionCard(s))}
              </div>
            ))
          : sessions.map((s) => renderSessionCard(s))}
        {sessions.length === 0 && (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800">
            <p className="text-sm text-slate-600">No workouts yet. Start one to build your history.</p>
          </div>
        )}
      </div>
    </div>
  );

  function renderSessionCard(s: WorkoutSession) {
    const isExpanded = expandedId === s.id;
    const detail = details[s.id];
    const totalVolume = detail?.logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0) ?? null;
    return (
      <div
        key={s.id}
        className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden transition-colors"
      >
        <button
          onClick={() => expand(s.id)}
          className="w-full px-4 py-4 text-left flex items-center justify-between"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Session #{s.id}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                s.ended_at ? "text-emerald-400 bg-emerald-950/40" : "text-amber-400 bg-amber-950/40"
              }`}>
                {s.ended_at ? "Done" : "Active"}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {formatDate(s.started_at)}
              {s.ended_at && ` · ${Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min`}
              {totalVolume !== null && ` · ${totalVolume.toFixed(0)} lbs`}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-600 ml-2 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
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
                    <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Sets</div>
                    <div className="space-y-1.5">
                      {detail.logs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5 flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-semibold w-10">Set {log.set_index}</span>
                          <span className="text-sm font-semibold">{log.actual_weight} lbs × {log.actual_reps}</span>
                          <span className="text-xs text-slate-500">E{log.effort}/5</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail?.messages && detail.messages.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Coach Notes</div>
                    <div className="space-y-1.5">
                      {detail.messages.map((m) => (
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
  }
}
