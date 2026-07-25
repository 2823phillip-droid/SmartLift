import { useEffect, useState } from "react";
import { api } from "./api";
import HomeScreen from "./pages/HomeScreen";
import WorkoutsScreen from "./pages/WorkoutsScreen";
import TemplateGroupListScreen from "./pages/TemplateGroupListScreen";
import TemplateListScreen from "./pages/TemplateListScreen";
import TemplateEditorScreen from "./pages/TemplateEditorScreen";
import BuildWorkoutScreen from "./pages/BuildWorkoutScreen";
import PreWorkoutScreen from "./pages/PreWorkoutScreen";
import ActiveWorkoutScreen from "./pages/ActiveWorkoutScreen";
import PostWorkoutScreen from "./pages/PostWorkoutScreen";
import HistoryScreen from "./pages/HistoryScreen";
import SettingsScreen from "./pages/SettingsScreen";
import LibraryScreen from "./pages/LibraryScreen";
import ProfileScreen from "./pages/ProfileScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import TabBar, { type Tab } from "./components/TabBar";

type View =
  | "home"
  | "quick_start"
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
  | "profile";

const tabRootToView: Record<Tab, View> = {
  home: "home",
  workouts: "workouts",
  ai: "ai_trainer",
  history: "history",
  settings: "settings",
};

const viewToTab: Record<View, Tab | null> = {
  home: "home",
  quick_start: "workouts",
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
};

export default function App() {
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<Tab>("home");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [workoutEndSummary, setWorkoutEndSummary] = useState<{
    exerciseOrder: number[];
    setsTargetChanges: Record<number, number>;
    restOverrides: Record<number, number>;
    weightChanges: Record<number, number>;
    repsChanges: Record<number, number>;
    orderChanged: boolean;
  } | null>(null);
  const [workoutMode, setWorkoutMode] = useState<"manual" | "ai_trainer">("manual");

  useEffect(() => {
    let cancelled = false;
    api.listSettings().then((items) => {
      if (cancelled) return;
      const mode = (items as any[])?.find((s) => s.key === "workout_mode")?.value;
      if (mode === "ai_trainer") setWorkoutMode("ai_trainer");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const navigate = (next: View) => {
    setView(next);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    navigate(tabRootToView[next]);
  };

  const goBack = () => {
    if (view === "history") {
      switchTab("home");
    } else {
      setView("home");
      setTab("home");
    }
  };

  const activeTab: Tab = viewToTab[view] ?? tab;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <header className="border-b border-slate-800/80 px-5 py-3 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 safe-top">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-sm font-bold">S</div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">SmartLift</h1>
            <p className="text-[10px] text-slate-500 leading-tight -mt-0.5">
              {workoutMode === "ai_trainer" ? "AI Trainer" : "Manual Mode"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {activeTab === "home" && (
              <button
                onClick={() => {
                  setView("profile");
                  setTab("home");
                }}
                className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-slate-200 hover:border-slate-500 active:scale-95 transition-all"
                aria-label="Profile"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white">
                  P
                </div>
                <span className="text-xs font-semibold hidden sm:inline">Profile</span>
              </button>
            )}
        </div>
      </header>

      <main className="flex-1 p-5 max-w-lg mx-auto w-full pb-24">
        <div className="view-enter-active">
          <ErrorBoundary>
            {view === "home" && <HomeScreen />}
            {view === "quick_start" && (
              <TemplateGroupListScreen
                onBack={goBack}
                onStartTemplate={(tplId) => {
                  setSelectedTemplateId(tplId);
                  navigate("pre_workout");
                }}
                onEditTemplate={(tplId, ctxId) => {
                  setSelectedContextId(ctxId);
                  setSelectedTemplateId(tplId);
                  navigate("template_editor");
                }}
                onDeleteTemplate={async (tplId) => {
                  await api.deleteTemplate(tplId);
                }}
                onBuildWorkout={() => navigate("build_workout")}
              />
            )}
            {view === "build_workout" && (
              <BuildWorkoutScreen
                onBack={goBack}
                onStartWorkout={() => navigate("quick_start")}
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
                  await api.deleteTemplate(tplId);
                  const screen = document.querySelector('[data-testid="template-list"]');
                  if (screen) screen.dispatchEvent(new Event('refresh-list'));
                }}
              />
            )}
            {view === "template_editor" && selectedContextId !== null && (
              <TemplateEditorScreen
                contextId={selectedContextId}
                templateId={selectedTemplateId ?? undefined}
                onBack={() => navigate("templates")}
                onSaved={(_tplId) => {
                  setSelectedTemplateId(null);
                  navigate("templates");
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
                onBack={() => navigate("quick_start")}
              />
            )}
            {(view === "active_workout" || sessionId !== null) && sessionId !== null && selectedTemplateId !== null && (
              <div className={view === "active_workout" ? "" : "hidden"}>
                <ActiveWorkoutScreen
                  sessionId={sessionId}
                  templateId={selectedTemplateId}
                  onEnd={(summary) => {
                    setWorkoutEndSummary(summary || null);
                    navigate("post_workout");
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
            {view === "settings" && (
              <SettingsScreen onBack={goBack} onModeChange={setWorkoutMode} />
            )}
            {view === "library" && (
              <LibraryScreen onBack={goBack} onImported={() => {}} />
            )}
            {view === "ai_trainer" && (
              <AiTrainerScreen onBack={goBack} />
            )}
            {view === "workouts" && (
              <WorkoutsScreen
                onStartWorkout={() => navigate("quick_start")}
                onBuildWorkout={() => navigate("build_workout")}
                onSelectPrebuilt={() => navigate("library")}
                onBack={goBack}
              />
            )}
            {view === "profile" && (
              <ProfileScreen
                onBack={goBack}
                onOpenSettings={() => {
                  setView("settings");
                  setTab("settings");
                }}
              />
            )}
          </ErrorBoundary>
        </div>
      </main>

      <TabBar active={activeTab} onChange={switchTab} />
    </div>
  );
}

function AiTrainerScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">AI Trainer</h2>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50">Back</button>
      </div>
      <p className="text-slate-400 text-sm">Your AI coaching assistant. Coming soon.</p>
    </div>
  );
}
