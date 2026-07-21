import { useEffect, useState, useRef } from "react";
import { api } from "../api";
import type { ExerciseEntry, SetLog, WorkoutTemplate } from "../types";

type SetSuggestion = { weight: number; reps: number; effort: number };

export default function ActiveWorkoutScreen({
  sessionId,
  templateId,
  onEnd,
}: {
  sessionId: number;
  templateId: number;
  onEnd: () => void;
}) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [globalRest, setGlobalRest] = useState(90);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [actualWeight, setActualWeight] = useState("");
  const [actualReps, setActualReps] = useState("");
  const [effort, setEffort] = useState(3);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [suggestion, setSuggestion] = useState("");
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [timerMode, setTimerMode] = useState<"exercise" | "routine" | "global">("global");
  const [customRest, setCustomRest] = useState("");
  const [workoutStart, setWorkoutStart] = useState<Date | null>(null);
  const [workoutElapsed, setWorkoutElapsed] = useState(0);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const restTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const currentExercise = exercises[currentExerciseIndex];
  const totalSets = currentExercise?.sets_target || 0;

  const parseSetSuggestions = (entry?: ExerciseEntry): SetSuggestion[] => {
    if (!entry?.per_set_data) return [];
    try {
      const parsed = JSON.parse(entry.per_set_data);
      if (Array.isArray(parsed)) return parsed as SetSuggestion[];
    } catch {
      // ignore bad JSON
    }
    return [];
  };

  const setSuggestionFor = (setIndex: number): SetSuggestion | null => {
    const suggestions = parseSetSuggestions(currentExercise);
    const idx = Math.max(0, Math.min(setIndex - 1, suggestions.length - 1));
    return suggestions[idx] || null;
  };

  const resolveRest = (): number => {
    if (timerMode === "routine" && template?.default_rest_seconds && template.default_rest_seconds > 0) {
      return template.default_rest_seconds;
    }
    if (timerMode === "global") return globalRest;
    if (currentExercise?.rest_seconds && currentExercise.rest_seconds > 0) return currentExercise.rest_seconds;
    if (template?.default_rest_seconds && template.default_rest_seconds > 0) return template.default_rest_seconds;
    return globalRest;
  };

  const formattedRest = customRest === "" ? String(resolveRest()) : customRest;
  const effectiveRestForTimer = Number(formattedRest);

  useEffect(() => {
    Promise.all([
      api.getExercises(templateId),
      api.getSessionSetLogs(sessionId),
      api.getSession(sessionId),
      api.getSetting("global_rest_seconds"),
    ]).then(async ([exercisesData, setLogsData, session, setting]) => {
      setExercises(exercisesData);
      setLogs(setLogsData);
      if (setting?.value) {
        setGlobalRest(Number(setting.value));
      }
      if (session?.template_id) {
        const tpl = await api.getTemplate(session.template_id);
        setTemplate(tpl);
      }
      if (session?.started_at) {
        setWorkoutStart(new Date(session.started_at));
      }
    });
  }, [sessionId, templateId]);

  useEffect(() => {
    if (!workoutStart) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - workoutStart.getTime()) / 1000);
      setWorkoutElapsed(elapsed > 0 ? elapsed : 0);
    };
    tick();
    elapsedTimerRef.current = window.setInterval(tick, 1000);
    return () => {
      if (elapsedTimerRef.current) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [workoutStart]);

  useEffect(() => {
    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1];
      api
        .aiNextSuggestion({
          session_id: sessionId,
          context: "",
          current_exercise_name: currentExercise?.name || "",
          last_set_effort: lastLog.effort,
        })
        .then((res) => setSuggestion(res.message));
    }
  }, [logs.length]);

  const clearRestTimer = () => {
    if (restTimerRef.current) {
      window.clearInterval(restTimerRef.current);
      restTimerRef.current = null;
    }
  };

  const logSet = async () => {
    if (!currentExercise || !actualWeight || !actualReps) return;
    const w = parseFloat(actualWeight);
    const r = parseInt(actualReps, 10);
    const setSugg = setSuggestionFor(currentSet);
    const log = await api.createSetLog({
      session_id: sessionId,
      exercise_entry_id: currentExercise.id,
      set_index: currentSet,
      suggested_weight: setSugg?.weight ?? currentExercise.start_weight,
      suggested_reps: setSugg?.reps ?? currentExercise.reps_target,
      actual_weight: w,
      actual_reps: r,
      effort,
      notes: notes || undefined,
    });
    setLogs((l) => [...l, log]);
    setNotes("");
    setShowNotes(false);

    await api.createCoachMessage({
      session_id: sessionId,
      role: "in_workout",
      content:
        effort <= 2
          ? `Set ${currentSet} done at ${w}x${r}, effort ${effort}. We'll push a bit harder next set.`
          : effort >= 4
          ? `Set ${currentSet} done at ${w}x${r}, effort ${effort}. Great work.`
          : `Set ${currentSet} done at ${w}x${r}, effort ${effort}. Solid.`,
    });

    const rest = Number(formattedRest);

    if (currentSet >= totalSets) {
      if (currentExerciseIndex < exercises.length - 1) {
        setCurrentExerciseIndex((i) => i + 1);
        setCurrentSet(1);
        setActualWeight("");
        setActualReps("");
        setEffort(3);
        if (rest > 0) startRest(rest);
      } else {
        await api.endSession(sessionId);
        await api.createCoachMessage({
          session_id: sessionId,
          role: "post_workout",
          content: `Workout complete. ${logs.length + 1} total sets logged. Great session.`,
        });
        onEnd();
      }
    } else {
      setCurrentSet((s) => s + 1);
      setActualWeight("");
      setActualReps("");
      setEffort(3);
      if (rest > 0) startRest(rest);
    }
  };

  const startRest = (seconds: number) => {
    clearRestTimer();
    setRestSeconds(seconds);
    setCustomRest("");
    let remaining = seconds;
    restTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setRestSeconds(remaining);
      if (remaining <= 0) {
        clearRestTimer();
        setRestSeconds(null);
      }
    }, 1000);
  };

  useEffect(() => {
    return clearRestTimer;
  }, []);

  if (!currentExercise) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">Workout Complete</h2>
        <button
          onClick={onEnd}
          className="rounded-2xl bg-emerald-600 px-6 py-4 font-semibold text-base hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-900/30"
        >
          See Summary
        </button>
      </div>
    );
  }

  const currentSetSuggestion = setSuggestionFor(currentSet);

  const formatElapsed = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const canLog = actualWeight && actualReps;
  const isResting = restSeconds !== null && restSeconds > 0;

  const nextSetDuringRest = (): { name: string; set: number; weight: number | string; reps: number | string } | null => {
    if (!isResting) return null;
    // Completed set logic mirrors logSet
    if (currentSet < totalSets) {
      return {
        name: currentExercise.name,
        set: currentSet,
        weight: setSuggestionFor(currentSet)?.weight ?? currentExercise.start_weight,
        reps: setSuggestionFor(currentSet)?.reps ?? currentExercise.reps_target,
      };
    }
    if (currentExerciseIndex < exercises.length - 1) {
      const nextExercise = exercises[currentExerciseIndex + 1];
      return {
        name: nextExercise.name,
        set: 1,
        weight: nextExercise.start_weight,
        reps: nextExercise.reps_target,
      };
    }
    return null;
  };

  const skipRest = () => {
    clearRestTimer();
    setRestSeconds(null);
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{currentExercise.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Set {currentSet} of {totalSets}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-center min-w-[70px]">
              <div className="text-base font-bold text-emerald-300 tabular-nums leading-none">{formatElapsed(workoutElapsed)}</div>
              <div className="text-[10px] text-emerald-200 uppercase tracking-wide mt-1">Elapsed</div>
            </div>
            <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-2 text-center min-w-[70px]">
              <div className="text-base font-bold text-amber-300 tabular-nums leading-none">{effectiveRestForTimer}s</div>
              <div className="text-[10px] text-amber-200 uppercase tracking-wide mt-1">Rest</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/50 rounded-xl p-1.5 border border-slate-800">
          {["exercise", "routine", "global"].map((mode) => (
            <button
              key={mode}
              onClick={() => setTimerMode(mode as typeof timerMode)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all capitalize ${
                timerMode === mode
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {isResting && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-800 bg-amber-950/50 p-6 text-center">
            <div className="text-5xl font-bold text-amber-300 tabular-nums tracking-tight">{restSeconds}</div>
            <div className="text-xs text-amber-200 uppercase tracking-widest mt-2 font-semibold">Rest</div>
          </div>

          {nextSetDuringRest() && (
            <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4">
              <div className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider mb-2">Up Next</div>
              <div className="text-sm font-semibold text-slate-200">{nextSetDuringRest()!.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                Set {nextSetDuringRest()!.set} — {nextSetDuringRest()!.weight} lbs × {nextSetDuringRest()!.reps} reps
              </div>
            </div>
          )}

          <button
            onClick={skipRest}
            className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-5 py-4 text-base font-semibold text-slate-200 hover:bg-slate-700 active:scale-[0.98] transition-all"
          >
            Skip Rest
          </button>
        </div>
      )}

      {suggestion && !isResting && (
        <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Coach</div>
          </div>
          <p className="text-sm text-indigo-200 leading-relaxed">{suggestion}</p>
        </div>
      )}

      {!isResting && (
        <>
          <div className="space-y-3">
            <label className="text-sm font-semibold">This Set</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  value={actualWeight}
                  onChange={(e) => setActualWeight(e.target.value)}
                  placeholder={`Suggested ${currentSetSuggestion?.weight ?? currentExercise.start_weight}`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 text-center text-2xl font-bold tabular-nums
                             focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                />
                <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Weight</div>
              </div>
              <div>
                <input
                  type="number"
                  value={actualReps}
                  onChange={(e) => setActualReps(e.target.value)}
                  placeholder={`Suggested ${currentSetSuggestion?.reps ?? currentExercise.reps_target}`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-4 text-center text-2xl font-bold tabular-nums
                             focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                />
                <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Reps</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Effort</label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setEffort(n)}
                  className={`py-3 text-base font-bold rounded-xl border transition-all ${
                    effort === n
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/20 scale-[1.02] set-active"
                      : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-sm text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 w-fit"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {showNotes ? "Hide Note" : "Add Note"}
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any thoughts on this set?"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                rows={2}
              />
            )}
          </div>

          <button
            onClick={logSet}
            disabled={!canLog}
            className="w-full rounded-2xl bg-emerald-600 px-5 py-4.5 text-base font-semibold
                       hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            Complete Set
          </button>
        </>
      )}
    </div>
  );
}
