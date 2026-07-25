import { Home, Dumbbell, Bot, History, Settings } from "lucide-react";

export type Tab = "home" | "workouts" | "ai" | "history" | "settings";

const tabs: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "workouts", label: "Workouts", Icon: Dumbbell },
  { id: "ai", label: "AI Trainer", Icon: Bot },
  { id: "history", label: "History", Icon: History },
  { id: "settings", label: "Settings", Icon: Settings },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export default function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 pb-safe">
      <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-1">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-colors ${
                isActive ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
              }`}
              aria-label={label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
