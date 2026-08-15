import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { api, resolveMediaUrl } from "../api";
import type { WorkoutLibrary } from "../types";
import { formatWeight, getUnitsPreference } from "../utils/units";
import { toTitle } from "../utils/format";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "text-emerald-400 bg-emerald-950/40 border-emerald-800",
  intermediate: "text-amber-400 bg-amber-950/40 border-amber-800",
  advanced: "text-rose-400 bg-rose-950/40 border-rose-800",
};

export default function LibraryScreen({ onBack, onImported }: { onBack: () => void; onImported?: () => void }) {
  const [items, setItems] = useState<WorkoutLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<WorkoutLibrary | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const openPreview = async (url: string) => {
    if (!url) return;
    try {
      if (Capacitor.getPlatform() === "ios") {
        await Browser.open({ url, presentationStyle: "fullscreen" });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error("preview_failed", e);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    api.getWorkoutLibrary()
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const open = (item: WorkoutLibrary) => {
    api.getWorkoutLibraryItem(item.id).then(setDetail).catch(() => {});
  };

  const doImport = async () => {
    if (!detail) return;
    const context_name = detail.name;
    setImporting(true);
    setStatus(null);
    try {
      const res = await api.importWorkoutLibrary({ library_id: detail.id, context_name });
      setStatus(`Imported ${res.exercises_imported} exercises into "${context_name}"`);
      onImported?.();
      setTimeout(onBack, 900);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-bold tracking-tight">Workout Library</h2>
      </div>

      {status && (
        <div className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
          {status}
        </div>
      )}

      {detail ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-lg font-semibold">{detail.name}</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border uppercase tracking-wide text-slate-300 border-slate-700 bg-slate-900/40">
                {detail.category}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg border uppercase tracking-wide ${DIFFICULTY_COLORS[detail.difficulty] || "text-slate-300 border-slate-700 bg-slate-900/40"}`}>
                {detail.difficulty}
              </span>
              {detail.estimated_minutes ? (
                <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border text-indigo-300 border-indigo-800/60 bg-indigo-950/30">
                  {detail.estimated_minutes} min
                </span>
              ) : null}
            </div>
            {detail.description && (
              <p className="text-sm text-slate-400">{detail.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Exercises</div>
            <div className="space-y-2">
              {detail.exercises.map((ex, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex items-center gap-3">
                  <div
                    onClick={() => {
                      const url = resolveMediaUrl(ex.gif_url) || resolveMediaUrl(ex.image_url);
                      if (url) openPreview(url);
                    }}
                    className="shrink-0"
                  >
                    {ex.gif_url ? (
                      <img src={resolveMediaUrl(ex.gif_url)!} alt={ex.name} className="h-12 w-12 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : ex.image_url ? (
                      <img src={resolveMediaUrl(ex.image_url)!} alt={ex.name} className="h-12 w-12 rounded-xl object-cover border border-slate-800 bg-slate-900 shrink-0" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="h-12 w-12 rounded-xl border border-slate-800 bg-slate-900 shrink-0 flex items-center justify-center text-xs font-semibold text-slate-300">
                        {ex.name.trim()[0] ? ex.name.trim()[0].toUpperCase() : "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold truncate">{toTitle(ex.name)}</div>
                      <span className="text-[10px] font-semibold text-slate-500">{ex.order + 1}</span>
                    </div>
                    <div className="text-xs text-slate-400 space-x-2">
                      {ex.muscle_group ? <span>{ex.muscle_group}</span> : null}
                      {ex.equipment ? <span>· {ex.equipment}</span> : null}
                      <span>· {ex.sets_target}x{ex.reps_target}</span>
                      {ex.start_weight > 0 ? <span>· {formatWeight(ex.start_weight, getUnitsPreference())}</span> : null}
                      <span>· {ex.rest_seconds}s rest</span>
                    </div>
                  </div>
                  {ex.video_url && (
                    <button
                      onClick={() => openPreview(ex.video_url!)}
                      className="shrink-0 w-10 h-10 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-indigo-500/40 flex items-center justify-center text-indigo-300"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={doImport}
            disabled={importing}
            className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 text-sm transition-colors disabled:opacity-70"
          >
            {importing ? "Importing..." : `Import "${detail.name}"`}
          </button>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="text-sm text-slate-500">Loading library...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-500">No workouts available.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => open(item)}
                  className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 p-4 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-800/60 flex items-center justify-center text-indigo-300 font-semibold text-sm">
                      {item.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-sm truncate">{item.name}</div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg border uppercase tracking-wide ${DIFFICULTY_COLORS[item.difficulty] || "text-slate-300 border-slate-700 bg-slate-900/40"}`}>
                          {item.difficulty}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.category}
                        {item.estimated_minutes ? ` · ${item.estimated_minutes} min` : ""}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
