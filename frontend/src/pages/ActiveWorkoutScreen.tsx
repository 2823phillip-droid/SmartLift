import { useEffect, useState, useRef, useMemo } from "react";
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
import { api } from "../api";
import type { ExerciseEntry, SetLog, WorkoutTemplate, SetSuggestion } from "../types";
import { computePrescription, type Prescription, type SetRecord, type CoachState, computeCoachState } from "../rules";

export default function ActiveWorkoutScreen({
  sessionId,
  templateId,
  workoutMode,
  onEnd,
}: {
  sessionId: number;
  templateId: number;
  workoutMode?: "manual" | "ai_trainer";
  onEnd?: (summary?: {
    exerciseOrder: number[];
    setsTargetChanges: Record<number, number>;
    restOverrides: Record<number, number>;
    weightChanges: Record<number, number>;
    repsChanges: Record<number, number>;
    orderChanged: boolean;
  }) => void;
}) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [globalRest, setGlobalRest] = useState(90);
  const [exerciseRestOverrides, setExerciseRestOverrides] = useState<Record<number, number>>({});
  const [exerciseRestEditing, setExerciseRestEditing] = useState<Record<number, boolean>>({});
  const [exerciseRestDraft, setExerciseRestDraft] = useState<Record<number, string>>({});
  const [workoutStart, setWorkoutStart] = useState<Date | null>(null);
  const [workoutElapsed, setWorkoutElapsed] = useState(0);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);

  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [draftWeight, setDraftWeight] = useState("");
  const [draftReps, setDraftReps] = useState("");
  const [draftEffort, setDraftEffort] = useState(3);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [addSetExerciseId, setAddSetExerciseId] = useState<number | null>(null);
  const [displaySetsTarget, setDisplaySetsTarget] = useState<Record<number, number>>({});
  const [lastSetByExercise, setLastSetByExercise] = useState<Record<number, {weight: number; reps: number} | null>>({});
  const [lastSessionByExercise, setLastSessionByExercise] = useState<Record<number, {set_index: number; actual_weight: number; actual_reps: number}[]>>({});
  const [originalExercises, setOriginalExercises] = useState<ExerciseEntry[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [coachPhase, setCoachPhase] = useState<string>("linear");
  const [coachWeek, setCoachWeek] = useState<number>(1);

  const restTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  const buildRuleHistoryForCoach = (): SetRecord[] => {
    const history: SetRecord[] = [];
    const names = Array.from(new Set(exercises.map((e) => e.name)));

    for (const name of names) {
      const ex = exercises.find((e) => e.name === name)!;
      const lastSession = lastSessionByExercise[ex.id] || [];
      for (const s of lastSession) {
        history.push({
          actual_weight: s.actual_weight,
          actual_reps: s.actual_reps,
          effort: 3,
          completed_at: new Date(Date.now() - 86400000).toISOString(),
        });
      }
      const currentLogs = logs.filter((l) => {
        const entry = exercises.find((e) => e.id === l.exercise_entry_id);
        return Boolean(entry && entry.name === name);
      });
      for (const l of currentLogs) {
        history.push({
          actual_weight: Number(l.actual_weight || 0),
          actual_reps: Number(l.actual_reps || 0),
          effort: l.effort ?? 3,
          completed_at: new Date().toISOString(),
        });
      }
    }
    return history;
  };

  const buildRuleHistory = (exercise: ExerciseEntry): SetRecord[] => {
    const history: SetRecord[] = [];
    const lastSession = lastSessionByExercise[exercise.id] || [];
    for (const s of lastSession) {
      history.push({
        actual_weight: s.actual_weight,
        actual_reps: s.actual_reps,
        effort: 3,
        completed_at: new Date(Date.now() - 86400000).toISOString(),
      });
    }
    const currentLogs = logs.filter((l) => l.exercise_entry_id === exercise.id);
    for (const l of currentLogs) {
      history.push({
        actual_weight: Number(l.actual_weight || 0),
        actual_reps: Number(l.actual_reps || 0),
        effort: l.effort ?? 3,
        completed_at: new Date().toISOString(),
      });
    }
    return history;
  };

  const buildRuleHistoryForCoach = (): SetRecord[] => {
    const history: SetRecord[] = [];
    const names = Array.from(new Set(exercises.map((e) => e.name)));

    for (const name of names) {
      const ex = exercises.find((e) => e.name === name)!;
      const lastSession = lastSessionByExercise[ex.id] || [];
      for (const s of lastSession) {
        history.push({
          actual_weight: s.actual_weight,
          actual_reps: s.actual_reps,
          effort: 3,
          completed_at: new Date(Date.now() - 86400000).toISOString(),
        });
      }
      const currentLogs = logs.filter((l) => {
        const entry = exercises.find((e) => e.id === l.exercise_entry_id);
        return Boolean(entry && entry.name === name);
      });
      for (const l of currentLogs) {
        history.push({
          actual_weight: Number(l.actual_weight || 0),
          actual_reps: Number(l.actual_reps || 0),
          effort: l.effort ?? 3,
          completed_at: new Date().toISOString(),
        });
      }
    }
    return history;
  };

  const suggestions = useMemo(() => {
    const history = buildRuleHistoryForCoach();
    const coach = computeCoachState({
      history,
      current_phase: coachPhase as any,
      current_week_in_block: coachWeek,
      default_progression: "linear",
      periodization_cycle_weeks: 4,
    });

    const map: Record<number, Prescription> = {};
    for (const exercise of exercises) {
      const exHistory = buildRuleHistory(exercise);
      map[exercise.id] = computePrescription({
        start_weight: exercise.start_weight,
        reps_target: exercise.reps_target,
        sets_target: displaySetsTarget[exercise.id] ?? exercise.sets_target,
        rest_seconds: exercise.rest_seconds,
        progression_type: coach.phase,
        history: exHistory,
      });
    }
    return { prescriptions: map, coach };
  }, [exercises, logs, lastSessionByExercise, displaySetsTarget, coachPhase, coachWeek]);

  const coach = suggestions.coach;
  const prescriptions = suggestions.prescriptions;

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
      setOriginalExercises(exercisesData);

      // auto-expand first incomplete exercise
      if (exercisesData.length) {
        const incomplete = exercisesData.find((e: ExerciseEntry) =>
          setLogsData.filter((l: SetLog) => l.exercise_entry_id === e.id).length < e.sets_target
        );
        if (incomplete) setExpandedExerciseId(incomplete.id);
        else if (exercisesData.length) setExpandedExerciseId(exercisesData[0].id);
      }
      // fetch last logged weight/reps per exercise name across history
      const uniqueNames = Array.from(new Set(exercisesData.map((e: ExerciseEntry) => e.name))) as string[];
      const historyResults = await Promise.allSettled(
        uniqueNames.map((name: string) => api.getExerciseNameProgress(name))
      );
      const resolved: Record<number, {weight: number; reps: number} | null> = {};
      for (const exercise of exercisesData) {
        const idx = uniqueNames.indexOf(exercise.name);
        const result = idx >= 0 ? historyResults[idx] : undefined;
        if (result && result.status === "fulfilled") {
          const data = result.value as any;
          if (!data.seeded && data.points && data.points.length > 0) {
            const last = data.points[data.points.length - 1];
            resolved[exercise.id] = { weight: last.weight, reps: last.reps };
          } else {
            resolved[exercise.id] = null;
          }
        } else {
          resolved[exercise.id] = null;
        }
      }
      setLastSetByExercise(resolved);
      if ((workoutMode || "manual") === "manual") {
        const lastSessionResults = await Promise.allSettled(
          uniqueNames.map((name: string) => api.getExerciseNameLastSession(name))
        );
        const sessionResolved: Record<number, {set_index: number; actual_weight: number; actual_reps: number}[]> = {};
        for (const exercise of exercisesData) {
          const idx = uniqueNames.indexOf(exercise.name);
          const result = idx >= 0 ? lastSessionResults[idx] : undefined;
          if (result && result.status === "fulfilled") {
            const data = result.value as any;
            const logs = Array.isArray(data?.logs) ? data.logs : [];
            if (logs.length > 0) sessionResolved[exercise.id] = logs.map((l: any) => ({ set_index: Number(l.set_index), actual_weight: Number(l.actual_weight || 0), actual_reps: Number(l.actual_reps || 0) }));
            else sessionResolved[exercise.id] = [];
          } else {
            sessionResolved[exercise.id] = [];
          }
        }
        setLastSessionByExercise(sessionResolved);
      } else {
        setLastSessionByExercise({});
      }
    });
  }, [sessionId, templateId]);

  useEffect(() => {
    if (!workoutStart) return;
    let lastElapsed = 0;
    const tick = () => {
      const direct = Math.floor((Date.now() - workoutStart.getTime()) / 1000);
      if (direct > 0) {
        lastElapsed = direct;
        setWorkoutElapsed(direct);
      } else {
        lastElapsed += 1;
        setWorkoutElapsed(lastElapsed);
      }
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
          current_exercise_name: getCurrentExercise()?.name || "",
          last_set_effort: lastLog.effort,
        })
        .then(() => {
          // suggestions shown per-exercise in UI
        });
    }
  }, [logs.length]);

  const getCurrentExercise = (): ExerciseEntry | undefined => {
    return exercises.find((e) => e.id === expandedExerciseId);
  };

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

  const exerciseCompletedCount = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const log of logs) {
      counts[log.exercise_entry_id] = (counts[log.exercise_entry_id] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart() {
    setIsDragActive(true);
    setExpandedExerciseId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setIsDragActive(false);
    if (!over || active.id === over.id) return;
    setExercises((prev) => {
      const activeIndex = prev.findIndex((e) => e.id === active.id);
      const overIndex = prev.findIndex((e) => e.id === over.id);
      return arrayMove(prev, activeIndex, overIndex);
    });
  }

  function handleDragCancel() {
    setIsDragActive(false);
  }

  const resolveDisplayTarget = (exercise: ExerciseEntry): number => {
    return displaySetsTarget[exercise.id] ?? exercise.sets_target;
  };

  const allDone = useMemo(() => {
    return exercises.length > 0 && exercises.every(e => (exerciseCompletedCount[e.id] || 0) >= resolveDisplayTarget(e));
  }, [exercises, exerciseCompletedCount, displaySetsTarget]);

  const resolveRest = (): number => {
    const currentExercise = getCurrentExercise();
    if (currentExercise && exerciseRestOverrides[currentExercise.id] !== undefined) {
      return exerciseRestOverrides[currentExercise.id];
    }
    if (currentExercise && currentExercise.rest_seconds) {
      return currentExercise.rest_seconds;
    }
    return globalRest || 90;
  };

  const currentRest = resolveRest();

  const clearRestTimer = () => {
    if (restTimerRef.current) {
      window.clearInterval(restTimerRef.current);
      restTimerRef.current = null;
    }
  };

  const startRest = (seconds: number) => {
    clearRestTimer();
    setRestSeconds(seconds);
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

  const expandExercise = (exercise: ExerciseEntry) => {
    setExpandedExerciseId(exercise.id);
    setAddSetExerciseId(null);
    const completedCount = exerciseCompletedCount[exercise.id] || 0;
    if ((workoutMode || "manual") === "manual") {
      const sessionLogs = lastSessionByExercise[exercise.id] || [];
      const match = sessionLogs.find((l) => l.set_index === completedCount + 1);
      if (match) {
        setDraftWeight(String(match.actual_weight));
        setDraftReps(String(match.actual_reps));
        setDraftEffort(3);
        setNotes("");
        setShowNotes(false);
        return;
      }
    }
    const history = lastSetByExercise[exercise.id];
    setDraftWeight(history ? String(history.weight) : "0");
    setDraftReps(history ? String(history.reps) : "0");
    setDraftEffort(3);
    setNotes("");
    setShowNotes(false);
  };

  const toggleExerciseRestEdit = (exercise: ExerciseEntry, enabled: boolean) => {
    if (enabled) {
      setExerciseRestEditing((prev) => ({ ...prev, [exercise.id]: true }));
      setExerciseRestDraft((prev) => ({
        ...prev,
        [exercise.id]: String(exerciseRestOverrides[exercise.id] ?? exercise.rest_seconds),
      }));
    } else {
      setExerciseRestEditing((prev) => {
        const next = { ...prev };
        delete next[exercise.id];
        return next;
      });
      setExerciseRestDraft((prev) => {
        const next = { ...prev };
        delete next[exercise.id];
        return next;
      });
    }
  };

  const commitExerciseRest = (exercise: ExerciseEntry, value: string) => {
    const val = parseInt(value, 10);
    if (!Number.isNaN(val) && val >= 0) {
      setExerciseRestOverrides((prev) => ({ ...prev, [exercise.id]: val }));
    }
  };

  const logSet = async (): Promise<boolean> => {
    const currentExercise = getCurrentExercise();
    if (!currentExercise || !draftWeight || !draftReps) return false;
    const w = parseFloat(draftWeight);
    const r = parseInt(draftReps, 10);
    const suggestions = parseSetSuggestions(currentExercise);
    const existing = logs.filter((l: SetLog) => l.exercise_entry_id === currentExercise.id).length;
    const setIndex = existing + 1;
    const sugg = suggestions[setIndex - 1];
    const isExtraSet = addSetExerciseId === currentExercise.id;

    try {
      const log = await api.createSetLog({
        session_id: sessionId,
        exercise_entry_id: currentExercise.id,
        set_index: setIndex,
        suggested_weight: sugg?.weight ?? currentExercise.start_weight,
        suggested_reps: sugg?.reps ?? currentExercise.reps_target,
        actual_weight: w,
        actual_reps: r,
        effort: draftEffort,
        notes: notes || undefined,
      });
      setLogs((l) => [...l, log]);

      await api.createCoachMessage({
        session_id: sessionId,
        role: "in_workout",
        content:
          draftEffort <= 2
            ? `Set ${setIndex} done at ${w}x${r}, effort ${draftEffort}. We'll push a bit harder next set.`
            : draftEffort >= 4
            ? `Set ${setIndex} done at ${w}x${r}, effort ${draftEffort}. Great work.`
            : `Set ${setIndex} done at ${w}x${r}, effort ${draftEffort}. Solid.`,
      });
    } catch (err) {
      console.error("Failed to log set", err);
      return false;
    }

    const rest = currentRest;

    if (isExtraSet) {
      setAddSetExerciseId(null);
      setNotes("");
      setShowNotes(false);
      const history = lastSetByExercise[currentExercise.id];
      setDraftWeight(history ? String(history.weight) : "0");
      setDraftReps(history ? String(history.reps) : "0");
      if (rest > 0) startRest(rest);
      return false;
    }

    const displayTarget = resolveDisplayTarget(currentExercise);
    const currentExerciseCompleted = (exerciseCompletedCount[currentExercise.id] || 0) + 1;
    const exerciseIsDone = currentExerciseCompleted >= displayTarget;
    const workoutIsDone = allDone || exercises.every(e => (exerciseCompletedCount[e.id] || 0) + (e.id === currentExercise.id ? 1 : 0) >= resolveDisplayTarget(e));

    if (workoutIsDone) {
      await endWorkout(1);
      return true;
    }

    if (exerciseIsDone) {
      setNotes("");
      setShowNotes(false);
      const next = exercises.find((e: ExerciseEntry) => e.id !== currentExercise.id && (exerciseCompletedCount[e.id] || 0) < resolveDisplayTarget(e));
      if (next) {
        expandExercise(next);
        if (rest > 0) startRest(rest);
      }
      return true;
    }

    setNotes("");
    setShowNotes(false);
    if (!exerciseIsDone && !workoutIsDone) {
      const history = lastSetByExercise[currentExercise.id];
      setDraftWeight(history ? String(history.weight) : "0");
      setDraftReps(history ? String(history.reps) : "0");
    }
    if (rest > 0) {
      startRest(rest);
    }
    return false;
  };

  const nextSetDuringRest = (): { name: string; set: number; weight: number | string; reps: number | string } | null => {
    if (!restSeconds || restSeconds <= 0) return null;
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return null;
    const existing = logs.filter(l => l.exercise_entry_id === currentExercise.id).length;
    const nextSetIndex = existing + 1;

    if (nextSetIndex <= resolveDisplayTarget(currentExercise)) {
      const suggestions = parseSetSuggestions(currentExercise);
      const sugg = suggestions[nextSetIndex - 1];
      return {
        name: currentExercise.name,
        set: nextSetIndex,
        weight: sugg?.weight ?? currentExercise.start_weight,
        reps: sugg?.reps ?? currentExercise.reps_target,
      };
    }

    const nextExercise = exercises.find(e => e.id !== currentExercise.id && (exerciseCompletedCount[e.id] || 0) < resolveDisplayTarget(e));
    if (nextExercise) {
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

  const buildEndSummary = (): any => {
    const setsTargetChanges: Record<number, number> = {};
    for (const ex of exercises) {
      const original = originalExercises.find((o) => o.id === ex.id);
      const current = displaySetsTarget[ex.id] ?? ex.sets_target;
      if (original && current !== original.sets_target) {
        setsTargetChanges[ex.id] = current;
      }
    }
    const restOverrides: Record<number, number> = {};
    for (const [id, val] of Object.entries(exerciseRestOverrides)) {
      const exId = Number(id);
      const original = originalExercises.find((o) => o.id === exId);
      if (original && val !== original.rest_seconds) {
        restOverrides[exId] = val;
      }
    }
    const weightChanges: Record<number, number> = {};
    const repsChanges: Record<number, number> = {};
    for (const ex of exercises) {
      const original = originalExercises.find((o) => o.id === ex.id);
      if (!original) continue;
      const logsForEx = logs
        .filter((l) => l.exercise_entry_id === ex.id)
        .sort((a, b) => a.set_index - b.set_index);
      const last = logsForEx[logsForEx.length - 1];
      if (last && last.actual_weight != null && last.actual_weight !== original.start_weight) {
        weightChanges[ex.id] = last.actual_weight;
      }
      if (last && last.actual_reps != null && last.actual_reps !== original.reps_target) {
        repsChanges[ex.id] = last.actual_reps;
      }
    }
    const orderChanged = JSON.stringify(originalExercises.map((e) => e.id)) !== JSON.stringify(exercises.map((e) => e.id));
    return {
      exerciseOrder: exercises.map((e) => e.id),
      setsTargetChanges,
      restOverrides,
      weightChanges,
      repsChanges,
      orderChanged,
    };
  };

  const endWorkout = async (extraSets = 0) => {
    clearRestTimer();
    await api.endSession(sessionId);
    const totalSets = logs.length + extraSets;
    await api.createCoachMessage({
      session_id: sessionId,
      role: "post_workout",
      content: `Workout complete. ${totalSets} total sets logged. Great session.`,
    });
    onEnd?.(buildEndSummary());
  };

  const finishWorkout = async () => {
    await endWorkout(0);
  };

  const formatElapsed = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isResting = restSeconds !== null && restSeconds > 0;
  const canLog = Boolean(draftWeight) && Boolean(draftReps);

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{template?.name || "Workout"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {exercises.length} exercises · {logs.length} sets logged
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-center min-w-[70px]">
              <div className="text-base font-bold text-emerald-300 tabular-nums leading-none">{formatElapsed(workoutElapsed)}</div>
              <div className="text-[10px] text-emerald-200 uppercase tracking-wide mt-1">Elapsed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Coach panel */}
      {coach && (
        <div className={`rounded-2xl border p-4 space-y-2 ${
          coach.is_deload
            ? "border-amber-800/80 bg-amber-950/40"
            : "border-indigo-800/60 bg-indigo-950/30"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Coach — {coach.is_deload ? "Deload" : "Current Phase"}</div>
              <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">
                Week {coach.week_in_block} / {coach.block_duration_weeks}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 px-2 py-1 text-center min-w-[80px]">
              <div className={`text-xs font-bold ${coach.is_deload ? "text-amber-300" : "text-indigo-300"}`}>
                {coach.transition_in_weeks <= 1 && !coach.is_deload ? "Almost done" : `${coach.transition_in_weeks} weeks left`}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{coach.explanation}</p>
        </div>
      )}

      {/* Rest overlay */}
      {isResting && (
        <div className="rounded-2xl border border-amber-800 bg-amber-950/50 p-5 space-y-3">
          <div className="text-center">
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

      {/* Exercise layers */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={exercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {exercises.map((exercise) => {
              const completed = exerciseCompletedCount[exercise.id] || 0;
              const displayTarget = resolveDisplayTarget(exercise);
              const isExpanded = exercise.id === expandedExerciseId;
              const exerciseLogs = logs.filter(l => l.exercise_entry_id === exercise.id);
              const isComplete = completed >= displayTarget;
              const editingRest = !!exerciseRestEditing[exercise.id];
              const addingSet = addSetExerciseId === exercise.id;

              return (
                <SortableExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  exerciseLogs={exerciseLogs}
                  completed={completed}
                  displayTarget={displayTarget}
                  isExpanded={isExpanded}
                  isComplete={isComplete}
                  editingRest={editingRest}
                  addingSet={addingSet}
                  isDragActive={isDragActive}
                  isResting={isResting}
                  onExpand={() => !isResting && expandExercise(exercise)}
                  onAddSet={() => {
                    setDisplaySetsTarget((prev) => ({
                      ...prev,
                      [exercise.id]: (prev[exercise.id] ?? exercise.sets_target) + 1,
                    }));
                    expandExercise(exercise);
                    setAddSetExerciseId(exercise.id);
                  }}
                  onCancelAddSet={() => setAddSetExerciseId(null)}
                  onToggleRestEdit={() => toggleExerciseRestEdit(exercise, !editingRest)}
                  editingRestValue={exerciseRestDraft[exercise.id] ?? String(exercise.rest_seconds)}
                  onRestChange={(val) => {
                    setExerciseRestDraft((prev) => ({ ...prev, [exercise.id]: val }));
                    commitExerciseRest(exercise, val);
                  }}
                  draftWeight={draftWeight}
                  draftReps={draftReps}
                  draftEffort={draftEffort}
                  onDraftWeightChange={setDraftWeight}
                  onDraftRepsChange={setDraftReps}
                  onDraftEffortChange={setDraftEffort}
                  showNotes={showNotes}
                  notes={notes}
                  onToggleNotes={() => setShowNotes((v) => !v)}
                  onNotesChange={setNotes}
                  canLog={canLog}
                  onLogSet={() => logSet()}
                  suggestion={prescriptions[exercise.id]}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Completion */}
      {allDone && (
        <button
          onClick={finishWorkout}
          className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30"
        >
          Finish Workout
        </button>
      )}
    </div>
  )
}

function SortableExerciseCard({
  exercise,
  exerciseLogs,
  completed,
  displayTarget,
  isExpanded,
  isComplete,
  editingRest,
  addingSet,
  isDragActive,
  isResting,
  onExpand,
  onAddSet,
  onCancelAddSet,
  onToggleRestEdit,
  editingRestValue,
  onRestChange,
  draftWeight,
  draftReps,
  draftEffort,
  onDraftWeightChange,
  onDraftRepsChange,
  onDraftEffortChange,
  showNotes,
  notes,
  onToggleNotes,
  onNotesChange,
  canLog,
  onLogSet,
  suggestion,
}: {
  exercise: ExerciseEntry;
  exerciseLogs: SetLog[];
  completed: number;
  displayTarget: number;
  isExpanded: boolean;
  isComplete: boolean;
  editingRest: boolean;
  addingSet: boolean;
  isDragActive: boolean;
  isResting: boolean;
  onExpand: () => void;
  onAddSet: () => void;
  onCancelAddSet: () => void;
  onToggleRestEdit: () => void;
  editingRestValue: string;
  onRestChange: (val: string) => void;
  draftWeight: string;
  draftReps: string;
  draftEffort: number;
  onDraftWeightChange: (val: string) => void;
  onDraftRepsChange: (val: string) => void;
  onDraftEffortChange: (val: number) => void;
  showNotes: boolean;
  notes: string;
  onToggleNotes: () => void;
  onNotesChange: (val: string) => void;
  canLog: boolean;
  onLogSet: () => Promise<boolean>;
  suggestion?: Prescription;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });
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
        {isDragActive ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200 truncate">{exercise.name}</div>
              {isComplete && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-700/50 rounded-full px-2 py-0.5">
                  Done
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl border transition-all ${
              isExpanded
                ? "border-indigo-800 bg-slate-900/80 shadow-lg shadow-indigo-950/20"
                : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
            }`}
          >
            <button
              onClick={onExpand}
              disabled={isResting}
              className="w-full flex items-center justify-between px-3 py-2 text-left disabled:opacity-60"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">{exercise.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {completed}/{displayTarget} sets · {exercise.start_weight} lbs × {exercise.reps_target} reps target
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {isComplete && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-700/50 rounded-full px-1.5 py-0.5">
                    Done
                  </span>
                )}
                {!isResting && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSet();
                    }}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:border-slate-600"
                  >
                    Add Set
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={editingRestValue}
                    disabled={!editingRest}
                    onChange={(e) => onRestChange(e.target.value)}
                    className={`w-12 rounded-md border px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors ${
                      editingRest
                        ? "border-indigo-500 bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-400"
                        : "border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed"
                    }`}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRestEdit();
                    }}
                    className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
                      editingRest ? "border-indigo-500 bg-indigo-600 justify-end" : "border-slate-700 bg-slate-800 justify-start"
                    }`}
                    title={editingRest ? "Disable rest override" : "Enable rest override"}
                  >
                    <div className="h-3 w-3 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {exerciseLogs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Completed Sets</div>
                    {exerciseLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between rounded-xl bg-slate-950/50 border border-slate-800 px-2.5 py-1.5">
                        <span className="text-xs text-slate-500 font-semibold">Set {log.set_index}</span>
                        <span className="text-xs text-slate-300 font-semibold">{log.actual_weight} lbs × {log.actual_reps} reps</span>
                      </div>
                    ))}
                  </div>
                )}

                {suggestion && (
                  <div className="rounded-xl border border-indigo-800 bg-indigo-950/30 px-3 py-2">
                    <div className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">Rule Suggestion</div>
                    <div className="text-sm font-semibold text-slate-200 mt-0.5">
                      {suggestion.next_weight} lbs × {suggestion.next_reps} reps · {suggestion.next_sets} sets
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{suggestion.coaching_message}</div>
                  </div>
                )}

                {(!isComplete || addingSet) && !isResting && (
                  <>
                    {addingSet && (
                      <button
                        onClick={onCancelAddSet}
                        className="text-xs text-slate-400 hover:text-slate-300 transition-colors mb-1"
                      >
                        ← Cancel
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number"
                          value={draftWeight}
                          onChange={(e) => onDraftWeightChange(e.target.value)}
                          placeholder={`${exercise.start_weight}`}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-center text-xl font-bold tabular-nums focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                        />
                        <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Weight</div>
                      </div>
                      <div>
                        <input
                          type="number"
                          value={draftReps}
                          onChange={(e) => onDraftRepsChange(e.target.value)}
                          placeholder={`${exercise.reps_target}`}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-center text-xl font-bold tabular-nums focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                        />
                        <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Reps</div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Effort {draftEffort}/5</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => onDraftEffortChange(n)}
                            className={`py-2.5 text-sm font-bold rounded-xl border transition-all ${
                              draftEffort === n
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/20 scale-[1.02]"
                                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <button
                        onClick={onToggleNotes}
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
                          onChange={(e) => onNotesChange(e.target.value)}
                          placeholder="Any thoughts on this set?"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                          rows={2}
                        />
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        await onLogSet();
                      }}
                      disabled={!canLog}
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-base font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      Complete Set
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
