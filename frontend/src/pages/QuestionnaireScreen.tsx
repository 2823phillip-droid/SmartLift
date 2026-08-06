import { useMemo, useState, useCallback } from "react";
import { withRetry, initApiBaseFromSettings, getApiBase, getAuthToken } from "../api";
import { questionnaireSections } from "../config/questionnaire";
import type { Section, Question } from "../config/questionnaire";

type Answers = Record<string, string | string[] | number | null>;

function isMulti(q: Question): boolean {
  return q.type === "multi";
}

function defaultValue(q: Question): string | string[] | null {
  if (q.default !== undefined) return q.default;
  if (isMulti(q)) return [];
  return null;
}

function getAllQuestions(answers: Answers): { section: Section; question: Question }[] {
  const out: { section: Section; question: Question }[] = [];
  const buildMode = answers["build_mode"];
  for (const section of questionnaireSections) {
    for (const question of section.questions) {
      // Skip split style question in custom mode — user builds their own structure
      if (question.key === "focus" && buildMode === "custom") continue;
      out.push({ section, question });
    }
  }
  return out;
}

function lbsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

function inchesToCm(inches: number): number {
  return inches * 2.54;
}

export default function QuestionnaireScreen({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (draft: any, answers: Record<string, any>) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(() => {
    const initial: Answers = {};
    for (const s of questionnaireSections) {
      for (const q of s.questions) {
        initial[q.key] = defaultValue(q);
      }
    }
    return initial;
  });
  const all = useMemo(() => getAllQuestions(answers), [answers]);
  const total = all.length;
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = all[step];
  const { section, question } = current;

  const unitsPreference = answers["units_preference"] as string | null | undefined;

  const displayLabel = useMemo(() => {
    if (question.key === "weight_kg") {
      return unitsPreference === "imperial" ? "Weight (lbs)" : "Weight (kg)";
    }
    if (question.key === "height_cm") {
      return unitsPreference === "imperial" ? "Height (inches)" : "Height (cm)";
    }
    return question.label;
  }, [question.key, question.label, unitsPreference]);

  const displayPlaceholder = useMemo(() => {
    if (question.key === "weight_kg") {
      return unitsPreference === "imperial" ? "Enter weight in lbs" : "Enter weight in kg";
    }
    if (question.key === "height_cm") {
      return unitsPreference === "imperial" ? "Enter height in inches" : "Enter height in cm";
    }
    return "Enter value";
  }, [question.key, unitsPreference]);

  const progress = useMemo(() => {
    let done = 0;
    for (let i = 0; i < step; i++) {
      const q = all[i].question;
      const val = answers[q.key];
      if (val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)) {
        done++;
      }
    }
    return { current: step + 1, total, done };
  }, [step, answers, all, total]);

  const showSectionPreface = useMemo(() => {
    if (step === 0) return true;
    return all[step - 1].section.id !== section.id;
  }, [step, section.id, all]);

  const select = useCallback(
    (value: string | string[] | null) => {
      setAnswers((prev) => ({ ...prev, [question.key]: value }));
      setError(null);
    },
    [question.key]
  );

  const clearAnswer = useCallback(() => {
    select(null);
  }, [select]);

  const currentAnswer = answers[question.key];

  const canProceed = useMemo(() => {
    if (currentAnswer === null || currentAnswer === undefined || currentAnswer === "") return true;
    if (Array.isArray(currentAnswer)) return currentAnswer.length > 0;
    return true;
  }, [currentAnswer]);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await withRetry(() => initApiBaseFromSettings(), { retries: 2, baseDelayMs: 300 });

      // Build profile payload from answers, converting units if needed
      const profile: Answers = {};
      for (const s of questionnaireSections) {
        for (const q of s.questions) {
          const val = answers[q.key];
          if (val !== null && val !== undefined && val !== "") {
            if (q.key === "weight_kg" && unitsPreference === "imperial") {
              const lbs = parseFloat(String(val));
              if (!Number.isNaN(lbs) && lbs > 0) {
                profile[q.key] = lbsToKg(lbs);
              }
            } else if (q.key === "height_cm" && unitsPreference === "imperial") {
              const inches = parseFloat(String(val));
              if (!Number.isNaN(inches) && inches > 0) {
                profile[q.key] = inchesToCm(inches);
              }
            } else {
              // Backend expects goal as list even though frontend renders it as single-select
              if (q.key === "goal" && typeof val === "string") {
                profile[q.key] = [val];
              } else {
                profile[q.key] = val;
              }
            }
          }
        }
      }

      // Save profile
      await fetch(`${getApiBase()}/profile/fitness`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(profile),
      }).then((r) => {
        if (!r.ok) throw new Error(`Profile save failed: ${r.status}`);
        return r.json();
      });

      // Save units preference to settings
      if (unitsPreference) {
        try {
          await fetch(`${getApiBase()}/settings/${encodeURIComponent("units_preference")}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({ key: "units_preference", value: unitsPreference }),
          });
        } catch {
          // non-fatal
        }
      }

      // Generate draft
      const genRes = await fetch(`${getApiBase()}/trainer/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(profile),
      }).then((r) => {
        if (!r.ok) throw new Error(`Generate failed: ${r.status}`);
        return r.json();
      });

      onComplete(genRes, answers);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < total - 1) {
      setStep((s) => s + 1);
    } else {
      submit();
    }
  };

  const handleBackClick = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    } else {
      onBack();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBackClick}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <div className="text-xs text-slate-500">
          {progress.current} / {progress.total}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>

      {/* Section preface */}
      {showSectionPreface && (
        <div className="rounded-2xl border border-indigo-800/40 bg-indigo-950/30 p-4">
          <h3 className="text-sm font-bold text-indigo-200 mb-1">{section.title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{section.preface}</p>
        </div>
      )}

      {/* Question */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-bold text-slate-100">{displayLabel}</h4>
          {question.preface && question.preface !== section.preface && (
            <p className="text-xs text-slate-400 mt-1">{question.preface}</p>
          )}
        </div>

        {(question.type === "single" || question.type === "text") ? (
          question.options.length === 0 ? (
            <input
              type="text"
              inputMode={question.type === "text" ? "text" : "decimal"}
              value={currentAnswer ?? ""}
              onChange={(e) => select(e.target.value || null)}
              placeholder={displayPlaceholder}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {question.options.map((opt) => {
                const selected = currentAnswer === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => select(opt.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                      selected
                        ? "bg-indigo-600 text-white border border-indigo-500 shadow-lg shadow-indigo-900/30"
                        : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className={`text-xs mt-1 ${selected ? "text-indigo-100" : "text-slate-500"}`}>
                        {opt.description}
                      </div>
                    )}
                  </button>
                );
              })}
              {question.preferNotToAnswer && (
                <button
                  onClick={clearAnswer}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    currentAnswer === null
                      ? "bg-slate-700 text-slate-200 border border-slate-500"
                      : "border border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  Prefer not to answer
                </button>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-wrap gap-2">
            {question.options.map((opt) => {
              const selected = Array.isArray(currentAnswer) && currentAnswer.includes(opt.value);
              const isNone = opt.value === "none";
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const arr = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
                    if (selected) {
                      if (!isNone) {
                        const idx = arr.indexOf(opt.value);
                        if (idx >= 0) arr.splice(idx, 1);
                      }
                    } else {
                      if (isNone) {
                        arr.length = 0;
                        arr.push("none");
                      } else {
                        const noneIdx = arr.indexOf("none");
                        if (noneIdx >= 0) arr.splice(noneIdx, 1);
                        arr.push(opt.value);
                      }
                    }
                    select(arr);
                  }}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selected
                      ? "bg-emerald-600 text-white border border-emerald-500 shadow-lg shadow-emerald-900/30"
                      : "border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-slate-500">
          {question.type === "multi" && Array.isArray(currentAnswer) && currentAnswer.length > 0
            ? `${currentAnswer.length} selected`
            : ""}
        </div>
        <button
          onClick={handleNext}
          disabled={loading || !canProceed}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? "Generating..." : step === total - 1 ? "Finish" : "Next"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-rose-300 leading-relaxed flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
