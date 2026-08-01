import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { api } from "../api";
import type { BodyWeightLog } from "../types";
import { formatWeight, getUnitsPreference, weightInputPlaceholder } from "../utils/units";

type WidgetState = {
  logs: BodyWeightLog[];
};

const STORAGE_KEY = "smartlift.bodyWeight";

function loadState(): WidgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { logs: [] };
    return JSON.parse(raw) as WidgetState;
  } catch {
    return { logs: [] };
  }
}

function saveState(state: WidgetState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function filterBodyWeight(logs: { logged_at: string; weight_lbs: number }[], timeframe: "week" | "3m" | "6m" | "1y" | "5y" | "all") {
  if (timeframe === "all") return logs;
  const ms: Record<string, number> = {
    week: 7 * 24 * 60 * 60 * 1000,
    "3m": 90 * 24 * 60 * 60 * 1000,
    "6m": 180 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
    "5y": 1825 * 24 * 60 * 60 * 1000,
  };
  const cutoff = Date.now() - (ms[timeframe] ?? Infinity);
  return logs.filter((l) => new Date(l.logged_at).getTime() >= cutoff);
}

export default function BodyWeightWidget({ timeframe }: { timeframe: "week" | "3m" | "6m" | "1y" | "5y" | "all" }) {
  const [logs, setLogs] = useState<BodyWeightLog[]>(() => loadState().logs);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const units = getUnitsPreference();

  useEffect(() => {
    saveState({ logs });
  }, [logs]);

  const addLog = async () => {
    const raw = parseFloat(input);
    if (Number.isNaN(raw) || raw <= 0) return;
    const lbs = units === "imperial" ? raw : raw * 2.20462;
    setSaving(true);
    try {
      const created: BodyWeightLog = await api.createBodyWeightLog({ weight_lbs: lbs });
      setLogs((prev) => [...prev, created].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()));
      setInput("");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => filterBodyWeight(logs, timeframe), [logs, timeframe]);
  const latest = filtered[filtered.length - 1];
  const chartData = filtered.map((l) => ({
    date: l.logged_at,
    weight: l.weight_lbs,
    short: new Date(l.logged_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
  }));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Body Weight</div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold">{latest ? formatWeight(latest.weight_lbs, units) : "--"}</span>
      </div>

      {chartData.length > 1 ? (
        <div className="h-40 w-full mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(99,102,241)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="rgb(99,102,241)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis
                dataKey="short"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => formatWeight(v, units)}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Area type="monotone" dataKey="weight" stroke="rgb(99,102,241)" strokeWidth={2} fill="url(#bodyFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-xs text-slate-600 text-center py-4 mb-3">No body weight logs yet</div>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={weightInputPlaceholder(units)}
          className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={addLog}
          disabled={saving}
          className="rounded-xl border border-indigo-800 bg-indigo-950/60 px-4 py-2 text-xs font-semibold text-indigo-200 hover:border-indigo-500/60 transition-colors disabled:opacity-60"
        >
          {saving ? "..." : "Log"}
        </button>
      </div>
    </div>
  );
}
