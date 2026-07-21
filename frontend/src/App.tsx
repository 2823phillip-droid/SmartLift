import { useEffect, useState } from "react";
import { api, initApiBaseFromSettings } from "./api";
import HomeScreen from "./pages/HomeScreen";

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
import ErrorBoundary from "./components/ErrorBoundary";

type View = "home" | "quick_start" | "build_workout" | "templates" | "template_editor" | "pre_workout" | "active_workout" | "post_workout" | "history" | "settings" | "library";

const titleMap: Record<View, string> = {
  home: "Coach",
  quick_start: "Start a Workout",
  build_workout: "Build a Workout",
  templates: "Routines",
  template_editor: "Routine",
  pre_workout: "Ready",
  active_workout: "Workout",
  post_workout: "Complete",
  history: "History",
  settings: "Settings",
  library: "Prebuilt Workouts",
};

export default function App() {
  const [view, setView] = useState<View>("home");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  useEffect(() => {
    initApiBaseFromSettings();
  }, []);

  const renderContent = () => {
    switch (view) {
      case "home":
        return (
          <HomeScreen
            onQuickStart={() => setView("quick_start")}
            onBuildWorkout={() => setView("build_workout")}
            onHistory={() => setView("history")}
            onLibrary={() => setView("library")}
            onSeed={async () => {
              await api.seed();
              window.location.reload();
            }}
          />
        );
      case "quick_start":
        return (
          <TemplateGroupListScreen
            onBack={() => setView("home")}
            onStartTemplate={(tplId) => {
              setSelectedTemplateId(tplId);
              setView("pre_workout");
            }}
            onEditTemplate={(tplId, ctxId) => {
              setSelectedContextId(ctxId);
              setSelectedTemplateId(tplId);
              setView("template_editor");
            }}
            onDeleteTemplate={async (tplId) => {
              await api.deleteTemplate(tplId);
            }}
            onBuildWorkout={() => setView("build_workout")}
          />
        );
      case "build_workout":
        return (
          <BuildWorkoutScreen
            onBack={() => setView("home")}
            onStartWorkout={() => setView("quick_start")}
            onCreateWorkout={(ctxId) => {
              setSelectedContextId(ctxId);
              setSelectedTemplateId(null);
              setView("template_editor");
            }}
            onSelectPrebuilt={() => {
              setView("library");
            }}
            onAskAi={(ctxId) => {
              alert(`AI Trainer helper for context ${ctxId} is coming next.`);
            }}
          />
        );
      case "templates":
        return selectedContextId !== null ? (
          <TemplateListScreen
            contextId={selectedContextId}
            onBack={() => setView("build_workout")}
            onSelectTemplate={(tplId) => {
              setSelectedTemplateId(tplId);
              setView("pre_workout");
            }}
            onCreateNew={() => {
              setSelectedTemplateId(null);
              setView("template_editor");
            }}
            onEditTemplate={(tplId) => {
              setSelectedTemplateId(tplId);
              setView("template_editor");
            }}
            onDeleteTemplate={async (tplId) => {
              await api.deleteTemplate(tplId);
              const screen = document.querySelector('[data-testid="template-list"]');
              if (screen) screen.dispatchEvent(new Event('refresh-list'));
            }}
          />
        ) : null;
      case "template_editor":
        return selectedContextId !== null ? (
          <TemplateEditorScreen
            contextId={selectedContextId}
            templateId={selectedTemplateId ?? undefined}
            onBack={() => setView("templates")}
            onSaved={(_tplId) => {
              setSelectedTemplateId(null);
              setView("templates");
            }}
          />
        ) : null;
      case "pre_workout":
        return selectedTemplateId !== null ? (
          <PreWorkoutScreen
            templateId={selectedTemplateId}
            onStart={(sid) => {
              setSessionId(sid);
              setView("active_workout");
            }}
            onBack={() => setView("quick_start")}
          />
        ) : null;
      case "active_workout":
        return sessionId !== null && selectedTemplateId !== null ? (
          <ActiveWorkoutScreen
            sessionId={sessionId}
            templateId={selectedTemplateId}
            onEnd={() => setView("post_workout")}
          />
        ) : null;
      case "post_workout":
        return sessionId !== null ? (
          <PostWorkoutScreen
            sessionId={sessionId}
            onDone={() => {
              setSessionId(null);
              setSelectedTemplateId(null);
              setView("quick_start");
            }}
          />
        ) : null;
      case "history":
        return <HistoryScreen onBack={() => setView("home")} />;
      case "settings":
        return <SettingsScreen onBack={() => setView("home")} />;
      case "library":
        return <LibraryScreen onBack={() => setView("home")} onImported={() => {}} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col safe-top safe-bottom">
      <header className="border-b border-slate-800/80 px-5 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-sm font-bold">C</div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-tight">Coach</h1>
            <p className="text-[10px] text-slate-500 leading-tight -mt-0.5">AI Trainer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{titleMap[view]}</span>
          <button
            onClick={() => setView("settings")}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1 p-5 max-w-lg mx-auto w-full">
        <div className="view-enter-active">
          <ErrorBoundary>
            {renderContent()}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
