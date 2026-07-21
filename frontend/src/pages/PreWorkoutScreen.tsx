import { useEffect, useState } from "react";
import { api } from "../api";

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
  const [coachMsg, setCoachMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const quickTags = ["tired", "good", "sore", "strong", "off day"];
  const toggleTag = (tag: string) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));

  useEffect(() => {
    api.getSessions().then(async (sessions) => {
      const last = sessions[0];
      let msg = "";
      if (last) {
        const logs = await api.getSessionSetLogs(last.id);
        const completed = logs.length;
        const avgEffort = logs.length
          ? (logs.reduce((a: number, b: { effort?: number }) => a + (b.effort || 0), 0) / logs.length).toFixed(1)
          : "N/A";
        msg = `Last session: ${completed} sets logged · avg effort ${avgEffort}. Pick up where you left off.`;
      } else {
        msg = "No previous sessions yet. Let's build your first one. Focus on form and show up.";
      }
      setCoachMsg(msg);
      setLoading(false);
    });
  }, [templateId]);

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
      content: `Pre-workout check-in: mood="${mood}" tags=${JSON.stringify(tags)}. ${coachMsg}`,
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

      <div className="rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Coach Recap</div>
        </div>
        <p className="text-sm text-indigo-200 leading-relaxed">{coachMsg}</p>
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
