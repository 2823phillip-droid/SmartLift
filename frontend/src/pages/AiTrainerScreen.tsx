import { useEffect, useState } from "react";
import { api, type SessionHistory, type SetLog } from "../api";
import { getUnitsPreference, formatWeight } from "../utils/units";

type SessionRecap = {
  session: SessionHistory;
  logs: SetLog[];
  exercises: Array<{
    name: string;
    sets: number;
    topWeight: number;
    topReps: number;
    avgEffort: number;
    volume: number;
  }>;
  totalVolume: number;
  avgEffort: number;
  durationMin: number | null;
};

type CoachMessage = {
  id: number;
  question: string;
  answer: string;
};

export default function AiTrainerScreen({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetails, setSessionDetails] = useState<Record<number, SessionRecap>>({});
  const [exerciseMap, setExerciseMap] = useState<Record<number, string>>({});

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachContext, setCoachContext] = useState<{ template_id?: number; session_id?: number }>({});

  const units = getUnitsPreference();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionsData, exercises] = await Promise.all([
          api.getSessions(),
          api.getAllExercises(),
        ]);
        if (cancelled) return;
        const completed = (sessionsData as SessionHistory[])
          .filter((s) => s.ended_at && s.status === "completed")
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        setSessions(completed.slice(0, 10));

        const map: Record<number, string> = {};
        (exercises as any[]).forEach((e: any) => {
          map[e.id] = e.name || `Exercise ${e.id}`;
        });
        setExerciseMap(map);
      } catch {
        // silent — show empty state
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadSession = async (session: SessionHistory) => {
    if (sessionDetails[session.id]) {
      setSelectedSessionId(session.id);
      return;
    }
    try {
      const logs = await api.getSessionSetLogs(session.id);
      const logsTyped = logs as SetLog[];
      const byExercise: Record<number, SetLog[]> = {};
      for (const log of logsTyped) {
        if (!byExercise[log.exercise_entry_id]) byExercise[log.exercise_entry_id] = [];
        byExercise[log.exercise_entry_id].push(log);
      }

      let totalVolume = 0;
      let totalEffort = 0;
      let effortCount = 0;
      const exercises: SessionRecap["exercises"] = [];

      for (const [eid, sets] of Object.entries(byExercise)) {
        sets.sort((a, b) => a.set_index - b.set_index);
        const topSet = sets.reduce((a, b) => (b.actual_weight || 0) > (a.actual_weight || 0) ? b : a, sets[0]);
        const exVolume = sets.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0);
        const avgEffort = sets.length ? sets.reduce((a, b) => a + (b.effort || 3), 0) / sets.length : 3;

        totalVolume += exVolume;
        totalEffort += sets.reduce((a, b) => a + (b.effort || 3), 0);
        effortCount += sets.length;

        exercises.push({
          name: exerciseMap[Number(eid)] || `Exercise ${eid}`,
          sets: sets.length,
          topWeight: topSet.actual_weight || 0,
          topReps: topSet.actual_reps || 0,
          avgEffort: Math.round(avgEffort * 10) / 10,
          volume: Math.round(exVolume),
        });
      }

      const durationMin = session.ended_at && session.started_at
        ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
        : null;

      setSessionDetails((d) => ({
        ...d,
        [session.id]: {
          session,
          logs: logsTyped,
          exercises,
          totalVolume: Math.round(totalVolume),
          avgEffort: effortCount ? Math.round((totalEffort / effortCount) * 10) / 10 : 0,
          durationMin,
        },
      }));
      setSelectedSessionId(session.id);
      setCoachContext({ template_id: session.template_id, session_id: session.id });
    } catch {
      // show error inline
    }
  };

  const handleCoachQuestion = async () => {
    const q = coachInput.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    try {
      const resp = await api.coachChat({ question: q, ...coachContext });
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: resp.message }]);
      setCoachInput("");
    } catch {
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: "Coach is unavailable right now. Try again in a moment." }]);
      setCoachInput("");
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">AI Trainer</h2>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50">Back</button>
      </div>

      <p className="text-slate-400 text-xs leading-relaxed">
        Review your recent workouts, track progress, and ask the coach anything about your training.
      </p>

      {/* Recent Sessions */}
      <div className="space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Recent Sessions</div>
        {loadingSessions ? (
          <div className="text-sm text-slate-500 text-center py-6">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-400">No completed sessions yet. Finish a workout to see it here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isSelected = selectedSessionId === s.id;
              const detail = sessionDetails[s.id];
              const dateLabel = new Date(s.started_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              });
              const durLabel = detail
                ? (detail.durationMin ? `${detail.durationMin} min · ` : "")
                : "";
              return (
                <button
                  key={s.id}
                  onClick={() => loadSession(s)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isSelected ? "border-indigo-500/60 bg-indigo-950/30" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-200">
                        {s.template_name || `Session #${s.id}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {dateLabel}
                        {durLabel}
                        {detail && `${detail.exercises.length} exercises`}
                      </div>
                    </div>
                    {detail && (
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs text-indigo-300 font-semibold">{formatWeight(detail.totalVolume, units)}</div>
                        <div className="text-[10px] text-slate-500">effort {detail.avgEffort}/5</div>
                      </div>
                    )}
                  </div>

                  {isSelected && detail && (
                    <div className="mt-3 space-y-2 border-t border-indigo-800/40 pt-3">
                      {detail.exercises.map((ex, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <span className="text-indigo-100 font-semibold">{ex.name}</span>
                            <span className="text-indigo-400 ml-1.5">{ex.sets} sets</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-indigo-200">
                              {ex.topWeight > 0 ? `${formatWeight(ex.topWeight, units)} × ${ex.topReps}` : "bodyweight"}
                            </div>
                            <div className="text-indigo-400 mt-0.5">
                              effort {ex.avgEffort}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
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
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {coachOpen && (
          <div className="px-4 pb-4 space-y-3">
            {!selectedSessionId ? (
              <p className="text-xs text-slate-400">
                Select a workout above first so the coach knows what to recap.
              </p>
            ) : coachMessages.length === 0 && !coachLoading ? (
              <p className="text-xs text-indigo-400/80">
                Ask anything: "Why did it suggest this weight?" / "What should I focus on today?"
              </p>
            ) : null}

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                placeholder={selectedSessionId ? "Type your question..." : "Select a workout first"}
                disabled={coachLoading || !selectedSessionId}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={coachLoading || !coachInput.trim() || !selectedSessionId}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 active:scale-[0.98] transition-all"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
