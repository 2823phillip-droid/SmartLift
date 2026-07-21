import { useEffect, useState } from "react";
import { api } from "../api";
import { log } from "../utils/logger";
import type { Context } from "../types";

type Mode = "idle" | "new_template_form" | "select_template" | "workout_actions";

export default function BuildWorkoutScreen({
  onBack,
  onStartWorkout,
  onCreateWorkout,
  onSelectPrebuilt,
  onAskAi,
}: {
  onBack: () => void;
  onStartWorkout: () => void;
  onCreateWorkout?: (contextId: number) => void;
  onSelectPrebuilt?: (contextId?: number) => void;
  onAskAi?: (contextId: number) => void;
}) {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("idle");

  useEffect(() => {
    api
      .getContexts()
      .then(setContexts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const resetAndSetMode = (next: Mode) => {
    setError("");
    setMode(next);
  };

  const createContext = async () => {
    if (!name.trim()) return;
    setError("");
    try {
      const created = await api.createContext({ name, description: desc || undefined });
      setSelectedContextId(created.id);
      setName("");
      setDesc("");
      setMode("workout_actions");
    } catch (err) {
      setError("Failed to create template. Check console / network for details.");
      log.error("create_context_failed", err);
    }
  };

  const selectExisting = (id: number) => {
    setSelectedContextId(id);
    resetAndSetMode("workout_actions");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Build a Workout</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      {mode === "idle" && (
        <div className="space-y-3">
          <button
            onClick={() => resetAndSetMode("new_template_form")}
            className="w-full rounded-2xl border border-indigo-800 bg-indigo-950/40 hover:border-indigo-500/60 px-4 py-4 text-left transition-colors"
          >
            <div className="font-semibold text-sm text-indigo-200">Create New Template</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Set up a new setup, then add workouts.
            </div>
          </button>

          <button
            onClick={() => resetAndSetMode("select_template")}
            className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 px-4 py-4 text-left transition-colors"
          >
            <div className="font-semibold text-sm text-slate-200">Select Template</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Choose an existing setup to add workouts.
            </div>
          </button>
        </div>
      )}

      {mode === "new_template_form" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name: Planet Fitness, YMCA..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm
                         placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Note: Basement setup, no rack..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3.5 text-sm
                         placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            />
            <button
              onClick={createContext}
              disabled={!name.trim()}
              className="w-full rounded-xl bg-indigo-600 px-4 py-4 font-semibold text-sm hover:bg-indigo-500 active:scale-[0.98] transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Add Template
            </button>
            <button
              onClick={() => resetAndSetMode("idle")}
              className="w-full rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300 hover:text-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "select_template" && (
        <div className="space-y-2">
          {loading && <div className="text-xs text-slate-500">Loading templates...</div>}
          {!loading &&
            contexts.map((ctx) => (
              <button
                key={ctx.id}
                onClick={() => selectExisting(ctx.id)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 px-4 py-4 text-left transition-colors"
              >
                <div className="font-semibold text-sm truncate">{ctx.name}</div>
                {ctx.description && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{ctx.description}</div>
                )}
              </button>
            ))}
          <button
            onClick={() => resetAndSetMode("idle")}
            className="w-full rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "workout_actions" && selectedContextId !== null && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold px-1">
            Add workout
          </div>
          <div className="space-y-2">
            <button
              onClick={() => {
                onCreateWorkout?.(selectedContextId);
              }}
              className="w-full rounded-2xl border border-indigo-800 bg-indigo-950/40 hover:border-indigo-500/60 px-4 py-4 text-left transition-colors"
            >
              <div className="font-semibold text-sm text-indigo-200">Create Workout</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Build from scratch with exercises.
              </div>
            </button>

            <button
              onClick={() => onSelectPrebuilt?.(selectedContextId)}
              className="w-full rounded-2xl border border-emerald-800 bg-emerald-950/40 hover:border-emerald-500/60 px-4 py-4 text-left transition-colors"
            >
              <div className="font-semibold text-sm text-emerald-200">
                Select from Prebuilt Workouts
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Import from the built-in library.
              </div>
            </button>

            <button
              onClick={() => onAskAi?.(selectedContextId)}
              className="w-full rounded-2xl border border-amber-800 bg-amber-950/40 hover:border-amber-500/60 px-4 py-4 text-left transition-colors"
            >
              <div className="font-semibold text-sm text-amber-200">
                Ask AI Trainer to help build a workout
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Describe your goal and constraints.
              </div>
            </button>
          </div>
          <button
            onClick={() => resetAndSetMode("idle")}
            className="w-full rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-300 hover:text-slate-100 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {mode === "idle" && onStartWorkout && (
        <button
          onClick={onStartWorkout}
          className="w-full rounded-2xl border border-emerald-800 bg-emerald-950/40 hover:border-emerald-500/60 px-4 py-4 text-sm font-semibold text-emerald-200 hover:text-emerald-100 transition-colors"
        >
          Start a Workout
        </button>
      )}
    </div>
  );
}
