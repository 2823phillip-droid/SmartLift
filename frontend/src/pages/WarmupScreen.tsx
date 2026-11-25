import { useEffect, useState, useRef } from "react";
import { api, resolveMediaUrl } from "../api";

interface WarmupExercise {
  id: number;
  name: string;
  gif_url: string | null;
  image_url: string | null;
  muscle_group: string | null;
  equipment: string | null;
  is_custom: boolean;
}

const DYNAMIC_WARMUPS = [
  "High Knees",
  "Butt Kicks",
  "Lunges with a Twist",
  "Leg Swings (Front to Back)",
  "Arm Circles",
  "Carioca (Grapevine)",
  "Frankensteins",
  "Side Shuffles",
  "Bounding",
  "Jumping Jacks",
];

const STRETCHES = [
  "All Fours Squad Stretch",
  "Calf Stretch with Hands Against Wall",
  "Chest and Front of Shoulder Stretch",
  "Kneeling Lat Stretch",
  "Lying (Side) Quads Stretch",
  "Neck Side Stretch",
  "Rear Deltoid Stretch",
  "Rocking Frog Stretch",
  "Runners Stretch",
  "Seated Glute Stretch",
  "Seated Lower Back Stretch",
  "Seated Piriformis Stretch",
  "Standing Calves Calf Stretch",
  "Standing Lateral Stretch",
  "Triceps Stretch",
  "Upper Back Stretch",
  "Front and Back Neck Stretch",
  "Side Neck Stretch",
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WarmupScreen({ onComplete }: { onComplete: () => void }) {
  const [dynamicExercises, setDynamicExercises] = useState<WarmupExercise[]>([]);
  const [stretchExercises, setStretchExercises] = useState<WarmupExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"dynamic" | "stretches">("dynamic");
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes per phase
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const endRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const all = await api.searchExerciseLibrary();

        const dynamics = all.filter((e: WarmupExercise) =>
          DYNAMIC_WARMUPS.some((name) => e.name.toLowerCase() === name.toLowerCase())
        );
        const stretches = all.filter((e: WarmupExercise) =>
          STRETCHES.some((name) => e.name.toLowerCase() === name.toLowerCase())
        );

        if (!cancelled) {
          setDynamicExercises(dynamics);
          setStretchExercises(stretches);
        }
      } catch (err) {
        console.error("[WarmupScreen] Failed to load exercises:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (running && timeLeft > 0) {
      intervalRef.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endRef.current! - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          setRunning(false);
          setTimeLeft(0);
        }
      }, 200);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const startTimer = (seconds: number) => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    const end = Date.now() + seconds * 1000;
    endRef.current = end;
    setTimeLeft(seconds);
    setRunning(true);
  };

  const pauseTimer = () => {
    setRunning(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
  };

  const resumeTimer = () => {
    if (timeLeft <= 0) return;
    const end = Date.now() + timeLeft * 1000;
    endRef.current = end;
    setRunning(true);
  };

  const switchPhase = () => {
    setRunning(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setPhase((p) => (p === "dynamic" ? "stretches" : "dynamic"));
    setTimeLeft(300);
  };

  const completeWarmup = () => {
    setRunning(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    onComplete();
  };

  const totalTimeLeft = timeLeft;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading warmup...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-800">
        <button
          onClick={completeWarmup}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
        >
          ← Cancel
        </button>
        <h2 className="text-lg font-bold tracking-tight flex-1 text-center">
          {phase === "dynamic" ? "Dynamic Warmup" : "Stretches"}
        </h2>
        <div className="w-16 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-xl font-mono font-bold text-slate-100">
          {formatTime(totalTimeLeft)}
        </div>
      </div>

      {/* Timer controls */}
      <div className="flex items-center justify-center gap-4 p-4 border-b border-slate-800/50">
        {!running && timeLeft > 0 && (
          <button
            onClick={() => startTimer(timeLeft)}
            className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all"
          >
            Start {phase === "dynamic" ? "Warmup" : "Stretching"}
          </button>
        )}
        {running && (
          <button
            onClick={pauseTimer}
            className="rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold hover:bg-amber-500 active:scale-[0.98] transition-all"
          >
            Pause
          </button>
        )}
        {!running && timeLeft > 0 && (
          <button
            onClick={resumeTimer}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            Resume
          </button>
        )}
      </div>

      {/* Phase indicator */}
      <div className="flex gap-2 p-4 border-b border-slate-800/50">
        <button
          onClick={() => { if (phase !== "dynamic") switchPhase(); }}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
            phase === "dynamic"
              ? "bg-indigo-600 text-white"
              : "bg-slate-900 text-slate-400 border border-slate-700"
          }`}
        >
          Dynamic Warmup (5 min)
        </button>
        <button
          onClick={() => { if (phase !== "stretches") switchPhase(); }}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
            phase === "stretches"
              ? "bg-indigo-600 text-white"
              : "bg-slate-900 text-slate-400 border border-slate-700"
          }`}
        >
          Stretches (5 min)
        </button>
      </div>

      {/* Exercise grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {phase === "dynamic" ? (
          <>
            <p className="text-sm text-slate-400 text-center -mt-2">
              Do as many as you can in 5 minutes
            </p>
            {dynamicExercises.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                No dynamic warmup exercises found.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {dynamicExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
                  >
                    <div className="aspect-square w-full bg-slate-800">
                      {ex.gif_url ? (
                        <img
                          src={resolveMediaUrl(ex.gif_url)!}
                          alt={ex.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : ex.image_url ? (
                        <img
                          src={resolveMediaUrl(ex.image_url)!}
                          alt={ex.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-4xl text-slate-600">
                          {ex.name[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-sm text-slate-100 truncate">{ex.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ex.muscle_group || ex.equipment || "bodyweight"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-400 text-center -mt-2">
              Hold each stretch for 20-30 seconds
            </p>
            {stretchExercises.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                No stretch exercises found.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {stretchExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
                  >
                    <div className="aspect-square w-full bg-slate-800">
                      {ex.gif_url ? (
                        <img
                          src={resolveMediaUrl(ex.gif_url)!}
                          alt={ex.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : ex.image_url ? (
                        <img
                          src={resolveMediaUrl(ex.image_url)!}
                          alt={ex.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-4xl text-slate-600">
                          {ex.name[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-sm text-slate-100 truncate">{ex.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ex.muscle_group || ex.equipment || "bodyweight"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Complete button */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={completeWarmup}
          className="w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold
                     hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30"
        >
          Complete Warmup
        </button>
        <p className="text-center text-xs text-slate-500 mt-2">
          You'll return to the ready screen
        </p>
      </div>
    </div>
  );
}
