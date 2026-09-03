import { useEffect, useState } from "react";
import { api } from "../api";
import type { SetLog, WorkoutSession } from "../types";
import { lbsToKg, getUnitsPreference } from "../utils/units";

interface RecapExercise {
  name: string;
  setsDone: number;
  setsTarget: number;
  topWeight: number;
  topReps: number;
  topEffort: number | null;
  topRir: number | null;
  avgEffort: number | null;
  volume: number;
  hitTarget: boolean;
  feltHard: boolean;
  feltEasy: boolean;
}

export default function PreWorkoutScreen({
  templateId,
  onStart,
  onBack,
}: {
  templateId: number;
  onStart: (sessionId: number) => void;
  onBack: () => void;
}) {
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [recap, setRecap] = useState<{
    daysAgo: number | null;
    duration: string | null;
    totalSets: number;
    totalVolume: number;
    avgEffort: number | null;
    exercises: RecapExercise[];
    vibe: string;
    hasHistory: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<Array<{ id: number; question: string; answer: string }>>([]);
  const [coachLoading, setCoachLoading] = useState(false);

  const quickTags = ["tired", "good", "sore", "strong", "off day"];
  const toggleTag = (tag: string) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const sessions = await api.getSessions();
        if (cancelled) return;

        const last = sessions.find((s: WorkoutSession) => s.template_id === templateId && s.ended_at != null && s.status === "completed");

        if (!last) {
          const incomplete = sessions.find((s: WorkoutSession) => s.template_id === templateId && s.ended_at == null && s.status !== "cancelled");
          const hasAny = sessions.some((s: WorkoutSession) => s.template_id === templateId);
          let vibe = hasAny
            ? "You haven't finished this workout yet. Let's change that today."
            : "First time doing this workout. Let's build your baseline. Focus on form and show up.";
          if (incomplete) {
            vibe = `You have an unfinished session from ${Math.floor((Date.now() - new Date(incomplete.started_at).getTime()) / 86400000)} days ago. You can pick up where you left off or start fresh.`;
          }
          setRecap({
            daysAgo: null,
            duration: null,
            totalSets: 0,
            totalVolume: 0,
            avgEffort: null,
            exercises: [],
            vibe,
            hasHistory: false,
          });
          setLoading(false);
          return;
        }

        const [logs, exercises] = await Promise.all([
          api.getSessionSetLogs(last.id),
          api.getExercises(templateId),
        ]);
        if (cancelled) return;

        const nameMap: Record<number, string> = {};
        const targetMap: Record<number, number> = {};
        for (const ex of exercises) {
          nameMap[ex.id] = ex.name;
          targetMap[ex.id] = ex.reps_target;
        }

        const byExercise: Record<number, SetLog[]> = {};
        for (const log of logs) {
          if (!byExercise[log.exercise_entry_id]) byExercise[log.exercise_entry_id] = [];
          byExercise[log.exercise_entry_id].push(log);
        }

        const units = getUnitsPreference();
        const toDisplayWeight = (lbs: number) => (units === "imperial" ? lbs : lbsToKg(lbs));

        const exercisesRecap: RecapExercise[] = [];
        let totalVolume = 0;
        let totalEffort = 0;
        let effortCount = 0;
        let hardCount = 0;
        let easyCount = 0;

        for (const [entryId, sets] of Object.entries(byExercise)) {
          const eid = Number(entryId);
          sets.sort((a, b) => a.set_index - b.set_index);
          const topSet = sets.reduce((a, b) => (b.actual_weight || 0) > (a.actual_weight || 0) ? b : a, sets[0]);
          const efforts = sets.filter((s) => s.effort != null).map((s) => s.effort as number);
          const rawAvgEffort = efforts.length
            ? efforts.reduce((a, b) => a + b, 0) / efforts.length
            : null;
          const exVolume = sets.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0);
          const repsTarget = targetMap[eid] || 8;
          const hitTarget = topSet.actual_reps != null && topSet.actual_reps >= repsTarget;
          const feltHard = (topSet.effort != null && topSet.effort >= 4) || (topSet.rir != null && topSet.rir <= 1);
          const feltEasy = (topSet.effort != null && topSet.effort <= 2) && (topSet.rir == null || topSet.rir >= 3);

          totalVolume += toDisplayWeight(exVolume);
          totalEffort += efforts.reduce((a, b) => a + b, 0);
          effortCount += efforts.length;
          if (feltHard) hardCount++;
          if (feltEasy) easyCount++;

          exercisesRecap.push({
            name: nameMap[eid] || `Exercise ${eid}`,
            setsDone: sets.length,
            setsTarget: sets.length,
            topWeight: toDisplayWeight(topSet.actual_weight || 0),
            topReps: topSet.actual_reps || 0,
            topEffort: topSet.effort ?? null,
            topRir: topSet.rir ?? null,
            avgEffort: rawAvgEffort != null ? Math.round(rawAvgEffort * 10) / 10 : null,
            volume: Math.round(toDisplayWeight(exVolume)),
            hitTarget,
            feltHard,
            feltEasy,
          });
        }

        const avgEffort = effortCount ? Math.round((totalEffort / effortCount) * 10) / 10 : null;
        const daysAgo = Math.floor((Date.now() - new Date(last.started_at).getTime()) / 86400000);

        let vibe = "";
        if (exercisesRecap.length === 0) {
          vibe = "You started this workout last time but didn't log any sets. Let's change that today.";
        } else if (hardCount > exercisesRecap.length / 2) {
          vibe = "You pushed hard last session. Today is about matching that intensity.";
        } else if (easyCount > exercisesRecap.length / 2) {
          vibe = "Last time felt manageable — there's room to push harder today.";
        } else if (avgEffort != null && avgEffort >= 3.5) {
          vibe = "Solid effort last time. Let's match or beat it.";
        } else {
          vibe = "Decent session last time. Let's build on it.";
        }

        let duration: string | null = null;
        if (last.ended_at) {
          const mins = Math.round((new Date(last.ended_at).getTime() - new Date(last.started_at).getTime()) / 60000);
          duration = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        }

        setRecap({
          daysAgo,
          duration,
          totalSets: logs.length,
          totalVolume: Math.round(totalVolume),
          avgEffort,
          exercises: exercisesRecap,
          vibe,
          hasHistory: true,
        });
      } catch (err) {
        setRecap({
          daysAgo: null,
          duration: null,
          totalSets: 0,
          totalVolume: 0,
          avgEffort: null,
          exercises: [],
          vibe: "Could not load last session recap right now.",
          hasHistory: false,
        });
        console.error("[PreWorkoutScreen] recap failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [templateId]);

  const handleCoachQuestion = async () => {
    const q = coachInput.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    try {
      const resp = await api.coachChat({ question: q, template_id: templateId });
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: resp.message }]);
      setCoachInput("");
    } catch {
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: "Coach is unavailable right now. Try again in a moment." }]);
      setCoachInput("");
    } finally {
      setCoachLoading(false);
    }
  };

  const start = async () => {
    setStarting(true);
    const session = await api.createSession({
      template_id: templateId,
      pre_workout_mood: mood,
      pre_workout_tags: tags,
    });
    await api.createCoachMessage({
      session_id: session.id,
      role: "pre_workout",
      content: `Pre-workout check-in: mood="${mood}" tags=${JSON.stringify(tags)}. ${recap?.vibe || "Let's go."}`,
    });
    onStart(session.id);
  };

  if (loading) return <div className="text-center text-slate-500 py-10">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Ready?</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Coach Recap</div>
        </div>

        {!recap?.hasHistory ? (
          <p className="text-sm text-indigo-200 leading-relaxed">{recap?.vibe}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-indigo-200 leading-relaxed">
              You last did this workout <span className="text-indigo-100 font-semibold">{recap.daysAgo === 0 ? "today" : recap.daysAgo === 1 ? "yesterday" : `${recap.daysAgo} days ago`}</span>
              {recap.duration && <span className="text-indigo-300"> · lasted {recap.duration}</span>}
              {" · "}
              <span className="text-indigo-100 font-semibold">{recap.totalSets} sets</span>
              {" · "}
              avg effort <span className="text-indigo-100 font-semibold">{recap.avgEffort != null ? `${recap.avgEffort}/5` : "not logged"}</span>
              {" · "}
              <span className="text-indigo-100 font-semibold">{recap.totalVolume.toLocaleString()} lbs</span> total volume
            </p>

            <div className="space-y-1.5">
              {recap.exercises.map((ex) => (
                <div key={ex.name} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="text-indigo-100 font-semibold">{ex.name}</span>
                    <span className="text-indigo-300 ml-1.5">{ex.setsDone} sets</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-indigo-200">
                      {ex.topWeight > 0 ? `${Math.round(ex.topWeight)} lbs × ${ex.topReps}` : "bodyweight"}
                    </div>
                    <div className="text-indigo-400 mt-0.5">
                      effort {ex.avgEffort != null ? `${ex.avgEffort}/5` : "not logged"}
                      {ex.topRir != null && <span> · RIR {ex.topRir}</span>}
                      {ex.feltHard && <span className="text-rose-300 ml-1">· felt hard</span>}
                      {ex.feltEasy && <span className="text-emerald-300 ml-1">· felt easy</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-indigo-300 leading-relaxed pt-1 border-t border-indigo-800/50">
              {recap.vibe}
            </p>
          </div>
        )}
      </div>

      {/* Ask the Coach */}
      <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/20 overflow-hidden">
        <button
          onClick={() => setCoachOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="text-sm font-semibold text-indigo-300">Ask the Coach</span>
          </div>
          <svg
            className={`w-4 h-4 text-indigo-500 transition-transform ${coachOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {coachOpen && (
          <div className="px-4 pb-4 space-y-3">
            {coachMessages.length === 0 && !coachLoading && (
              <p className="text-xs text-indigo-400/80">
                Ask anything: "Why did it suggest this weight?" / "What should I focus on today?"
              </p>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {coachMessages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="text-xs text-slate-400">You: {m.question}</div>
                  <div className="text-xs text-indigo-200 bg-indigo-900/30 rounded-lg px-3 py-2 whitespace-pre-wrap">{m.answer}</div>
                </div>
              ))}
              {coachLoading && (
                <div className="text-xs text-indigo-400 italic">Coach is thinking...</div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCoachQuestion();
              }}
              className="flex gap-2"
            >
              <input
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                placeholder="Type your question..."
                disabled={coachLoading}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={coachLoading || !coachInput.trim()}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 active:scale-[0.98] transition-all"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">How are you feeling?</label>
        <textarea
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          placeholder="Tired but ready, sore from yesterday, feeling strong..."
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm
                     placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors resize-none"
          rows={3}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-semibold">Quick Tags</label>
        <div className="flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-4 py-2 text-xs font-semibold border transition-all ${
                tags.includes(tag)
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/20"
                  : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={start}
        disabled={starting}
        className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold
                   hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30
                   disabled:opacity-60 disabled:cursor-wait disabled:active:scale-100"
      >
        {starting ? "Starting..." : "Start Workout"}
      </button>
    </div>
  );
}
