import { useEffect, useState } from "react";
import { api } from "../api";
import { log } from "../utils/logger";

type Template = {
  id: number;
  name: string;
  type: string;
  context_id: number;
  exercises: { id: number; name: string }[];
};

type Context = {
  id: number;
  name: string;
  description?: string;
};

export default function TemplateGroupListScreen({
  onBack,
  onStartTemplate,
  onBuildWorkout,
  onEditTemplate,
  onDeleteTemplate,
  onEditContext,
  onDeleteContext,
}: {
  onBack: () => void;
  onStartTemplate: (templateId: number) => void;
  onBuildWorkout?: () => void;
  onEditTemplate?: (templateId: number, contextId: number) => void;
  onDeleteTemplate?: (templateId: number) => void;
  onEditContext?: (contextId: number) => void;
  onDeleteContext?: (contextId: number) => void;
}) {
  const [groups, setGroups] = useState<{ context: Context; templates: Template[] }[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [contexts, templatesRaw] = await Promise.all([
          api.getContexts(),
          api.getTemplatesAcrossAll(),
        ]);

        const templates: Template[] = templatesRaw.map((t: any) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          context_id: t.context_id,
          exercises: (t.exercises || []).map((ex: any) => ({ id: ex.id, name: ex.name })),
        }));

        const byContext = new Map<string, Template[]>();
        for (const t of templates) {
          const key = String(t.context_id);
          const list = byContext.get(key) || [];
          list.push(t);
          byContext.set(key, list);
        }

        if (!cancelled) {
          const next = contexts
            .map((ctx: Context) => ({
              context: ctx,
              templates: byContext.get(String(ctx.id)) || [],
            }))
            .filter((g: { context: Context; templates: Template[] }) => g.templates.length > 0);
          setGroups(next);
        }
      } catch (e) {
        log.error("template_group_list_load_failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Start a Workout</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>

      {loading && (
        <div className="text-center text-xs text-slate-500">Loading routines...</div>
      )}

      {!loading && groups.length === 0 && (
        <div className="text-center py-10 rounded-2xl border border-dashed border-slate-800">
          <p className="text-sm text-slate-400">No routines yet.</p>
          <p className="text-xs text-slate-500 mt-1">Create one in Build a Workout.</p>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(({ context, templates }) => {
          const isOpen = !!expanded[context.id];
          return (
            <div
              key={context.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden"
            >
              <div className="px-4 py-3.5 text-left flex items-center gap-3">
                <button
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [context.id]: !prev[context.id] }))
                  }
                  className="shrink-0"
                >
                  <svg className={`w-4 h-4 text-slate-600 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{context.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {templates.length} workout{templates.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {onEditContext && onDeleteContext && (
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditContext(context.id);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-2.5 text-indigo-300 hover:bg-indigo-900/60 active:scale-95 transition-all"
                      aria-label={`Edit ${context.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                      <span className="text-xs font-semibold">Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm(`Delete "${context.name}"? This cannot be undone.`)) return;
                        onDeleteContext(context.id);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-2.5 text-rose-400 hover:bg-rose-900/60 active:scale-95 transition-all"
                      aria-label={`Delete ${context.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084A2.25 2.25 0 012.244 2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      <span className="text-xs font-semibold">Delete</span>
                    </button>
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-slate-800/80">
                  {templates.map((tpl) => {
                    const exerciseCount = tpl.exercises?.length || 0;
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => onStartTemplate(tpl.id)}
                        className="w-full px-4 py-3.5 text-left flex items-center gap-2 hover:bg-slate-900/70 transition-colors border-b border-slate-800/60 last:border-b-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{tpl.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {tpl.type}
                            <span className="mx-1.5 text-slate-700">·</span>
                            {exerciseCount} exercises
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          {onEditTemplate && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTemplate(tpl.id, tpl.context_id);
                              }}
                              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-3.5 py-2.5 text-indigo-300 hover:bg-indigo-900/60 active:scale-95 transition-all"
                              aria-label={`Edit ${tpl.name}`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                              <span className="text-xs font-semibold">Edit</span>
                            </button>
                          )}
                          {onDeleteTemplate && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
                                try {
                                  await onDeleteTemplate(tpl.id);
                                  setRefreshToken((prev) => prev + 1);
                                } catch (err: any) {
                                  alert(err?.message || "Delete failed. See console for details.");
                                  log.error("template_delete_failed", { template_id: tpl.id, error: err });
                                }
                              }}
                              className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3.5 py-2.5 text-rose-400 hover:bg-rose-900/60 active:scale-95 transition-all"
                              aria-label={`Delete ${tpl.name}`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                              <span className="text-xs font-semibold">Delete</span>
                            </button>
                          )}
                          <svg
                            className="w-4 h-4 text-slate-500 ml-1 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onBuildWorkout && (
        <button
          onClick={onBuildWorkout}
          className="w-full rounded-2xl border border-emerald-800 bg-emerald-950/40 hover:border-emerald-500/60 px-4 py-4 text-sm font-semibold text-emerald-200 hover:text-emerald-100 transition-colors"
        >
          Build a Workout
        </button>
      )}
    </div>
  );
}
