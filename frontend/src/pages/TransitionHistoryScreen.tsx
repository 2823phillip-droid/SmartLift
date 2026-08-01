import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { api, withRetry, type ProgressionTransition } from "../api";

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalizePhase(phase: string) {
  return phase
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TransitionHistoryScreen({ onBack }: { onBack: () => void }) {
  const [transitions, setTransitions] = useState<ProgressionTransition[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    withRetry(
      () =>
        Promise.all([
          api.listProgressionTransitions(),
          api.getAllExercises().catch(() => []),
        ]),
      { retries: 2, baseDelayMs: 300 }
    )
      .then(([transitionsData, exercises]: any[]) => {
        if (cancelled) return;
        setTransitions(transitionsData || []);
        const map: Record<number, string> = {};
        (exercises || []).forEach((ex: any) => {
          map[ex.id] = ex.name || `Exercise ${ex.id}`;
        });
        setExerciseNames(map);
      })
      .catch((err: any) => {
        if (!cancelled) {
          const msg = err?.message || "Failed to load transition history.";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Progression Transitions</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      <p className="text-slate-400 text-sm">
        Track how your exercises move through AI-driven progression phases over time.
      </p>

      {loading && (
        <div className="text-center text-xs text-slate-500 py-8">Loading transition history...</div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && transitions.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-8 text-center">
          <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No transitions recorded yet.</p>
          <p className="text-xs text-slate-600 mt-1">
            Transitions appear as your exercises move through different progression phases.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {transitions.map((t) => {
          const exerciseName = exerciseNames[t.exercise_entry_id] || `Exercise #${t.exercise_entry_id}`;
          return (
            <div
              key={t.id}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-200 truncate">
                    {exerciseName}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 uppercase tracking-wide">
                      {capitalizePhase(t.from_phase)}
                    </span>
                    <span className="text-xs text-slate-500">→</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-900/60 text-indigo-200 uppercase tracking-wide">
                      {capitalizePhase(t.to_phase)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                    Week {t.week_in_block}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">
                    {formatDate(t.created_at)}
                  </div>
                </div>
              </div>

              {t.reason && (
                <div className="mt-3 pt-3 border-t border-slate-800/60">
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">Reason: </span>
                    {t.reason}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
