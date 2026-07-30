import { useState, useEffect } from "react";

const STORAGE_KEY = "smartlift_error_log";

function DebugLogScreen({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<
    { timestamp: string; message: string; stack?: string }[]
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      setEntries([]);
    }
  }, []);

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Debug Log</h2>
        <div className="flex gap-2">
          <button
            onClick={clear}
            className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800"
          >
            Clear
          </button>
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            Back
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Captured global errors from this session. Share the newest entry when
        reporting issues.
      </p>
      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-slate-500">No errors captured yet.</p>
        )}
        {entries.map((entry, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-1"
          >
            <div className="text-[10px] text-slate-500 font-mono">
              {entry.timestamp}
            </div>
            <div className="text-sm text-red-300 font-mono break-words">
              {entry.message || "Unknown error"}
            </div>
            {entry.stack && (
              <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-words">
                {entry.stack}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DebugLogScreen;
