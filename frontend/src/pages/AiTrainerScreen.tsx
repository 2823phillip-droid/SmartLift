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
  referenced_sessions?: Array<{
    id: number;
    template_name?: string;
    date?: string;
    exercises: Array<{ name: string; top_weight: number; top_reps: number }>;
  }>;
};

type CoachState = {
  phase?: string;
  week_in_block?: number;
  load_pct?: number;
};

const SUGGESTED_QUESTIONS = [
  "How's my progress?",
  "What should I focus on today?",
  "Why this weight?",
  "Am I recovering well?",
];

export default function AiTrainerScreen({ onBack }: { onBack: () => void }) {
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetails, setSessionDetails] = useState<Record<number, SessionRecap>>({});

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachState, setCoachState] = useState<CoachState>({});
  const [coachSource, setCoachSource] = useState<string>("offline");
  const [exerciseMap, setExerciseMap] = useState<Record<number, string>>({});

  const units = getUnitsPreference();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [exercises, state, health] = await Promise.all([
          api.getAllExercises().catch(() => []),
          api.getCoachState?.().catch(() => ({})),
          api.getCoachHealth?.().catch(() => ({ llm_available: false, status: "offline" })),
        ]);
        if (cancelled) return;
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
        const h = health as any;
        if (h) {
          setCoachSource(h.status === "connected" ? "llm" : h.status === "degraded" ? "degraded" : "offline");
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [coachMessages, coachLoading]);

  useEffect(() => {
    if (coachOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [coachOpen]);

  const loadSession = async (id: number) => {
    if (sessionDetails[id]) {
      setSelectedSessionId(id);
      setCoachOpen(true);
      return;
    }
    try {
      const [session, logs] = await Promise.all([
        api.getSession(id),
        api.getSessionSetLogs(id),
      ]);
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

      const sessionTyped = session as SessionHistory;
      const durationMin = sessionTyped?.started_at && sessionTyped?.ended_at
        ? Math.round((new Date(sessionTyped.ended_at).getTime() - new Date(sessionTyped.started_at).getTime()) / 60000)
        : null;

      setSessionDetails((d) => ({
        ...d,
        [id]: {
          session: sessionTyped,
          logs: logsTyped,
          exercises,
          totalVolume: Math.round(totalVolume),
          avgEffort: effortCount ? Math.round((totalEffort / effortCount) * 10) / 10 : 0,
          durationMin,
        },
      }));
      setSelectedSessionId(id);
      setCoachOpen(true);
    } catch {
      // silent
    }
  };

  const handleCoachQuestion = async (question?: string) => {
    const q = question || coachInput.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    setCoachInput("");
    try {
      const resp = await api.coachChat({
        question: q,
        ...(selectedSessionId ? { session_id: selectedSessionId } : {}),
      });
      const data = resp as any;
      setCoachMessages((m) => [...m, {
        id: Date.now(),
        question: q,
        answer: data.message,
        referenced_sessions: data.referenced_sessions || [],
      }]);
      setCoachSource(data.source || "fallback");
    } catch {
      setCoachMessages((m) => [...m, {
        id: Date.now(),
        question: q,
        answer: "Coach is unavailable right now. Try again in a moment.",
        referenced_sessions: [],
      }]);
      setCoachSource("offline");
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

  const sourceLabel = (src: string) => {
    switch (src) {
      case "llm": return "Live";
      case "degraded": return "Limited";
      default: return "Offline";
    }
  };

  const sourceColor = (src: string) => {
    switch (src) {
      case "llm": return "bg-emerald-500";
      case "degraded": return "bg-amber-500";
      default: return "bg-rose-500";
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric",
    });
  };

  const handleChip = (q: string) => {
    handleCoachQuestion(q);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            A
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-100">Askeo Coach</h2>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${sourceColor(coachSource)}`} />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                {sourceLabel(coachSource)}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/60"
        >
          Back
        </button>
      </div>

      {/* Program state bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[10px] text-slate-500">
            Program: <span className={phaseColor(coachState.phase)}>{coachState.phase || "unknown"}</span>
          </div>
          <div className="text-[10px] text-slate-600">
            Week {coachState.week_in_block ?? "?"} · Load {coachState.load_pct ?? 0}%
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/40 mb-3">
        <div className="p-4 space-y-4">
          {coachMessages.length === 0 && !coachLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center mb-4">
                <span className="text-2xl">💪</span>
              </div>
              <h3 className="text-base font-semibold text-slate-300 mb-1">Ask your coach anything</h3>
              <p className="text-xs text-slate-500 max-w-[260px] mb-5">
                I know your workout history, program phase, and current prescription. Just ask.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleChip(q)}
                    className="text-xs px-3 py-2 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-300 hover:bg-indigo-900/60 hover:border-indigo-700 transition-all active:scale-[0.97]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {coachMessages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {/* User question */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white leading-relaxed">
                      {m.question}
                    </div>
                  </div>

                  {/* Coach answer */}
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                      A
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-900/60 border border-slate-800/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                        {m.answer}
                      </div>

                      {/* Referenced workout cards */}
                      {m.referenced_sessions && m.referenced_sessions.length > 0 && (
                        <div className="space-y-1.5 pl-1">
                          {m.referenced_sessions.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => loadSession(s.id)}
                              className="cursor-pointer rounded-xl border border-slate-800/80 bg-slate-900/80 px-3 py-2.5 hover:border-indigo-700/60 transition-colors active:scale-[0.99]"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-indigo-300 truncate">
                                  {s.template_name || `Session #${s.id}`}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-2 shrink-0">
                                  {formatDate(s.date)}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {s.exercises.slice(0, 3).map((ex, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-400 truncate">{ex.name}</span>
                                    <span className="text-slate-500 ml-2 shrink-0">
                                      {ex.top_weight > 0 ? `${formatWeight(ex.top_weight, units)} × ${ex.top_reps}` : "bodyweight"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {coachLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                    A
                  </div>
                  <div className="flex items-center gap-1.5 px-3.5 py-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl rounded-tl-sm">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-100" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-200" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={coachInput}
          onChange={(e) => setCoachInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleCoachQuestion();
            }
          }}
          placeholder="Ask about your training..."
          disabled={coachLoading}
          className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-60"
        />
        <button
          onClick={() => handleCoachQuestion()}
          disabled={coachLoading || !coachInput.trim()}
          className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 active:scale-[0.97] transition-all"
        >
          Send
        </button>
      </div>
    </div>
  );
}
