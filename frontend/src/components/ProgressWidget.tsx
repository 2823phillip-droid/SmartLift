import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatWeight, getUnitsPreference, type UnitsPreference } from "../utils/units";

type Widget = {
  name: string;
  points: { date: string; weight: number; reps: number }[];
};

function fmtWeight(v: number, units: UnitsPreference) {
  return formatWeight(v, units);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtShortDate(iso: string) {
  const d = new Date(iso);
  if (d.getFullYear() === new Date().getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatTick(v: number, units: UnitsPreference) {
  return formatWeight(v, units);
}

export default function ProgressWidget({ widget, onRemove, units }: { widget: Widget & { seeded?: boolean }; onRemove: () => void; units?: UnitsPreference }) {
  const visible = widget.points;
  const latest = visible[visible.length - 1];
  const latest2 = visible[visible.length - 2];
  const prevWeight = latest2?.weight;
  const delta = prevWeight !== undefined ? latest?.weight != null ? latest.weight - prevWeight : null : null;
  const showDelta = !widget.seeded && delta !== null && delta !== 0;
  const unitsPref = units ?? getUnitsPreference();

  const chartData = visible.map((p) => ({
    date: p.date,
    weight: p.weight,
    shortDate: fmtShortDate(p.date),
    fullDate: fmtDate(p.date),
  }));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 relative group">
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 text-slate-600 hover:text-slate-300 text-xs px-1.5 py-1 rounded-md hover:bg-slate-800/60 transition-colors"
        aria-label="Remove widget"
      >
        Remove
      </button>
      <div className="pr-10">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Trend</div>
        <div className="text-sm font-semibold text-slate-200 mt-1">{widget.name}</div>
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-xl font-bold">{latest?.weight != null ? fmtWeight(latest.weight, unitsPref) : "--"}</span>
        {showDelta && (
          <span className={`text-xs font-semibold ${delta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {delta > 0 ? "+" : ""}{formatWeight(Math.abs(delta), unitsPref)}
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">
        {visible.length > 1 ? `${visible.length} sessions` : visible.length === 1 ? "1 session" : "No data"}
      </div>

      {chartData.length > 1 ? (
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(99,102,241)" stopOpacity={0.25} />
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
                tickFormatter={(v: number) => formatTick(v, unitsPref)}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(value) => [fmtWeight(Number(value ?? 0), unitsPref), "Weight"]}
                labelFormatter={(label) => {
                  const pt = chartData.find((d) => d.shortDate === label);
                  return pt ? pt.fullDate : label;
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
              <Area
                type="monotone"
                dataKey="weight"
                stroke="rgb(99,102,241)"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-xs text-slate-500 mt-3 text-center">No data</div>
      )}
    </div>
  );
}
