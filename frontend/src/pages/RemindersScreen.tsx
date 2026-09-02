import { useState, useEffect } from "react";

const STORAGE_KEY = "askeo_reminders";

interface Reminder {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export default function RemindersScreen({ onBack }: { onBack: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setReminders(JSON.parse(raw));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch {
      // no-op
    }
  }, [reminders]);

  const addReminder = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setReminders((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, completed: false, createdAt: new Date().toISOString() },
    ]);
    setText("");
  };

  const toggleComplete = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const deleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const active = reminders.filter((r) => !r.completed);
  const completed = reminders.filter((r) => r.completed);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <div className="flex items-center gap-3 p-4 border-b border-slate-800">
        <button
          onClick={onBack}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">Reminders</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add reminder..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
            onKeyDown={(e) => e.key === "Enter" && addReminder()}
          />
          <button
            onClick={addReminder}
            className="rounded-xl border border-indigo-700 bg-indigo-950/40 px-4 py-3 text-sm font-semibold text-indigo-300 hover:bg-indigo-900/40 active:scale-[0.98] transition-all"
          >
            Add
          </button>
        </div>

        {active.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Active</div>
            {active.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4"
              >
                <button
                  onClick={() => toggleComplete(r.id)}
                  className="h-6 w-6 rounded-full border-2 border-emerald-500 flex items-center justify-center hover:bg-emerald-950/40 active:scale-[0.95] transition-all"
                  aria-label="Mark complete"
                />
                <div className="flex-1 text-sm text-slate-200">{r.text}</div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Completed</div>
            {completed.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 opacity-60"
              >
                <button
                  onClick={() => toggleComplete(r.id)}
                  className="h-6 w-6 rounded-full border-2 border-slate-600 bg-slate-800 flex items-center justify-center hover:bg-slate-700 active:scale-[0.95] transition-all"
                  aria-label="Mark incomplete"
                />
                <div className="flex-1 text-sm text-slate-500 line-through">{r.text}</div>
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {reminders.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-10">
            No reminders yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
