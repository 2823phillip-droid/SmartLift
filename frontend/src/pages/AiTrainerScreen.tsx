import { useEffect, useState, useRef } from "react";
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

type CoachState = {
  phase?: string;
  week_in_block?: number;
  load_pct?: number;
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
  const [coachState, setCoachState] = useState<CoachState>({});

  const units = getUnitsPreference();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionsData, exercises, state] = await Promise.all([
          api.getSessions(),
          api.getAllExercises(),
          api.getCoachState?.().catch(() => ({})),
        ]);
        if (cancelled) return;
        const completed = (sessionsData as SessionHistory[])
          .filter((s) => s.ended_at && s.status === "completed")
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        setSessions(completed.slice(0, 20));

        const map: Record<number, string> = {};
        (exercises as any[]).forEach((e: any) => {
          map[e.id] = e.name || `Exercise ${e.id}`;
        });
        setExerciseMap(map);

        const cs = state as any;
        if (cs) {
          setCoachState({
            phase: cs.coach_phase,
            week_in_block: cs.coach_week_in_block,
            load_pct: cs.coach_load_pct,
          });
        }
      } catch {
        // silent — show empty state
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [coachMessages, coachLoading]);

  const loadSession = async (session: SessionHistory) => {
    if (sessionDetails[session.id]) {
      setSelectedSessionId(session.id);
      setCoachOpen(true);
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
      setCoachOpen(true);
    } catch {
      // show error inline
    }
  };

  const handleCoachQuestion = async () => {
    const q = coachInput.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    try {
      const resp = await api.coachChat({
        question: q,
        ...(selectedSessionId ? { session_id: selectedSessionId } : {}),
      });
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: resp.message }]);
      setCoachInput("");
    } catch {
      setCoachMessages((m) => [...m, { id: Date.now(), question: q, answer: "Coach is unavailable right now. Try again in a moment." }]);
      setCoachInput("");
    } finally {
      setCoachLoading(false);
    }
  };

  const phaseColor = (phase?: string) => {
    if (!phase) return "text-slate-400";
    switch (phase) {
      case "linear": return "text-emerald-400";
      case "deload": return "text-amber-400";
      case "block": return "text-indigo-400";
      default: return "text-indigo-300";
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">AI Trainer</h2>
          <p className="text-xs text-slate-500 mt-0.5">Review workouts, track progress, ask the coach.</p>
        </div>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/60">Back</button>
      </div>

      {/* Coach State Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <div>
            <div className="text-xs text-slate-400">
              Program: <span className={phaseColor(coachState.phase)}>{coachState.phase || "unknown"}</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Week {coachState.week_in_block ?? "?"} · Load {coachState.load_pct ?? 0}%
            </div>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Coach Active</div>
      </div>

      {/* Recent Sessions */}
      <div className="space-y-2">
        <div className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold px-1">Recent Sessions</div>
        {loadingSessions ? (
          <div className="text-sm text-slate-500 text-center py-8">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <p className="text-sm text-slate-400 text-center">No completed sessions yet. Finish a workout to see it here.</p>
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
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.985] ${
                    isSelected
                      ? "border-indigo-500/60 bg-indigo-950/40 shadow-lg shadow-indigo-500/10"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-200 truncate">
                        {s.template_name || `Session #${s.id}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {dateLabel}{durLabel}{detail && `${detail.exercises.length} exercises`}
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
                        <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="text-indigo-100 font-medium">{ex.name}</span>
                            <span className="text-indigo-400 ml-1.5">{ex.sets} sets</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-indigo-200">
                              {ex.topWeight > 0 ? `${formatWeight(ex.topWeight, units)} × ${ex.topReps}` : "bodyweight"}
                            </div>
                            <div className="text-indigo-400 mt-0.5">effort {ex.avgEffort}</div>
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
            {coachMessages.length === 0 && !coachLoading ? (
              <p className="text-xs text-indigo-400/80">
                Ask anything: "Why did it suggest this weight?" / "What should I focus on today?"
              </p>
            ) : null}

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {coachMessages.map((m) => (
                <div key={m.id} className="space-y-1.5">
                  <div className="text-xs text-slate-400 text-right">You: {m.question}</div>
                  <div className="text-xs text-indigo-100 bg-indigo-900/40 rounded-2xl rounded-tl-sm px-3 py-2.5 whitespace-pre-wrap leading-relaxed border border-indigo-800/40">
                    {m.answer}
                  </div>
                </div>
              ))}
              {coachLoading && (
                <div className="text-xs text-indigo-400 italic flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                  <span className="ml-1">Coach is thinking...</span>
                </div>
              )}
              <div ref={chatEndRef} />
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
                placeholder="Ask about your training..."
                disabled={coachLoading}
                className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={coachLoading || !coachInput.trim()}
                className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 active:scale-[0.97] transition-all"
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
