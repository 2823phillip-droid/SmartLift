import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { ExerciseEntry, SetLog } from "../types";
import { formatWeight, getUnitsPreference } from "../utils/units";
import { resolveMediaUrl } from "../api";
import type { Prescription } from "../rules";

export interface SortableExerciseCardProps {
  exercise: ExerciseEntry;
  exerciseLogs: SetLog[];
  completed: number;
  displayTarget: number;
  isExpanded: boolean;
  isComplete: boolean;
  editingRest: boolean;
  addingSet: boolean;
  isDragActive: boolean;
  isResting: boolean;
  onExpand: () => void;
  onAddSet: () => void;
  onCancelAddSet: () => void;
  onToggleRestEdit: () => void;
  editingRestValue: string;
  onRestChange: (val: string) => void;
  draftWeight: string;
  draftReps: string;
  draftRpe: number | null;
  onDraftWeightChange: (val: string) => void;
  onDraftRepsChange: (val: string) => void;
  onDraftRpeChange: (val: number) => void;
  draftFormQuality: number;
  onDraftFormQualityChange: (val: number) => void;
  showNotes: boolean;
  notes: string;
  onToggleNotes: () => void;
  onNotesChange: (val: string) => void;
  canLog: boolean;
  onLogSet: () => Promise<boolean>;
  isLogging: boolean;
  onEditSet: (log: SetLog, field: "actual_weight" | "actual_reps" | "effort" | "rpe" | "form_quality", value: number | string) => void;
  onDeleteSet: (log: SetLog) => void;
  suggestion?: Prescription;
  isTrainer: boolean;
}

