import { useState, useEffect, useRef } from "react";

const playChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // no-op
  }
};

const PRESETS = [60, 180, 300, 600];

export default function TimerScreen({ onBack }: { onBack: () => void }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState("");
  const intervalRef = useRef<number | null>(null);
  const endRef = useRef<number | null>(null);

  useEffect(() => {
    if (running && seconds !== null && seconds > 0) {
      intervalRef.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endRef.current! - Date.now()) / 1000));
        setSeconds(remaining);
        if (remaining <= 0) {
          setRunning(false);
          setSeconds(null);
          playChime();
        }
      }, 200);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const startTimer = (s: number) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    const end = Date.now() + s * 1000;
    endRef.current = end;
    setSeconds(s);
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (seconds && seconds > 0 && endRef.current) {
      const remaining = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000));
      setSeconds(remaining);
    }
  };

  const resume = () => {
    if (!seconds || seconds <= 0) return;
    const end = Date.now() + seconds * 1000;
    endRef.current = end;
    setRunning(true);
  };

  const reset = () => {
    setRunning(false);
    setSeconds(null);
    setCustom("");
    if (intervalRef.current) window.clearInterval(intervalRef.current);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleCustomStart = () => {
    const parsed = parseInt(custom, 10);
    if (parsed && parsed > 0) startTimer(parsed);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <div className="flex items-center gap-3 p-4 border-b border-slate-800">
        <button
          onClick={onBack}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">Timer</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {seconds === null && !running && (
          <>
            <div className="text-center text-slate-400 text-sm">Choose a duration</div>
            <div className="grid grid-cols-2 gap-3">
              {PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => startTimer(s)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-6 text-base font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  {formatTime(s)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom seconds"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
              />
              <button
                onClick={handleCustomStart}
                className="rounded-xl border border-indigo-700 bg-indigo-950/40 px-4 py-3 text-sm font-semibold text-indigo-300 hover:bg-indigo-900/40 active:scale-[0.98] transition-all"
              >
                Start
              </button>
            </div>
          </>
        )}

        {(seconds !== null || running) && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-7xl font-bold text-amber-300 tabular-nums tracking-tight">
                {seconds !== null ? formatTime(seconds) : "0:00"}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-widest mt-2 font-semibold">
                {running ? "Running" : "Paused"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {running ? (
                <button
                  onClick={pause}
                  className="rounded-2xl border border-amber-700 bg-amber-950/40 px-4 py-4 text-sm font-semibold text-amber-300 hover:bg-amber-900/40 active:scale-[0.98] transition-all"
                >
                  Pause
                </button>
              ) : (
                seconds !== null &&
                seconds > 0 && (
                  <button
                    onClick={resume}
                    className="rounded-2xl border border-emerald-700 bg-emerald-950/40 px-4 py-4 text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 active:scale-[0.98] transition-all"
                  >
                    Resume
                  </button>
                )
              )}
              <button
                onClick={reset}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4 text-sm font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => startTimer(s)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  {formatTime(s)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
