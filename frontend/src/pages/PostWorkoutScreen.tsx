import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "../api";
import type { SetLog, WorkoutSession, ExerciseEntry } from "../types";
import { formatWeight, getUnitsPreference, weightInputPlaceholder } from "../utils/units";

export default function PostWorkoutScreen({
  sessionId,
  templateId,
  workoutEndSummary,
  workoutMode,
  onDone,
}: {
  sessionId: number;
  templateId?: number | null;
  workoutEndSummary?: {
    exerciseOrder: number[];
    setsTargetChanges: Record<number, number>;
    restOverrides: Record<number, number>;
    weightChanges: Record<number, number>;
    repsChanges: Record<number, number>;
    orderChanged: boolean;
  } | null;
  workoutMode?: "manual" | "ai_trainer";
  onDone: () => void;
}) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [feedback, setFeedback] = useState("");
  const [coachSent, setCoachSent] = useState(false);
  const [template, setTemplate] = useState<ExerciseEntry[]>([]);
  const [saveTemplateMode, setSaveTemplateMode] = useState<"discard" | "values" | "valuesAndOrder" | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [coachPhase, setCoachPhase] = useState<string | null>(null);
  const [coachWeek, setCoachWeek] = useState<number | null>(null);

  useEffect(() => {
    api.getSession(sessionId).then(setSession);
    api.getSessionSetLogs(sessionId).then(setLogs);
    if (templateId) {
      api.getExercises(templateId).then((exercises) => {
        setTemplate(exercises);
      });
    }
    if (workoutMode === "ai_trainer") {
      api.getCoachState().then((coachState) => {
        if (coachState) {
          if (coachState.coach_phase) setCoachPhase(coachState.coach_phase);
          if (coachState.coach_week_in_block) setCoachWeek(coachState.coach_week_in_block);
        }
      }).catch((err) => {
        console.error("[PostWorkoutScreen] coach state load failed", err);
      });
    }
  }, [sessionId, templateId, workoutMode]);

  const sendToCoach = async () => {
    if (!feedback.trim()) return;
    await api.createCoachMessage({
      session_id: sessionId,
      role: "post_workout",
      content: feedback,
    });
    await api.createCoachMessage({
      session_id: sessionId,
      role: "post_workout",
      content: `Session summary: ${logs.length} sets logged. Volume: ${formatWeight(logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0), getUnitsPreference())}. Feedback: ${feedback}`,
    });
    setCoachSent(true);
  };

  const isManual = workoutMode !== "ai_trainer";

  const adjustmentsSavedRef = useRef(false);

  const buildAITrainerPayload = () => {
    if (!workoutEndSummary || !template.length || isManual || !session || !logs.length) return null;
    const effortAvg = Number((logs.reduce((a, b) => a + (b.effort || 0), 0) / logs.length).toFixed(1));
    const totalVolume = logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0);
    const totalSets = logs.length;
    const adjustments = template.map((ex) => {
      const order = workoutEndSummary.exerciseOrder.indexOf(ex.id);
      return {
        exercise_entry_id: ex.id,
        exercise_name: ex.name,
        proposed_weight: workoutEndSummary.weightChanges[ex.id] ?? ex.start_weight,
        proposed_reps: workoutEndSummary.repsChanges[ex.id] ?? ex.reps_target,
        proposed_sets: workoutEndSummary.setsTargetChanges[ex.id] ?? ex.sets_target,
        proposed_rest_seconds: workoutEndSummary.restOverrides[ex.id] ?? ex.rest_seconds,
        proposed_order: order >= 0 ? order : ex.order,
        effort_avg: effortAvg,
      };
    });
    return {
      session_id: session.id,
      template_id: templateId ?? undefined,
      total_volume: totalVolume,
      total_sets: totalSets,
      effort_avg: effortAvg,
      adjustments,
    };
  };

  useEffect(() => {
    if (adjustmentsSavedRef.current) return;
    if (!isManual && workoutEndSummary && session) {
      adjustmentsSavedRef.current = true;
      const payload = buildAITrainerPayload();
      if (payload) {
        api.saveAITrainerAdjustments(payload).catch(() => {
          adjustmentsSavedRef.current = false;
        });
      }
    }
  }, [isManual, workoutEndSummary, session]);

  const hasTemplateChanges = useMemo(() => {
    if (!workoutEndSummary || !template.length || !isManual) return false;
    if (workoutEndSummary.orderChanged) return true;
    if (Object.keys(workoutEndSummary.setsTargetChanges).length > 0) return true;
    if (Object.keys(workoutEndSummary.restOverrides).length > 0) return true;
    if (Object.keys(workoutEndSummary.weightChanges).length > 0) return true;
    if (Object.keys(workoutEndSummary.repsChanges).length > 0) return true;
    return false;
  }, [workoutEndSummary, template, isManual]);

  const saveTemplate = async (mode: "values" | "valuesAndOrder") => {
    if (!templateId || !workoutEndSummary) return;
    setSavingTemplate(true);
    setSaveError(null);
    try {
      const exerciseOrderMap = new Map(workoutEndSummary.exerciseOrder.map((id, index) => [id, index]));
      const promises = template.map((exercise) => {
        const updates: any = {};
        const newTarget = workoutEndSummary.setsTargetChanges[exercise.id];
        if (newTarget !== undefined && newTarget !== exercise.sets_target) {
          updates.sets_target = newTarget;
        }
        const newRest = workoutEndSummary.restOverrides[exercise.id];
        if (newRest !== undefined && newRest !== exercise.rest_seconds) {
          updates.rest_seconds = newRest;
        }
        const newWeight = workoutEndSummary.weightChanges[exercise.id];
        if (newWeight !== undefined && newWeight !== exercise.start_weight) {
          updates.start_weight = newWeight;
        }
        const newReps = workoutEndSummary.repsChanges[exercise.id];
        if (newReps !== undefined && newReps !== exercise.reps_target) {
          updates.reps_target = newReps;
        }
        if (mode === "valuesAndOrder") {
          updates.order = (exerciseOrderMap.get(exercise.id) ?? exercise.order);
        }
        if (Object.keys(updates).length === 0) return Promise.resolve();
        return api.updateExercise(exercise.id, updates);
      });
      await Promise.all(promises);
      setSaveTemplateMode(mode === "values" ? "values" : "valuesAndOrder");
    } catch (err) {
      setSaveError(String(err).slice(0, 160));
    } finally {
      setSavingTemplate(false);
    }
  };

  const totalVolume = logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0);
  const avgEffort = logs.length ? (logs.reduce((a, b) => a + (b.effort || 0), 0) / logs.length).toFixed(1) : "N/A";

  const durationMinutes = session?.ended_at && session?.started_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  if (!coachSent) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-950/50 border border-indigo-800 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Great Session</h2>
          <p className="text-xs text-slate-500 mt-1">Tell your coach how it felt before viewing your summary.</p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Sets</div>
            <div className="text-xl font-bold">{logs.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Volume</div>
            <div className="text-xl font-bold">{totalVolume.toFixed(0)}</div>
            <div className="text-[10px] text-slate-500">{weightInputPlaceholder(getUnitsPreference())}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Effort</div>
            <div className="text-xl font-bold">{avgEffort}</div>
            <div className="text-[10px] text-slate-500">/ 5</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Time</div>
            <div className="text-xl font-bold">{durationMinutes ?? "—"}</div>
            <div className="text-[10px] text-slate-500">min</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">How did it feel?</label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback for your coach..."
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm resize-none placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            rows={3}
          />
          <button
            onClick={sendToCoach}
            disabled={!feedback.trim()}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            Send to Coach
          </button>
        </div>
      </div>
    );
  }

  if (saveTemplateMode === null && workoutEndSummary && hasTemplateChanges) {
    const highlights = [
      workoutEndSummary.orderChanged ? "Exercise order" : null,
      Object.keys(workoutEndSummary.setsTargetChanges).length > 0 ? "Sets target" : null,
      Object.keys(workoutEndSummary.restOverrides).length > 0 ? "Rest overrides" : null,
      Object.keys(workoutEndSummary.weightChanges).length > 0 ? "Weight" : null,
      Object.keys(workoutEndSummary.repsChanges).length > 0 ? "Reps target" : null,
    ].filter(Boolean) as string[];

    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-950/50 border border-indigo-800 flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Save template?</h2>
          <p className="text-xs text-slate-500 mt-1">
            You changed {highlights.join(", ")} during this workout.
          </p>
        </div>

        <div className="space-y-2">
          {highlights.map((h) => (
            <div key={h} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-sm font-semibold text-slate-200">{h}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setSaveTemplateMode("discard")}
            disabled={savingTemplate}
            className="w-full rounded-2xl border border-slate-700 px-5 py-4 text-base font-semibold text-slate-300 hover:bg-slate-900 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            Don't Save
          </button>
          <button
            onClick={() => saveTemplate("values")}
            disabled={savingTemplate}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-40"
          >
            Update Values
          </button>
          {workoutEndSummary?.orderChanged && (
            <button
              onClick={() => saveTemplate("valuesAndOrder")}
              disabled={savingTemplate}
              className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-40"
            >
              Update Values & Order
            </button>
          )}
          {saveError && <div className="text-xs text-rose-400">{saveError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!isManual && workoutEndSummary && (
        <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-4 space-y-1">
          <div className="text-sm font-semibold text-emerald-300">AI Trainer Adjustments</div>
          <p className="text-xs text-slate-400">
            Your next routine will be updated based on this session’s weights, reps, effort, and progression.
          </p>
        </div>
      )}

      {workoutMode === "ai_trainer" && coachPhase && (
        <div className={`rounded-2xl border p-4 space-y-1 ${coachPhase === "deload" ? "border-amber-800 bg-amber-950/30" : "border-indigo-800 bg-indigo-950/30"}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${coachPhase === "deload" ? "text-amber-400" : "text-indigo-400"}`}>Coach Summary</div>
          <div className="text-sm font-semibold text-slate-200">Phase: {coachPhase}</div>
          {coachWeek !== null && <div className="text-xs text-slate-400">Week {coachWeek} in block</div>}
          <p className="text-xs text-slate-400">Next workout will continue from this phase unless you override it.</p>
        </div>
      )}

      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Workout Summary</h2>
        <p className="text-xs text-slate-500 mt-1">{logs.length} sets · {formatWeight(totalVolume, getUnitsPreference())} total</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sets</h3>
          <span className="text-xs text-slate-500">{logs.length} entries</span>
        </div>
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">Set {log.set_index}</span>
                <span className="text-xs text-slate-500">{log.effort}/5</span>
              </div>
              <div className="text-sm font-semibold mt-0.5">
                {formatWeight(log.actual_weight ?? 0, getUnitsPreference())} × {log.actual_reps} reps
              </div>
              {log.notes && <div className="text-xs text-slate-400 mt-1 italic">"{log.notes}"</div>}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-slate-600 text-center py-6">No sets logged this session.</p>
          )}
        </div>
      </div>

      <button
        onClick={onDone}
        className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30"
      >
        Complete Workout
      </button>

      <button
        onClick={onDone}
        className="w-full rounded-xl border border-slate-700 px-4 py-3.5 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors font-medium"
      >
        Take me to Home Page
      </button>
    </div>
  );
}