export function SortableExerciseCard({
  exercise,
  exerciseLogs,
  completed,
  displayTarget,
  isExpanded,
  isComplete,
  editingRest,
  addingSet,
  isDragActive,
  isResting,
  onExpand,
  onAddSet,
  onCancelAddSet,
  onToggleRestEdit,
  editingRestValue,
  onRestChange,
  draftWeight,
  draftReps,
  draftRpe,
  onDraftWeightChange,
  onDraftRepsChange,
  onDraftRpeChange,
  draftFormQuality,
  onDraftFormQualityChange,
  showNotes,
  notes,
  onToggleNotes,
  onNotesChange,
  canLog,
  onLogSet,
  isLogging,
  onEditSet,
  onDeleteSet,
  suggestion,
  isTrainer,
}: SortableExerciseCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });
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
        className="absolute left-2 top-2 z-10 flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-800 px-1.5 py-1 text-slate-600 active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <div className="pl-8">
        {isDragActive ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center gap-2">
              {exercise.gif_url ? (
                <img
                  src={resolveMediaUrl(exercise.gif_url)!}
                  alt={exercise.name}
                  className="h-9 w-9 rounded-lg object-cover border border-slate-800 bg-slate-900 shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="text-sm font-semibold text-slate-200 truncate">{exercise.name}</div>
              {isComplete && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-700/50 rounded-full px-2 py-0.5">
                  Done
                </span>
              )}
              {exercise.deload_override && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-600/20 text-amber-400 border border-amber-700/50 rounded-full px-2 py-0.5">
                  Deload override
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl border transition-all ${
              isExpanded
                ? "border-indigo-800 bg-slate-900/80 shadow-lg shadow-indigo-950/20"
                : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
            }`}
          >
            <button
              onClick={onExpand}
              disabled={isResting}
              className="w-full flex items-center justify-between px-3 py-2 text-left disabled:opacity-60"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {exercise.gif_url ? (
                  <img
                    src={resolveMediaUrl(exercise.gif_url)!}
                    alt={exercise.name}
                    className="h-9 w-9 rounded-lg object-cover border border-slate-800 bg-slate-900 shrink-0"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">{exercise.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {completed}/{displayTarget} sets · {formatWeight(exercise.start_weight, getUnitsPreference())} × {exercise.reps_target} reps target
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {isComplete && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-700/50 rounded-full px-1.5 py-0.5">
                    Done
                  </span>
                )}
                {!isResting && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSet();
                    }}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:border-slate-600"
                  >
                    Add Set
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={editingRestValue}
                    disabled={!editingRest}
                    onChange={(e) => onRestChange(e.target.value)}
                    className={`w-12 rounded-md border px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors ${
                      editingRest
                        ? "border-indigo-500 bg-slate-950 text-slate-200 focus:outline-none focus:border-indigo-400"
                        : "border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed"
                    }`}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRestEdit();
                    }}
                    className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
                      editingRest ? "border-indigo-500 bg-indigo-600 justify-end" : "border-slate-700 bg-slate-800 justify-start"
                    }`}
                    title={editingRest ? "Disable rest override" : "Enable rest override"}
                  >
                    <div className="h-3 w-3 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {exercise.notes && (
                  <div className="text-[10px] text-amber-400/80 bg-amber-950/30 border border-amber-800/50 rounded-lg px-2 py-1.5">
                    {exercise.notes}
                  </div>
                )}
                {exerciseLogs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Completed Sets</div>
                    {exerciseLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between rounded-xl bg-slate-950/50 border border-slate-800 px-2.5 py-1.5">
                        <span className="text-xs text-slate-500 font-semibold">Set {log.set_index}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 font-semibold">
                            {`${formatWeight(log.actual_weight ?? 0, getUnitsPreference())}`} × {log.actual_reps} reps
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); onEditSet(log, "actual_weight", log.actual_weight ?? 0); }}
                              className="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors px-1"
                              title="Edit weight"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteSet(log); }}
                              className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors px-1"
                              title="Delete set"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isTrainer && suggestion && (
                  <div className={`rounded-xl border px-3 py-2 ${
                    suggestion.workload_status === "deload" ? "border-amber-800 bg-amber-950/30" :
                    suggestion.workload_status === "easy" ? "border-emerald-800 bg-emerald-950/30" :
                    suggestion.workload_status === "hard" ? "border-rose-800 bg-rose-950/30" :
                    "border-indigo-800 bg-indigo-950/30"
                  }`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider ${
                      suggestion.workload_status === "deload" ? "text-amber-400" :
                      suggestion.workload_status === "easy" ? "text-emerald-400" :
                      suggestion.workload_status === "hard" ? "text-rose-400" :
                      "text-indigo-400"
                    }`}>
                      {suggestion.is_deload ? "Deload Week" : "Next Session Target"}
                    </div>
                    <div className="text-xs text-slate-300 mt-1 leading-relaxed">{suggestion.coaching_message}</div>
                  </div>
                )}

                {(!isComplete || addingSet) && !isResting && (
                  <>
                    {addingSet && (
                      <button
                        onClick={onCancelAddSet}
                        className="text-xs text-slate-400 hover:text-slate-300 transition-colors mb-1"
                      >
                        ← Cancel
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number"
                          inputMode="numeric"
                          enterKeyHint="next"
                          value={draftWeight}
                          onChange={(e) => onDraftWeightChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = e.currentTarget.parentElement?.nextElementSibling?.querySelector("input");
                              (next as HTMLInputElement | undefined)?.focus();
                            }
                          }}
                          placeholder="Weight"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Weight</div>
                        <div className="text-[10px] text-slate-600 text-center mt-0.5">For unilateral exercises, log the heavier side</div>
                      </div>
                      <div>
                        <input
                          type="number"
                          inputMode="numeric"
                          enterKeyHint="go"
                          value={draftReps}
                          onChange={(e) => onDraftRepsChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (canLog && !isLogging) {
                                onLogSet();
                              }
                            }
                          }}
                          placeholder="Reps"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
                        />
                        <div className="text-[10px] text-slate-500 text-center mt-1 uppercase tracking-wider">Reps</div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                        RPE {draftRpe !== null ? draftRpe : "—"}
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[6, 7, 8, 9, 10].map((n) => (
                          <button
                            key={n}
                            onClick={() => onDraftRpeChange(n)}
                            className={`py-2.5 text-sm font-bold rounded-xl border transition-all ${
                              draftRpe === n
                                ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/20 scale-[1.02]"
                                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500">How hard was this set? 6 = easy, 10 = failure.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                        Form Quality
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { value: 0, label: "Clean" },
                          { value: 1, label: "Struggled" },
                          { value: 2, label: "Broke" },
                        ].map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={() => onDraftFormQualityChange(value)}
                            className={`py-2.5 text-xs font-bold rounded-xl border transition-all ${
                              draftFormQuality === value
                                ? value === 0
                                  ? "bg-emerald-600 border-emerald-500 text-white"
                                  : value === 1
                                  ? "bg-amber-600 border-amber-500 text-white"
                                  : "bg-rose-600 border-rose-500 text-white"
                                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <button
                        onClick={onToggleNotes}
                        className="text-sm text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 w-fit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {showNotes ? "Hide Note" : "Add Note"}
                      </button>
                      {showNotes && (
                        <textarea
                          value={notes}
                          onChange={(e) => onNotesChange(e.target.value)}
                          placeholder="Any thoughts on this set?"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                          rows={2}
                        />
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        await onLogSet();
                      }}
                      disabled={!canLog || isLogging}
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-3.5 text-base font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {isLogging ? "Logging..." : "Complete Set"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
