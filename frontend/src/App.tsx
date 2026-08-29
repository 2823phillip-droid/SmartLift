import { useEffect, useState } from "react";
import { api, initApiBaseFromSettings, setAuthToken, getAuthToken, withRetry } from "./api";
import { setUnitsPreference, getUnitsPreference, lbsToKg } from "./utils/units";
import HomeScreen from "./pages/HomeScreen";
import WorkoutsScreen from "./pages/WorkoutsScreen";
import TemplateListScreen from "./pages/TemplateListScreen";
import TemplateEditorScreen from "./pages/TemplateEditorScreen";
import BuildWorkoutScreen from "./pages/BuildWorkoutScreen";
import QuestionnaireScreen from "./pages/QuestionnaireScreen";
import PreWorkoutScreen from "./pages/PreWorkoutScreen";
import ActiveWorkoutScreen from "./pages/ActiveWorkoutScreen";
import PostWorkoutScreen from "./pages/PostWorkoutScreen";
import HistoryScreen from "./pages/HistoryScreen";
import TransitionHistoryScreen from "./pages/TransitionHistoryScreen";
import SettingsScreen from "./pages/SettingsScreen";
import LibraryScreen from "./pages/LibraryScreen";
import ProfileScreen from "./pages/ProfileScreen";
import LoginScreen from "./pages/LoginScreen";
import SignupScreen from "./pages/SignupScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import TabBar, { type Tab } from "./components/TabBar";
import DebugLogScreen from "./pages/DebugLogScreen";
import CustomWorkoutBuilderScreen from "./pages/CustomWorkoutBuilderScreen";

type View =
  | "home"
  | "build_workout"
  | "templates"
  | "template_editor"
  | "pre_workout"
  | "active_workout"
  | "post_workout"
  | "history"
  | "settings"
  | "library"
  | "ai_trainer"
  | "workouts"
  | "profile"
  | "login"
  | "signup"
  | "debug_log"
  | "questionnaire"
  | "transition_history"
  | "custom_builder";

const tabRootToView: Record<Tab, View> = {
  home: "home",
  workouts: "workouts",
  ai: "ai_trainer",
  history: "history",
  settings: "settings",
};

const viewToTab: Record<View, Tab | null> = {
  home: "home",
  build_workout: "workouts",
  templates: "workouts",
  template_editor: "workouts",
  pre_workout: "workouts",
  active_workout: "workouts",
  post_workout: "workouts",
  history: "history",
  settings: "settings",
  library: "workouts",
  ai_trainer: "ai",
  workouts: "workouts",
  profile: null,
  login: null,
  signup: null,
  debug_log: "settings",
  questionnaire: null,
  transition_history: "workouts",
  custom_builder: "workouts",
};

