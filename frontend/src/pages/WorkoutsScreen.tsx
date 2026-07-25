import { Play, Plus, BookOpen } from "lucide-react";

export default function WorkoutsScreen({
  onStartWorkout,
  onBuildWorkout,
  onSelectPrebuilt,
  onBack,
}: {
  onStartWorkout: () => void;
  onBuildWorkout: () => void;
  onSelectPrebuilt: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Workouts</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={onStartWorkout}
          className="rounded-2xl border border-emerald-800 bg-emerald-950/40 hover:border-emerald-500/60 p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-800/60 flex items-center justify-center text-emerald-300">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-emerald-200">Start a Workout</div>
              <div className="text-xs text-slate-500 mt-0.5">Quick start from routines</div>
            </div>
          </div>
        </button>

        <button
          onClick={onBuildWorkout}
          className="rounded-2xl border border-indigo-800 bg-indigo-950/40 hover:border-indigo-500/60 p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-800/60 flex items-center justify-center text-indigo-300">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-indigo-200">Build a Workout</div>
              <div className="text-xs text-slate-500 mt-0.5">Manual build from scratch</div>
            </div>
          </div>
        </button>

        <button
          onClick={onSelectPrebuilt}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-800/60 flex items-center justify-center text-indigo-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-slate-200">Prebuilt Workouts</div>
              <div className="text-xs text-slate-500 mt-0.5">Browse the library</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
