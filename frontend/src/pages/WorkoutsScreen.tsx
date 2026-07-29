import { useEffect, useState } from "react";
import { Play, Plus, BookOpen, Pencil, Trash2, ChevronDown, GripVertical } from "lucide-react";
import { api } from "../api";
import { log } from "../utils/logger";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

type TemplateItem = {
  id: number;
  name: string;
  type: string;
  context_id: number;
  exercises: { id: number; name: string }[];
  order: number;
};

type Group = { context: { id: number; name: string; order: number }; templates: TemplateItem[] };

export default function WorkoutsScreen({
  onStartWorkout,
  onBuildWorkout,
  onSelectPrebuilt,
  onBack,
  onEditTemplate,
}: {
  onStartWorkout: (templateId: number) => void;
  onBuildWorkout: () => void;
  onSelectPrebuilt: () => void;
  onBack: () => void;
  onEditTemplate?: (templateId: number, contextId: number) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedContexts, setExpandedContexts] = useState<Set<number>>(new Set());
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getContexts(), api.getTemplatesAcrossAll()])
      .then(([contexts, templatesRaw]: any[]) => {
        if (cancelled) return;
        const sorted = (contexts || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        const items: TemplateItem[] = (templatesRaw || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          context_id: t.context_id,
          exercises: (t.exercises || []).map((ex: any) => ({ id: ex.id, name: ex.name })),
          order: t.order ?? 0,
        }));
        const map = new Map<number, Group>();
        for (const c of sorted) {
          map.set(c.id, { context: { id: c.id, name: c.name, order: c.order ?? 0 }, templates: [] });
        }
        for (const t of items) {
          const g = map.get(t.context_id);
          if (g) g.templates.push(t);
        }
        const next = Array.from(map.values()).filter((g) => g.templates.length > 0);
        next.forEach((g) => {
          g.templates.sort((a, b) => a.order - b.order);
        });
        setGroups(next);
        setExpandedContexts(new Set());
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const templatesSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const contextSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleContext = (contextId: number) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(contextId)) next.delete(contextId);
      else next.add(contextId);
      return next;
    });
  };

  const deleteTemplate = async (templateId: number) => {
    try {
      await api.deleteTemplate(templateId);
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          templates: g.templates.filter((t) => t.id !== templateId),
        }))
      );
    } catch (err: any) {
      alert(err?.message || "Delete failed. See console for details.");
      log.error("workouts_delete_template_failed", { template_id: templateId, error: err });
    }
  };

  const deleteContext = async (contextId: number, name: string) => {
    if (!window.confirm(`Delete "${name}" and all its workouts?`)) return;
    try {
      await api.deleteContext(contextId);
      setGroups((prev) => prev.filter((g) => g.context.id !== contextId));
    } catch (err: any) {
      alert(err?.message || "Delete failed. See console for details.");
      log.error("workouts_delete_context_failed", { context_id: contextId, error: err });
    }
  };

  const renameContext = async (contextId: number, currentName: string) => {
    const newName = window.prompt("Rename template:", currentName);
    if (!newName?.trim()) return;
    try {
      await api.updateContext(contextId, { name: newName.trim() });
      setGroups((prev) =>
        prev.map((g) => (g.context.id === contextId ? { ...g, context: { ...g.context, name: newName.trim() } } : g))
      );
    } catch (err: any) {
      alert(err?.message || "Rename failed.");
      log.error("workouts_rename_context_failed", { context_id: contextId, error: err });
    }
  };

  const handleContextDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragActive(false);
    if (!over || active.id === over.id) return;
    setGroups((prev) => {
      const oldIndex = prev.findIndex((g) => g.context.id === active.id);
      const newIndex = prev.findIndex((g) => g.context.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      reordered.forEach((g, idx) => {
        if (g.context.order !== idx) {
          api.updateContext(g.context.id, { order: idx }).catch((err: any) =>
            log.error("workouts_context_order_failed", { context_id: g.context.id, order: idx, error: err })
          );
        }
      });
      return reordered;
    });
  };

  const handleTemplateDragEnd = async (contextId: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.context.id !== contextId) return g;
        const oldIndex = g.templates.findIndex((t) => t.id === active.id);
        const newIndex = g.templates.findIndex((t) => t.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return g;
        const reordered = arrayMove(g.templates, oldIndex, newIndex);
        return { ...g, templates: reordered };
      });
      const reorderedGroup = updated.find((g) => g.context.id === contextId);
      if (!reorderedGroup) return prev;
      reorderedGroup.templates.forEach((tpl, idx) => {
        if (tpl.order !== idx) {
          api.updateTemplate(tpl.id, { order: idx }).catch((err: any) =>
            log.error("workouts_template_order_failed", { template_id: tpl.id, order: idx, error: err })
          );
        }
      });
      return updated;
    });
  };

  const hasData = groups.some((g) => g.templates.length > 0);

  void onEditTemplate;

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

      {loading && (
        <div className="text-center text-xs text-slate-500">Loading workouts...</div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {!loading && !hasData && (
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => onStartWorkout(0)}
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
      )}

      {!loading && hasData && (
        <DndContext
          sensors={contextSensors}
          collisionDetection={closestCenter}
          onDragStart={() => setDragActive(true)}
          onDragEnd={handleContextDragEnd}
          onDragCancel={() => setDragActive(false)}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={groups.map((g) => g.context.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {groups.map(({ context, templates }) => {
                const isExpanded = expandedContexts.has(context.id);
                return (
                  <SortableGroupRow
                    key={context.id}
                    group={{ context, templates }}
                    isDragActive={dragActive}
                    isExpanded={isExpanded}
                    onToggle={() => toggleContext(context.id)}
                    templatesSensors={templatesSensors}
                    onTemplateDragEnd={handleTemplateDragEnd}
                    onStartWorkout={onStartWorkout}
                    onDeleteTemplate={deleteTemplate}
                    onEditTemplate={onEditTemplate}
                    onEditContext={renameContext}
                    onDeleteContext={deleteContext}
                  />
                );
              })}

              <button
                onClick={onBuildWorkout}
                className="w-full rounded-2xl border border-indigo-800 bg-indigo-950/40 hover:border-indigo-500/60 px-4 py-4 text-left transition-colors"
              >
                <div className="font-semibold text-sm text-indigo-200">Build a new Workout</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Select a template or create from scratch.
                </div>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

type SortableGroupRowProps = {
  group: Group;
  isDragActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  templatesSensors: ReturnType<typeof useSensors>;
  onTemplateDragEnd: (contextId: number, event: DragEndEvent) => void;
  onStartWorkout: (templateId: number) => void;
  onDeleteTemplate: (templateId: number) => void;
  onEditContext: (ctxId: number, currentName: string) => void;
  onEditTemplate?: (templateId: number, contextId: number) => void;
  onDeleteContext: (contextId: number, name: string) => void;
};

function SortableGroupRow({
  group,
  isDragActive,
  isExpanded,
  onToggle,
  templatesSensors,
  onTemplateDragEnd,
  onStartWorkout,
  onDeleteTemplate,
  onEditContext,
  onEditTemplate,
  onDeleteContext,
}: SortableGroupRowProps) {
  const { context, templates } = group;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: context.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.95 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`rounded-2xl border overflow-hidden ${isDragActive ? "border-slate-600 bg-slate-900/70" : "border-slate-800 bg-slate-900/50"} transition-all`}>
      <div className="px-4 py-3 text-left flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            {...listeners}
            {...attributes}
            className="shrink-0 flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 px-1.5 py-1 text-slate-600 active:cursor-grabbing"
            aria-label="Drag to reorder template"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <button
            onClick={onToggle}
            className="flex items-center gap-2 min-w-0 text-left flex-1"
          >
            <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`} />
            <div className="min-w-0">
              <div className="font-semibold text-sm whitespace-nowrap">{context.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {templates.length} workout{templates.length !== 1 ? "s" : ""}
              </div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-3 shrink-0 pr-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditContext(context.id, context.name);
            }}
            className="text-indigo-400 hover:text-indigo-300 active:scale-95 transition-all p-1"
            aria-label={`Edit ${context.name}`}
          >
            <Pencil className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteContext(context.id, context.name);
            }}
            className="text-rose-400 hover:text-rose-300 active:scale-95 transition-all p-1"
            aria-label={`Delete ${context.name}`}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="border-t border-slate-800/80">
        {isExpanded && (
          <DndContext
            sensors={templatesSensors}
            collisionDetection={closestCenter}
            onDragStart={() => {}}
            onDragEnd={(event) => onTemplateDragEnd(context.id, event)}
            onDragCancel={() => {}}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={templates.map((tpl) => tpl.id)} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-1 gap-2 p-3">
                {templates.map((tpl) => (
                  <SortableTemplateRow
                    key={tpl.id}
                    tpl={tpl}
                    isDragActive={isDragActive}
                    onStartWorkout={onStartWorkout}
                    onDelete={onDeleteTemplate}
                    onEditTemplate={onEditTemplate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

type SortableTemplateRowProps = {
  tpl: TemplateItem;
  isDragActive: boolean;
  onStartWorkout: (id: number) => void;
  onDelete: (id: number) => void;
  onEditTemplate?: (templateId: number, contextId: number) => void;
};

function SortableTemplateRow({
  tpl,
  isDragActive,
  onStartWorkout,
  onDelete,
  onEditTemplate,
}: SortableTemplateRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tpl.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 1 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...listeners}
        {...attributes}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 px-1.5 py-1 text-slate-600 active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className={`rounded-xl border flex gap-3 pl-10 ${isDragActive ? "border-slate-600 bg-slate-900/70" : "border-slate-800 bg-slate-950/60"} transition-all`}>
        <button
          onClick={() => onStartWorkout(tpl.id)}
          className="flex-1 min-w-0 text-left p-3"
        >
          <div className="font-semibold text-sm">{tpl.name}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {(tpl.exercises || []).map((ex) => ex.name).join(" · ") || "No exercises"}
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0 pr-3 py-3" style={{ touchAction: "manipulation" }}>
          <button
            onClick={() => onStartWorkout(tpl.id)}
            className="text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all p-1"
            aria-label={`Start ${tpl.name}`}
          >
            <Play className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onEditTemplate) onEditTemplate(tpl.id, tpl.context_id);
            }}
            className="text-indigo-400 hover:text-indigo-300 active:scale-95 transition-all p-1"
            aria-label="Edit"
          >
            <Pencil className="w-5 h-5" />
          </button>
          <button
            onClick={() => onDelete(tpl.id)}
            className="text-rose-400 hover:text-rose-300 active:scale-95 transition-all p-1"
            aria-label={`Delete ${tpl.name}`}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