export default function App() {
  const [view, setView] = useState<View>("login");
  const [tab, setTab] = useState<Tab>("home");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const ACTIVE_SESSION_KEY = "askeo_active_session";
  const ACTIVE_TEMPLATE_KEY = "askeo_active_template";
  const [sessionId, setSessionId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return null;
  });
  const [selectedTemplateIdFromStorage, setSelectedTemplateIdFromStorage] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(ACTIVE_TEMPLATE_KEY);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return null;
  });
  const [workoutEndSummary, setWorkoutEndSummary] = useState<{
    exerciseOrder: number[];
    setsTargetChanges: Record<number, number>;
    restOverrides: Record<number, number>;
    weightChanges: Record<number, number>;
    repsChanges: Record<number, number>;
    orderChanged: boolean;
  } | null>(null);
  const [customBuilderAnswers, setCustomBuilderAnswers] = useState<Record<string, any> | null>(null);
  const WORKOUT_MODE_STORAGE_KEY = "askeo_workout_mode";
  const [workoutMode, setWorkoutMode] = useState<"manual" | "ai_trainer">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(WORKOUT_MODE_STORAGE_KEY);
      if (stored === "ai_trainer" || stored === "manual") return stored;
    }
    return "manual";
  });
  const [user, setUser] = useState<{ id: number; email: string; role: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    localStorage.setItem(WORKOUT_MODE_STORAGE_KEY, workoutMode);
  }, [workoutMode, WORKOUT_MODE_STORAGE_KEY]);

  useEffect(() => {
    const ACTIVE_SESSION_KEY = "askeo_active_session";
    if (typeof window === "undefined") return;
    if (sessionId === null) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      localStorage.setItem(ACTIVE_SESSION_KEY, String(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    const ACTIVE_TEMPLATE_KEY = "askeo_active_template";
    if (typeof window === "undefined") return;
    if (selectedTemplateId === null) {
      localStorage.removeItem(ACTIVE_TEMPLATE_KEY);
    } else {
      localStorage.setItem(ACTIVE_TEMPLATE_KEY, String(selectedTemplateId));
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    let cancelled = false;
    setCheckingAuth(true);
    const stored = getAuthToken() || (typeof window !== "undefined" ? (localStorage.getItem("askeo_token") || null) : null);
    if (stored) {
      setAuthToken(stored);
    }
    withRetry(() => initApiBaseFromSettings(), { retries: 2, baseDelayMs: 300 }).then(async () => {
      if (cancelled) return;
      if (!stored) {
        setView("login");
        setCheckingAuth(false);
        return;
      }
      try {
        const me = await withRetry(() => api.me(), { retries: 2, baseDelayMs: 300 });
        setUser(me as any);
        const profile = await withRetry(() => api.getFitnessProfile(), { retries: 2, baseDelayMs: 300 }).catch(() => ({}));
        if ((profile as any) && Object.keys(profile as any).length === 0 && typeof window !== "undefined" && !localStorage.getItem("askeo_questionnaire_done")) {
          setView("questionnaire");
        } else if (sessionId !== null && (selectedTemplateId !== null || selectedTemplateIdFromStorage !== null)) {
          setSelectedTemplateId(selectedTemplateIdFromStorage);
          setView("active_workout");
        } else {
          setView("home");
        }
      } catch {
        setAuthToken(null);
        if (typeof window !== "undefined") localStorage.removeItem("askeo_token");
        setView("login");
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }).catch(() => {
      if (!cancelled) setCheckingAuth(false);
      setView("login");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    withRetry(() => api.listSettings(), { retries: 2, baseDelayMs: 300 }).then((items) => {
      if (cancelled) return;
      const mode = (items as any[])?.find((s) => s.key === "workout_mode")?.value;
      console.debug("[App] startup listSettings workout_mode=", mode, "all=", (items as any[])?.map((s: any) => s.key + "=" + s.value));
      if (mode === "ai_trainer" || mode === "manual") setWorkoutMode(mode);
      const units = (items as any[])?.find((s) => s.key === "units_preference")?.value;
      if (units === "imperial" || units === "metric") {
        setUnitsPreference(units);
      }
    }).catch((err) => {
      console.debug("[App] startup listSettings failed", err);
    });
    return () => { cancelled = true; };
  }, [user]);

  const handleLogin = async (userData?: { id: number; email: string; role: string; first_name?: string; last_name?: string }) => {
    const token = getAuthToken();
    if (token && typeof window !== "undefined") localStorage.setItem("askeo_token", token);
    try {
      const me = userData || (await api.me());
      setUser(me as any);
      setView("home");
    } catch {
      setAuthToken(null);
      if (typeof window !== "undefined") localStorage.removeItem("askeo_token");
      setView("login");
    }
  };

  const handleSignup = async (userData?: { id: number; email: string; role: string; first_name?: string; last_name?: string }) => {
    const token = getAuthToken();
    if (token && typeof window !== "undefined") localStorage.setItem("askeo_token", token);
    try {
      const me = userData || (await api.me());
      setUser(me as any);
      setView("home");
    } catch {
      setAuthToken(null);
      if (typeof window !== "undefined") localStorage.removeItem("askeo_token");
      setView("login");
    }
  };

  const logout = () => {
    api.logout().catch(() => {});
    setAuthToken(null);
    setUser(null);
    if (typeof window !== "undefined") localStorage.removeItem("askeo_token");
    navigate("login");
  };

  const DRAFT_KEY = "new-routine-draft-v1";

  const hasDraft = () => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(DRAFT_KEY) : null;
      return !!raw && JSON.parse(raw).exercises?.length > 0;
    } catch {
      return false;
    }
  };

  const navigate = (next: View) => {
    if (!user && next !== "login" && next !== "signup") {
      setView("login");
      return;
    }
    setView(next);
  };

  const switchTab = (next: Tab) => {
    if (!user) {
      setView("login");
      return;
    }
    setTab(next);
    const target = tabRootToView[next];
    if (
      target === "workouts" &&
      selectedContextId !== null &&
      hasDraft()
    ) {
      setView("template_editor");
      return;
    }
    setView(target);
  };

  const getBackTarget = (): View => {
    switch (view) {
      case "build_workout":
      case "ai_trainer":
        return "workouts";
      case "templates":
      case "template_editor":
        return "build_workout";
      case "pre_workout":
      case "library":
        return "build_workout";
      case "history":
      case "settings":
      case "profile":
      case "workouts":
      case "login":
      case "signup":
      case "active_workout":
      case "post_workout":
      case "transition_history":
      default:
        return "home";
    }
  };

  const goBack = () => {
    const target = getBackTarget();
    if (target === "home" && view === "history") {
      setTab("home");
    }
    if (target === "home" && view === "transition_history") {
      setTab("workouts");
    }
    setView(target);
  };

  const activeTab: Tab = viewToTab[view] ?? tab;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <header className="border-b border-slate-800/80 px-5 py-3 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 safe-top">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">Askeo</h1>
            {user && (
              <p className="text-[10px] text-slate-500 leading-tight -mt-0.5">
                {workoutMode === "ai_trainer" ? "AI Trainer" : "Manual Mode"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
            >
              Logout
            </button>
          )}
          {sessionId !== null && selectedTemplateId !== null && view !== "active_workout" && (
            <button
              onClick={() => navigate("active_workout")}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 border border-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-900/30 hover:bg-emerald-500 active:scale-95 transition-all"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Workout Live
            </button>
          )}
          {activeTab === "home" && user && (
            <button
              onClick={() => {
                setView("profile");
                setTab("home");
              }}
              className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 hover:border-slate-500 active:scale-95 transition-all"
              aria-label="Profile"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">
                {(() => {
                  const letter = (user as any).first_name?.[0];
                  return letter ? letter.toUpperCase() : (user.email || "U")[0].toUpperCase();
                })()}
              </div>
              <span className="text-xs font-semibold hidden sm:inline">{user.email}</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-5 max-w-lg mx-auto w-full pb-24">
        {checkingAuth ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading...</div>
        ) : view === "login" ? (
          <LoginScreen onLogin={handleLogin} onSwitch={() => setView("signup")} />
        ) : view === "signup" ? (
          <SignupScreen onSignup={handleSignup} onSwitch={() => setView("login")} />
        ) : (
          <div className="view-enter-active">
            <ErrorBoundary>
              {view === "home" && <HomeScreen />}
              {view === "build_workout" && (
                <BuildWorkoutScreen
                onBack={goBack}
                onStartWorkout={() => navigate("workouts")}
                onCreateWorkout={(ctxId) => {
                  setSelectedContextId(ctxId);
                  setSelectedTemplateId(null);
                  navigate("template_editor");
                }}
                onSelectPrebuilt={() => {
                  navigate("library");
                }}
                onAskAi={(ctxId) => {
                  alert(`AI Trainer helper for context ${ctxId} is coming next.`);
                }}
              />
            )}
            {view === "custom_builder" && (
              <CustomWorkoutBuilderScreen
                onBack={() => {
                  setCustomBuilderAnswers(null);
                  navigate("workouts");
                }}
                onSaved={() => {
                  setCustomBuilderAnswers(null);
                  navigate("workouts");
                }}
                initialAnswers={customBuilderAnswers || {}}
              />
            )}
            {view === "templates" && selectedContextId !== null && (
              <TemplateListScreen
                contextId={selectedContextId}
                onBack={() => navigate("build_workout")}
                onSelectTemplate={(tplId) => {
                  setSelectedTemplateId(tplId);
                  navigate("pre_workout");
                }}
                onCreateNew={() => {
                  setSelectedTemplateId(null);
                  navigate("template_editor");
                }}
                onEditTemplate={(tplId) => {
                  setSelectedTemplateId(tplId);
                  navigate("template_editor");
                }}
                onDeleteTemplate={async (tplId) => {
                  try {
                    await api.deleteTemplate(tplId);
                    const screen = document.querySelector('[data-testid="template-list"]');
                    if (screen) screen.dispatchEvent(new Event('refresh-list'));
                  } catch (err: any) {
                    alert(err?.message || "Delete failed. See console for details.");
                  }
                }}
              />
            )}
            {view === "template_editor" && selectedContextId !== null && (
              <TemplateEditorScreen
                contextId={selectedContextId}
                templateId={selectedTemplateId ?? undefined}
                onBack={() => navigate("workouts")}
                onSaved={() => {
                  setSelectedTemplateId(null);
                  setSelectedContextId(null);
                  navigate("workouts");
                }}
                onCancel={() => {
                  setSelectedTemplateId(null);
                  setSelectedContextId(null);
                  navigate("workouts");
                }}
              />
            )}
            {view === "pre_workout" && selectedTemplateId !== null && (
              <PreWorkoutScreen
                templateId={selectedTemplateId}
                onStart={(sid) => {
                  setSessionId(sid);
                  navigate("active_workout");
                }}
                onBack={() => navigate("workouts")}
              />
            )}
            {(view === "active_workout" || sessionId !== null) && sessionId !== null && selectedTemplateId !== null && (
              <div className={view === "active_workout" ? "" : "hidden"}>
                <ActiveWorkoutScreen
                  sessionId={sessionId}
                  templateId={selectedTemplateId}
                  workoutMode={workoutMode}
                  onEnd={(summary) => {
                    setWorkoutEndSummary(summary || null);
                    if (summary) {
                      navigate("post_workout");
                    } else {
                      setSessionId(null);
                      setSelectedTemplateId(null);
                      setSelectedTemplateIdFromStorage(null);
                      navigate("home");
                    }
                  }}
                />
              </div>
            )}
            {view === "post_workout" && sessionId !== null && (
              <PostWorkoutScreen
                sessionId={sessionId}
                templateId={selectedTemplateId}
                workoutEndSummary={workoutEndSummary}
                workoutMode={workoutMode}
                onDone={() => {
                  setSessionId(null);
                  setSelectedTemplateId(null);
                  setWorkoutEndSummary(null);
                  navigate("home");
                }}
              />
            )}
            {view === "history" && (
              <HistoryScreen onBack={goBack} />
            )}
            {view === "transition_history" && (
              <TransitionHistoryScreen onBack={goBack} />
            )}
            {view === "settings" && (
              <SettingsScreen
                onBack={goBack}
                onModeChange={setWorkoutMode}
                initialWorkoutMode={workoutMode}
                onOpenDebug={() => setView("debug_log")}
              />
            )}
            {view === "debug_log" && (
              <DebugLogScreen onBack={() => setView("settings")} />
            )}
            {view === "library" && (
              <LibraryScreen onBack={goBack} onImported={() => {}} />
            )}
            {view === "ai_trainer" && (
              <AiTrainerScreen onBack={goBack} onLaunchQuestionnaire={() => setView("questionnaire")} onOpenTransitionHistory={() => navigate("transition_history")} />
            )}
            {view === "questionnaire" && (
              <QuestionnaireScreen
                onBack={() => {
                  setView("home");
                }}
                onComplete={async (draft, answers) => {
                  const DRAFT_KEY = "new-routine-draft-v1";
                  const groups = draft?.workout_draft?.groups || [];
                  const location = (answers?.workout_location as string) || "My Workouts";
                  const focus = (answers?.focus as string) || "full_body";
                  const buildMode = (answers?.build_mode as string) || "template";

                  // Custom mode: go straight to builder, skip template generation
                  if (buildMode === "custom") {
                    setCustomBuilderAnswers(answers);
                    setView("custom_builder");
                    return;
                  }

                  // Better top-level name for localStorage fallback
                  const focusLabel = {
                    full_body: "Full Body",
                    upper_lower_split: "Upper/Lower Split",
                    push_pull_legs: "Push/Pull/Legs",
                    cardio: "Cardio",
                  }[focus] || "Full Body";

                  let savedTemplateIds: number[] = [];
                  try {
                    const contexts = await withRetry(() => api.getContexts(), { retries: 3, baseDelayMs: 500 });
                    let ctx = contexts?.find((c: any) => c.name.toLowerCase() === location.toLowerCase());
                    if (!ctx) {
                      ctx = await withRetry(() => api.createContext({ name: location, order: 0 }), { retries: 3, baseDelayMs: 500 });
                    }

                    // Create one template per day/group
                    const createPromises = groups.map(async (g: any, idx: number) => {
                      const tpl = await withRetry(() => api.createTemplate({
                        name: g.name || `${focusLabel} Day ${idx + 1}`,
                        type: "strength",
                        context_id: ctx.id,
                        order: idx,
                      }), { retries: 3, baseDelayMs: 500 });
                      const exercises = (g.exercises || []).map((ex: any, exIdx: number) => ({
                        template_id: tpl.id,
                        name: ex.name || "Exercise",
                        order: exIdx,
                        sets_target: ex.sets_target || 3,
                        reps_target: ex.reps_target || 10,
                        start_weight: getUnitsPreference() === "imperial" ? lbsToKg(ex.start_weight || 0) : ex.start_weight || 0,
                        rest_seconds: ex.rest_seconds || 90,
                        notes: ex.notes || null,
                        exercise_library_id: ex.exercise_library_id || null,
                      }));
                      await Promise.all(exercises.map((data: any) => withRetry(() => api.createExercise(data), { retries: 3, baseDelayMs: 500 })));
                      return tpl.id;
                    });
                    savedTemplateIds = await Promise.all(createPromises);
                  } catch (err) {
                    console.error("[Questionnaire] backend save failed", err);
                  }

                  // Only persist draft + mark complete if backend succeeded
                  if (savedTemplateIds.length > 0) {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(DRAFT_KEY, JSON.stringify({ groups }));
                      localStorage.setItem("askeo_questionnaire_done", "1");
                    }
                    setSelectedTemplateId(savedTemplateIds[0]);
                  } else {
                    // Clean up stale draft on failure
                    try {
                      localStorage.removeItem(DRAFT_KEY);
                      localStorage.removeItem("askeo_questionnaire_done");
                    } catch {}
                    alert("Could not save workout plan. Please check your connection and try again.");
                  }
                  setView("workouts");
                }}
              />
            )}
            {view === "workouts" && (
              <WorkoutsScreen
                onStartWorkout={(tplId) => {
                  setSelectedTemplateId(tplId);
                  navigate("pre_workout");
                }}
                onBuildWorkout={() => navigate("build_workout")}
                onSelectPrebuilt={() => navigate("library")}
                onBack={goBack}
                onEditTemplate={(tplId, ctxId) => {
                  setSelectedContextId(ctxId);
                  setSelectedTemplateId(tplId);
                  navigate("template_editor");
                }}
                onOpenTransitionHistory={() => navigate("transition_history")}
              />
            )}
            {view === "profile" && (
              <ProfileScreen
                onBack={goBack}
                onOpenSettings={() => {
                  setView("settings");
                  setTab("settings");
                }}
                user={user}
              />
            )}
          </ErrorBoundary>
        </div>
      )}
      </main>

      {user && <TabBar active={activeTab} onChange={switchTab} />}
    </div>
  );
}

function AiTrainerScreen({ onBack, onLaunchQuestionnaire, onOpenTransitionHistory }: { onBack: () => void; onLaunchQuestionnaire: () => void; onOpenTransitionHistory?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">AI Trainer</h2>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50">Back</button>
      </div>
      <p className="text-slate-400 text-sm">Your AI coaching assistant is coming soon. For now, you can re-run the questionnaire to generate a new workout plan.</p>
      <button
        onClick={onLaunchQuestionnaire}
        className="w-full rounded-xl border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm font-bold text-indigo-200 hover:border-indigo-500/60 transition-colors"
      >
        Generate New Workout Plan
      </button>
      {onOpenTransitionHistory && (
        <button
          onClick={onOpenTransitionHistory}
          className="w-full rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-bold text-slate-200 hover:border-indigo-500/40 transition-colors"
        >
          View Progression Transitions
        </button>
      )}
    </div>
  )
}

// Admin login on first launch / reinstall:
// email: phillip@askeo.fit
// password: AskeoAdmin2026!
