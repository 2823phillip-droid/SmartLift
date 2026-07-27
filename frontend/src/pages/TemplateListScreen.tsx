import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkoutTemplate } from "../types";

export default function TemplateListScreen({
  contextId,
  showAllRoutines = false,
  onBack,
  onSelectTemplate,
  onCreateNew,
  onEditTemplate,
  onDeleteTemplate,
  onBuildNew,
}: {
  contextId?: number | null;
  showAllRoutines?: boolean;
  onBack: () => void;
  onSelectTemplate: (id: number) => void;
  onCreateNew?: () => void;
  onEditTemplate?: (id: number) => void;
  onDeleteTemplate?: (id: number) => void;
  onBuildNew?: () => void;
}) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [toDeleteId, setToDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (showAllRoutines && !contextId) {
      api.getTemplatesAcrossAll().then(setTemplates);
    } else if (contextId == null) {
      setTemplates([]);
    } else {
      api.getTemplates(contextId).then(setTemplates);
    }
  }, [contextId, showAllRoutines]);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{showAllRoutines ? "Routines" : "Routines"}</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      {onCreateNew && !showAllRoutines && (
        <button
          onClick={onCreateNew}
          className="w-full rounded-2xl bg-indigo-600 px-5 py-4 font-semibold text-base
                     hover:bg-indigo-500 active:scale-[0.98] transition-all
                     shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Routine
        </button>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 transition-colors overflow-hidden"
          >
            <button
              onClick={() => onSelectTemplate(t.id)}
              className="w-full px-4 py-4 text-left"
            >
              <div className="font-semibold text-sm">{t.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500">{t.type}</span>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-slate-500">{t.exercises?.length || 0} exercises</span>
              </div>
            </button>
            {!showAllRoutines && (
              <div className="border-t border-slate-800/80 px-3 py-2 flex items-center justify-end gap-2">
                {onEditTemplate && (
                  <button
                    onClick={() => onEditTemplate(t.id)}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-2 rounded-lg hover:bg-indigo-950/40 font-medium text-sm"
                  >
                    Edit
                  </button>
                )}
                {onDeleteTemplate && (
                  toDeleteId === t.id ? (
                    <button
                      onClick={async () => {
                        try {
                          await onDeleteTemplate(t.id);
                          setTemplates((prev) => prev.filter((x) => x.id !== t.id));
                        } catch (err: any) {
                          alert(err?.message || "Delete failed. See console for details.");
                        } finally {
                          setToDeleteId(null);
                        }
                      }}
                      className="text-rose-500 hover:text-rose-400 transition-colors px-3 py-2 rounded-lg hover:bg-rose-950/30 font-medium text-sm"
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => setToDeleteId(t.id)}
                      className="text-rose-500/80 hover:text-rose-400 transition-colors px-3 py-2 rounded-lg hover:bg-rose-950/30 font-medium text-sm"
                    >
                      Delete
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-10 rounded-2xl border border-dashed border-slate-800">
            <p className="text-sm text-slate-600">No routines yet. Create one or import a prebuilt workout.</p>
          </div>
        )}

        {showAllRoutines && onBuildNew && (
          <button
            onClick={onBuildNew}
            className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 hover:border-indigo-500/40 px-4 py-4 text-sm font-semibold text-slate-300 hover:text-slate-100 transition-colors"
          >
            Create new workout
          </button>
        )}
      </div>
    </div>
  );
}
