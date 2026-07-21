import { useEffect, useState } from "react";
import { api } from "../api";
import type { SetLog, CoachMessage, WorkoutSession } from "../types";

export default function PostWorkoutScreen({
  sessionId,
  onDone,
}: {
  sessionId: number;
  onDone: () => void;
}) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    api.getSession(sessionId).then(setSession);
    api.getSessionSetLogs(sessionId).then(setLogs);
    api.getCoachMessages(sessionId).then(setMessages);
  }, [sessionId]);

  const submitFeedback = async () => {
    if (!feedback.trim()) return;
    await api.createCoachMessage({
      session_id: sessionId,
      role: "post_workout",
      content: feedback,
    });
    await api.createCoachMessage({
      session_id: sessionId,
      role: "post_workout",
      content: `Session summary: ${logs.length} sets logged. Volume: ${logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0).toFixed(0)} lbs. Feedback: ${feedback}`,
    });
    onDone();
  };

  const totalVolume = logs.reduce((a, b) => a + (b.actual_weight || 0) * (b.actual_reps || 0), 0);
  const avgEffort = logs.length ? (logs.reduce((a, b) => a + (b.effort || 0), 0) / logs.length).toFixed(1) : "N/A";

  const durationMinutes = session?.ended_at && session?.started_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  const postMsgs = messages.filter((m) => m.role === "post_workout" || m.role === "in_workout");

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-950/50 border border-emerald-800 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Session Complete</h2>
        <p className="text-xs text-slate-500 mt-1">Great work — here's your breakdown</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Sets</div>
          <div className="text-2xl font-bold">{logs.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Volume</div>
          <div className="text-2xl font-bold">{totalVolume.toFixed(0)}</div>
          <div className="text-[10px] text-slate-500">lbs</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Avg Effort</div>
          <div className="text-2xl font-bold">{avgEffort}</div>
          <div className="text-[10px] text-slate-500">/ 5</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">Duration</div>
          <div className="text-2xl font-bold">{durationMinutes ?? "—"}</div>
          <div className="text-[10px] text-slate-500">min</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Set Log</h3>
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
                {log.actual_weight} lbs × {log.actual_reps} reps
              </div>
              {log.notes && <div className="text-xs text-slate-400 mt-1 italic">"{log.notes}"</div>}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-slate-600 text-center py-6">No sets logged this session.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Coach Notes</h3>
          <span className="text-xs text-slate-500">{postMsgs.length} messages</span>
        </div>
        <div className="space-y-2">
          {postMsgs.map((m) => (
            <div key={m.id} className="rounded-xl border border-indigo-800/50 bg-indigo-950/20 px-4 py-3">
              <p className="text-sm text-indigo-200 leading-relaxed">{m.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-semibold">How did it feel?</label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional feedback for your coach..."
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3.5 text-sm resize-none placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
          rows={3}
        />
        <button
          onClick={submitFeedback}
          disabled={!feedback.trim()}
          className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold
                     hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          Send to Coach
        </button>
      </div>

      <button
        onClick={onDone}
        className="w-full rounded-xl border border-slate-700 px-4 py-3.5 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors font-medium"
      >
        Back to Home
      </button>
    </div>
  );
}
