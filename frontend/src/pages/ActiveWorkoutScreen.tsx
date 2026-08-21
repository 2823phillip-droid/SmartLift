import { useEffect, useState, useRef, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { api, withRetry } from "../api";
import type { ExerciseEntry, SetLog, WorkoutTemplate, SetSuggestion } from "../types";
import { SortableExerciseCard } from "./SortableExerciseCard";
import { computePrescription, type CoachPhase, type Prescription, type SetRecord, computeCoachState } from "../rules";
import { getUnitsPreference, kgToLbs, lbsToKg } from "../utils/units";

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
  const [draftRir, setDraftRir] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [addSetExerciseId, setAddSetExerciseId] = useState<number | null>(null);
  const [displaySetsTarget, setDisplaySetsTarget] = useState<Record<number, number>>({});
  const [lastSessionByExercise, setLastSessionByExercise] = useState<Record<number, {set_index: number; actual_weight: number; actual_reps: number}[]>>({});
  const [originalExercises, setOriginalExercises] = useState<ExerciseEntry[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [coachPhase, setCoachPhase] = useState<CoachPhase>("linear");
  const [coachWeek, setCoachWeek] = useState<number>(1);
  const [, setCoachLoaded] = useState(false);

  const [backendPrescriptions, setBackendPrescriptions] = useState<Record<number, any>>({});
  const [backendCoach, setBackendCoach] = useState<any>(null);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const restTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  const toLbs = (kg: number): number => (getUnitsPreference() === "imperial" ? Math.round(kgToLbs(kg)) : kg);

  const buildRuleHistoryForCoach = (): SetRecord[] => {
    const history: SetRecord[] = [];
    const names = [...new Set(exercises.map((e) => e.name))];
    for (const name of names) {
      const ex = exercises.find((e) => e.name === name)!;
      const lastSession = lastSessionByExercise[ex.id] || [];
      for (const s of lastSession) {
        history.push({
          actual_weight: toLbs(s.actual_weight),
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
          actual_weight: toLbs(Number(l.actual_weight || 0)),
          actual_reps: Number(l.actual_reps || 0),
          effort: l.effort ?? 3,
          completed_at: new Date().toISOString(),
        });
      }
    }
    return history;
  };

  const buildRuleHistory = (exercise: ExerciseEntry, lastSessionOverride?: Record<number, {set_index: number; actual_weight: number; actual_reps: number}[]>): SetRecord[] => {
    const history: SetRecord[] = [];
    const lastSession = lastSessionOverride ? (lastSessionOverride[exercise.id] || []) : (lastSessionByExercise[exercise.id] || []);
    for (const s of lastSession) {
      history.push({
        actual_weight: toLbs(s.actual_weight),
        actual_reps: s.actual_reps,
        effort: 3,
        completed_at: new Date(Date.now() - 86400000).toISOString(),
      });
    }
    const currentLogs = logs.filter((l) => l.exercise_entry_id === exercise.id);
    for (const l of currentLogs) {
      history.push({
        actual_weight: toLbs(Number(l.actual_weight || 0)),
        actual_reps: Number(l.actual_reps || 0),
        effort: l.effort ?? 3,
        completed_at: new Date().toISOString(),
      });
    }
    return history;
  };

  const lastSessionFetchedRef = useRef(false);

  useEffect(() => {
    if ((workoutMode || "manual") !== "ai_trainer") return;
    if (!lastSessionFetchedRef.current) return;
    if (Object.keys(lastSessionByExercise).length === 0) return;
    let cancelled = false;
    const load = async () => {
      const globalHistory = buildRuleHistoryForCoach();
      const coach = computeCoachState({
        history: globalHistory,
        current_phase: coachPhase,
        current_week_in_block: coachWeek,
        default_progression: "linear",
        periodization_cycle_weeks: 4,
      });
      const map: Record<number, any> = {};
      let lastCoach: any = null;
      for (const exercise of exercises) {
        try {
          const lastSession = lastSessionByExercise[exercise.id] || [];
          const lastWeight = lastSession.length > 0
            ? toLbs(Math.max(...lastSession.map((s: any) => s.actual_weight || 0)))
            : toLbs(exercise.start_weight);
          console.log("[ActiveWorkoutScreen] backend prescription", exercise.id, exercise.name, "lastWeight", lastWeight, "history", lastSession.length);
          const res = await api.nextPrescription({
            start_weight: lastWeight,
            reps_target: exercise.reps_target,
            sets_target: displaySetsTarget[exercise.id] ?? exercise.sets_target,
            rest_seconds: exercise.rest_seconds,
            progression_type: coach.phase,
            history: buildRuleHistory(exercise),
            week: coachWeek,
            current_week_in_block: coachWeek,
            force_deload: coach.is_deload,
            periodization_cycle_weeks: coach.block_duration_weeks,
            exercise_entry_id: exercise.id,
          });
          console.log("[ActiveWorkoutScreen] backend prescription result", exercise.id, res);
          if (!cancelled) {
            map[exercise.id] = res;
            lastCoach = res.coach;
          }
        } catch (err: any) {
          const msg = err?.message || "Backend prescription failed";
          console.error("[ActiveWorkoutScreen] backend prescription failed", err);
          setPrescriptionError(msg);
        }
      }
      if (!cancelled) {
        setBackendPrescriptions(map);
        setBackendCoach(lastCoach);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [exercises, logs, lastSessionByExercise, displaySetsTarget, coachPhase, coachWeek, workoutMode]);

  const localSuggestions = useMemo(() => {
    if ((workoutMode || "manual") !== "ai_trainer") return { prescriptions: {} as Record<number, Prescription>, coach: null as any };
    if (!lastSessionFetchedRef.current) return { prescriptions: {} as Record<number, Prescription>, coach: null as any };
    if (Object.keys(lastSessionByExercise).length === 0) return { prescriptions: {} as Record<number, Prescription>, coach: null as any };
    const history = buildRuleHistoryForCoach();
    console.log("[ActiveWorkoutScreen] localSuggestions history length", history.length, "lastSessionByExercise keys", Object.keys(lastSessionByExercise).length);
    const coach = computeCoachState({
      history,
      current_phase: coachPhase,
      current_week_in_block: coachWeek,
      default_progression: "linear",
      periodization_cycle_weeks: 4,
    });

    const map: Record<number, Prescription> = {};
    for (const exercise of exercises) {
      const lastSession = lastSessionByExercise[exercise.id] || [];
      const lastWeight = lastSession.length > 0
        ? toLbs(Math.max(...lastSession.map((s: any) => s.actual_weight || 0)))
        : toLbs(exercise.start_weight);
      const exHistory = buildRuleHistory(exercise);
      console.log("[ActiveWorkoutScreen] localSuggestions exercise", exercise.id, exercise.name, "lastWeight", lastWeight, "exHistory length", exHistory.length);
      map[exercise.id] = computePrescription({
        start_weight: lastWeight,
        reps_target: exercise.reps_target,
        sets_target: displaySetsTarget[exercise.id] ?? exercise.sets_target,
        rest_seconds: exercise.rest_seconds,
        progression_type: coach.phase,
        history: exHistory,
      });
    }
    return { prescriptions: map, coach };
  }, [exercises, logs, lastSessionByExercise, displaySetsTarget, coachPhase, coachWeek]);

  const useBackend = (workoutMode || "manual") === "ai_trainer";
  const suggestions = useBackend && Object.keys(backendPrescriptions).length > 0
    ? { prescriptions: backendPrescriptions, coach: backendCoach }
    : localSuggestions;
  const coach = suggestions.coach;
  const prescriptions = suggestions.prescriptions;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let coachState: any = null;
      try {
        const [exercisesData, setLogsData, session, setting] = await Promise.all([
          api.getExercises(templateId),
          api.getSessionSetLogs(sessionId),
          api.getSession(sessionId),
          api.getSetting("global_rest_seconds"),
        ]);
        if ((workoutMode || "manual") === "ai_trainer") {
          try {
            coachState = await api.getCoachState();
          } catch (err: any) {
            setPrescriptionError(err?.message || "Failed to load coach state");
          }
        }
        if (cancelled) return;
        setExercises(exercisesData);
        setLogs(setLogsData);
        if (setting?.value) {
          setGlobalRest(Number(setting.value));
        }
        if ((workoutMode || "manual") === "ai_trainer" && coachState) {
          if (coachState.coach_phase) setCoachPhase(coachState.coach_phase);
          if (coachState.coach_week_in_block) setCoachWeek(coachState.coach_week_in_block);
          setCoachLoaded(true);
        }
        if (session?.template_id) {
          const tpl = await api.getTemplate(session.template_id);
          setTemplate(tpl);
        }
        if (session?.started_at) {
          setWorkoutStart(new Date(session.started_at));
        }
        setOriginalExercises(exercisesData);

        const uniqueNames = Array.from(new Set(exercisesData.map((e: ExerciseEntry) => e.name))) as string[];
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
        lastSessionFetchedRef.current = true;
        console.log("[ActiveWorkoutScreen] lastSessionByExercise", sessionResolved);

        // auto-expand first incomplete exercise AFTER last-session data is loaded
        if (exercisesData.length) {
          const target = exercisesData.find((e: ExerciseEntry) =>
            setLogsData.filter((l: SetLog) => l.exercise_entry_id === e.id).length < e.sets_target
          ) || exercisesData[0];
          const completedCount = setLogsData.filter((l: SetLog) => l.exercise_entry_id === target.id).length;
          const sessionLogs = sessionResolved[target.id] || [];
          const match = sessionLogs.find((l: any) => l.set_index === completedCount + 1);
          console.log("[ActiveWorkoutScreen] auto-expand", target.id, target.name, "completedCount", completedCount, "match", match);
          if (match) {
            const displayWeight = getUnitsPreference() === "imperial" ? Math.round(match.actual_weight) : Math.round(match.actual_weight);
            setDraftWeight(String(displayWeight));
            setDraftReps(String(match.actual_reps));
            console.log("[ActiveWorkoutScreen] auto-expand prefilled", displayWeight, "x", match.actual_reps);
          } else {
            const lastSession = sessionResolved[target.id] || [];
            const lastWeight = lastSession.length > 0
              ? Math.max(...lastSession.map((s: any) => s.actual_weight || 0))
              : target.start_weight;
            const displayWeight = getUnitsPreference() === "imperial"
              ? Math.round(lastWeight)
              : Math.round(lastWeight);
            setDraftWeight(String(displayWeight));
            setDraftReps(String(target.reps_target));
            console.log("[ActiveWorkoutScreen] auto-expand default", displayWeight, "x", target.reps_target);
          }
          setDraftEffort(3);
          setNotes("");
          setShowNotes(false);
          setExpandedExerciseId(target.id);
          console.log("[ActiveWorkoutScreen] auto-expand expandedExerciseId", target.id);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[ActiveWorkoutScreen] initial load failed", err);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
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

  const getNextSetTarget = (entry?: ExerciseEntry): { weight: number; reps: number } => {
    if (!entry) return { weight: 0, reps: 0 };
    const lastLog = logs.filter(l => l.exercise_entry_id === entry.id).pop();
    const rawWeight = lastLog ? (lastLog.actual_weight ?? 0) || entry.start_weight : entry.start_weight;
    const units = getUnitsPreference();
    return {
      weight: units === "imperial" ? Math.round(kgToLbs(rawWeight)) : rawWeight,
      reps: entry.reps_target || 10,
    };
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
    const sessionLogs = lastSessionByExercise[exercise.id] || [];
    console.log("[ActiveWorkoutScreen] expandExercise", exercise.id, exercise.name, "completedCount", completedCount, "sessionLogs", sessionLogs);
    const match = sessionLogs.find((l) => l.set_index === completedCount + 1);
    if (match) {
      const displayWeight = getUnitsPreference() === "imperial" ? Math.round(kgToLbs(match.actual_weight)) : Math.round(match.actual_weight);
      setDraftWeight(String(displayWeight));
      setDraftReps(String(match.actual_reps));
      setDraftEffort(3);
      setNotes("");
      setShowNotes(false);
      return;
    }
    const defaultWeight = getUnitsPreference() === "imperial" ? kgToLbs(exercise.start_weight) : exercise.start_weight;
    setDraftWeight(String(Math.round(defaultWeight)));
    setDraftReps(String(exercise.reps_target));
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

  const handleEditSet = async (log: SetLog, field: "actual_weight" | "actual_reps" | "effort", value: number | string) => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    if (field === "actual_weight" && (Number.isNaN(numValue) || numValue < 0)) return;
    if (field === "actual_reps" && (Number.isNaN(numValue) || numValue < 1)) return;
    if (field === "effort" && (Number.isNaN(numValue) || numValue < 1 || numValue > 5)) return;
    await api.updateSetLog(sessionId, log.id, { [field]: numValue });
    setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, [field]: numValue } : l)));
  };

  const handleDeleteSet = async (log: SetLog) => {
    if (!confirm(`Delete Set ${log.set_index} (${(log.actual_weight ?? 0)} × ${log.actual_reps} reps)?`)) return;
    await api.deleteSetLog(sessionId, log.id);
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
  };

  const logSet = async (): Promise<boolean> => {
    if (isLogging) return false;
    const currentExercise = getCurrentExercise();
    if (!currentExercise || !draftWeight || !draftReps) return false;
    setIsLogging(true);
    const w = parseFloat(draftWeight);
    const r = parseInt(draftReps, 10);
    const units = getUnitsPreference();
    const weightKg = units === "imperial" ? lbsToKg(w) : w;
    const suggestions = parseSetSuggestions(currentExercise);
    const existing = logs.filter((l: SetLog) => l.exercise_entry_id === currentExercise.id).length;
    const setIndex = existing + 1;
    const sugg = suggestions[setIndex - 1];
    const isExtraSet = addSetExerciseId === currentExercise.id;
    const nextTarget = getNextSetTarget(currentExercise);

    try {
      const log = await api.createSetLog({
        session_id: sessionId,
        exercise_entry_id: currentExercise.id,
        set_index: setIndex,
        suggested_weight: sugg?.weight ?? nextTarget.weight,
        suggested_reps: sugg?.reps ?? nextTarget.reps,
        actual_weight: weightKg,
        actual_reps: r,
        effort: draftEffort,
        rir: draftRir ?? undefined,
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
      setIsLogging(false);
      return false;
    }

    const rest = currentRest;

    if (isExtraSet) {
      setAddSetExerciseId(null);
      setNotes("");
      setShowNotes(false);
      setDraftWeight(String(w));
      setDraftReps(String(r));
      if (rest > 0) startRest(rest);
      setIsLogging(false);
      return false;
    }

    const displayTarget = resolveDisplayTarget(currentExercise);
    const currentExerciseCompleted = (exerciseCompletedCount[currentExercise.id] || 0) + 1;
    const exerciseIsDone = currentExerciseCompleted >= displayTarget;
    const workoutIsDone = allDone || exercises.every(e => (exerciseCompletedCount[e.id] || 0) + (e.id === currentExercise.id ? 1 : 0) >= resolveDisplayTarget(e));

    if (workoutIsDone) {
      await endWorkout(1);
      setIsLogging(false);
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
      setIsLogging(false);
      return true;
    }

    setNotes("");
    setShowNotes(false);
    if (!exerciseIsDone && !workoutIsDone) {
      setDraftWeight(String(w));
      setDraftReps(String(r));
    }
    if (rest > 0) {
      startRest(rest);
    }
    setIsLogging(false);
    return false;
  };

  const nextSetDuringRest = (): { name: string; set: number; weight: number | string; reps: number | string } | null => {
    if (!restSeconds || restSeconds <= 0) return null;
    const currentExercise = getCurrentExercise();
    if (!currentExercise) return null;
    const existing = logs.filter(l => l.exercise_entry_id === currentExercise.id).length;
    const nextSetIndex = existing + 1;

    if (nextSetIndex <= resolveDisplayTarget(currentExercise)) {
      const target = getNextSetTarget(currentExercise);
      return {
        name: currentExercise.name,
        set: nextSetIndex,
        weight: target.weight,
        reps: target.reps,
      };
    }

    const nextExercise = exercises.find(e => e.id !== currentExercise.id && (exerciseCompletedCount[e.id] || 0) < resolveDisplayTarget(e));
    if (nextExercise) {
      const units = getUnitsPreference();
      return {
        name: nextExercise.name,
        set: 1,
        weight: units === "imperial" ? Math.round(kgToLbs(nextExercise.start_weight)) : nextExercise.start_weight,
        reps: nextExercise.reps_target || 10,
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
    if ((workoutMode || "manual") === "ai_trainer" && coach) {
      try {
        await api.coachOverride({
          phase: coach.phase,
          week_in_block: coach.week_in_block,
          force_deload: coach.is_deload,
          periodization_cycle_weeks: coach.block_duration_weeks,
        });
      } catch (err: any) {
        setPrescriptionError(err?.message || "Failed to save coach state at end of workout");
      }
    }
    onEnd?.(buildEndSummary());
  };

  const finishWorkout = async () => {
    await endWorkout(0);
  };

  const cancelWorkout = async () => {
    if (!sessionId) return;
    try {
      await withRetry(() => api.cancelSession(sessionId), { retries: 3, baseDelayMs: 300 });
      onEnd?.();
    } catch (err) {
      console.error("[ActiveWorkoutScreen] cancel failed", err);
      alert("Could not cancel workout. Please try again.");
    }
  };

  const formatElapsed = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isResting = restSeconds !== null && restSeconds > 0;
  const isTrainer = (workoutMode || "manual") === "ai_trainer";
  const canLog = Boolean(draftWeight) && Boolean(draftReps);

  const persistCoach = async (phase: CoachPhase, week_in_block: number, force_deload = false) => {
    setCoachPhase(phase);
    setCoachWeek(week_in_block);
    try {
      await api.coachOverride({ phase, week_in_block, force_deload, periodization_cycle_weeks: 4 });
    } catch (err: any) {
      setPrescriptionError(err?.message || "Failed to save coach state");
    }
  };

  const forceDeload = () => {
    void persistCoach("deload", 1, true);
  };
  const skipBlock = () => {
    setCoachPhase((prev: CoachPhase) => {
      const types: CoachPhase[] = ["linear", "double", "percentage", "autoregulated"];
      const idx = types.indexOf(prev as any);
      void persistCoach(types[(idx + 1) % types.length], 1, false);
      return types[(idx + 1) % types.length];
    });
  };
  const resetCoach = () => {
    void persistCoach("linear", 1, false);
  };

  return (
    <div className="space-y-4 pb-4">
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl border border-emerald-900/80 bg-slate-900 p-5 space-y-3 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-100">Finish workout early?</h3>
            <p className="text-xs text-slate-400">
              You've logged {logs.length} sets so far. Exercises you haven't completed will be left unfinished.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  finishWorkout();
                }}
                className="flex-1 rounded-xl border border-emerald-900/80 bg-emerald-950/40 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 active:scale-[0.98] transition-all"
              >
                Save partial workout
              </button>
              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  cancelWorkout();
                }}
                className="flex-1 rounded-xl border border-rose-900/80 bg-rose-950/40 px-4 py-3 text-sm font-semibold text-rose-300 hover:bg-rose-900/40 active:scale-[0.98] transition-all"
              >
                Discard workout
              </button>
            </div>
            <button
              onClick={() => setShowFinishConfirm(false)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition-all"
            >
              Keep going
            </button>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl border border-rose-900/80 bg-slate-900 p-5 space-y-3 max-w-sm w-full">
            <h3 className="text-base font-bold text-slate-100">Cancel workout?</h3>
            <p className="text-xs text-slate-400">This will delete the session and all logged sets. This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={cancelWorkout}
                className="flex-1 rounded-xl border border-rose-900/80 bg-rose-950/40 px-4 py-3 text-sm font-semibold text-rose-300 hover:bg-rose-900/40 active:scale-[0.98] transition-all"
              >
                Yes, cancel
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{template?.name || "Workout"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {exercises.length} exercises · {logs.length} sets logged
              {(workoutMode || "manual") === "ai_trainer" && coach?.is_deload && (
                <span className="text-amber-300 font-semibold ml-1">— Deload week</span>
              )}
              {(workoutMode || "manual") === "ai_trainer" && !coach?.is_deload && coach?.next_deload_date && (
                <span className="text-slate-300 ml-1">· Next deload {coach.next_deload_date}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-center min-w-[70px]">
              <div className="text-base font-bold text-emerald-300 tabular-nums leading-none">{formatElapsed(workoutElapsed)}</div>
              <div className="text-[10px] text-emerald-200 uppercase tracking-wide mt-1">Elapsed</div>
            </div>
            <button
              onClick={() => setShowFinishConfirm(true)}
              className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 active:scale-[0.98] transition-all"
            >
              Finish
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="rounded-xl border border-rose-900/80 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950 active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Prescription error banner */}
      {prescriptionError && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-rose-300 leading-relaxed flex-1">{prescriptionError}</p>
          <button onClick={() => setPrescriptionError(null)} className="text-rose-400 hover:text-rose-200 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Coach panel */}
      {(workoutMode || "manual") === "ai_trainer" && coach && (
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
          <div className="flex items-center gap-2 pt-1">
            <button onClick={forceDeload} className="flex-1 rounded-xl border border-amber-700/70 bg-amber-950/40 px-2 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/40 active:scale-[0.98] transition-all">
              Force deload
            </button>
            <button onClick={skipBlock} className="flex-1 rounded-xl border border-indigo-700/70 bg-indigo-950/40 px-2 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/40 active:scale-[0.98] transition-all">
              Next phase
            </button>
            <button onClick={resetCoach} className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition-all">
              Reset
            </button>
          </div>
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
                Set {nextSetDuringRest()!.set} — {Math.round(Number(nextSetDuringRest()!.weight))} × {nextSetDuringRest()!.reps} reps
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
                  draftRir={draftRir}
                  onDraftRirChange={setDraftRir}
                  showNotes={showNotes}
                  notes={notes}
                  onToggleNotes={() => setShowNotes((v) => !v)}
                  onNotesChange={setNotes}
                  canLog={canLog}
                  onLogSet={() => logSet()}
                  isLogging={isLogging}
                  onEditSet={handleEditSet}
                  onDeleteSet={handleDeleteSet}
                  suggestion={prescriptions[exercise.id]}
                  isTrainer={isTrainer}
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

