import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutSession } from "../types";

export default function HomeScreen({
  onQuickStart,
  onBuildWorkout,
  onHistory,
  onLibrary,
  onSeed,
}: {
  onQuickStart: () => void;
  onBuildWorkout: () => void;
  onHistory: () => void;
  onLibrary: () => void;
  onSeed: () => void;
}) {
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([]);
  const [recentCount, setRecentCount] = useState(0);

  useEffect(() => {
    api.getSessions().then((sessions) => {
      setRecentSessions(sessions.slice(0, 5));
      setRecentCount(sessions.length);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-slate-400 text-sm">Your AI coach is ready. Pick a path.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onQuickStart}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40
                     p-4 text-left transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-800/60 flex items-center justify-center text-emerald-300 group-hover:border-emerald-500/50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-xs text-slate-200">Start a Workout</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Quick start from routines</div>
            </div>
          </div>
        </button>

        <button
          onClick={onBuildWorkout}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40
                     p-4 text-left transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-800/60 flex items-center justify-center text-indigo-300 group-hover:border-indigo-500/50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-xs text-slate-200">Build a Workout</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Manual build</div>
            </div>
          </div>
        </button>
      </div>

      <div className="space-y-3">
        <button
          onClick={onLibrary}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-emerald-500/40
                     p-4 text-left transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-800/60 flex items-center justify-center text-emerald-300 group-hover:border-emerald-500/50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477 4.5 1.253" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Prebuilt Workouts</div>
              <div className="text-xs text-slate-500 mt-0.5">Quick-start from library</div>
            </div>
            <svg className="w-4 h-4 text-slate-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <button
          onClick={onHistory}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-amber-500/40
                     p-4 text-left transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-800/60 flex items-center justify-center text-amber-300 group-hover:border-amber-500/50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Workout History</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {recentCount > 0 ? `${recentCount} session${recentCount !== 1 ? 's' : ''} logged` : "No sessions yet"}
              </div>
            </div>
            <svg className="w-4 h-4 text-slate-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {recentSessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs text-slate-500 uppercase tracking-widest font-semibold px-1">Recent</h3>
          <div className="space-y-2">
            {recentSessions.map((s) => {
              const duration = s.started_at && s.ended_at
                ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                : null;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/30 px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold">Session #{s.id}</div>
                    <div className="text-xs text-slate-500">
                      {s.template_id ? `Template #${s.template_id}` : "No template"}
                      {s.started_at ? ` · ${new Date(s.started_at).toLocaleDateString()}` : ""}
                      {duration !== null && ` · ${duration} min`}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg uppercase tracking-wide ${
                    s.ended_at ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800" : "text-amber-400 bg-amber-950/40 border border-amber-800"
                  }`}>
                    {s.ended_at ? "Done" : "Active"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onSeed}
        className="w-full rounded-xl border border-slate-800 px-4 py-3 text-xs text-slate-500
                   hover:bg-slate-900 hover:text-slate-300 transition-colors"
      >
        Seed Demo Data
      </button>
    </div>
  );
}
