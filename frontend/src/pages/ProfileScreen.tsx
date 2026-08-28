import { useEffect, useState } from "react";
import { api, withRetry, getApiBase, getAuthToken } from "../api";

const GOAL_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "muscle", label: "Muscle" },
  { value: "endurance", label: "Endurance" },
  { value: "weight_loss", label: "Weight Loss" },
  { value: "mobility", label: "Mobility" },
  { value: "appearance", label: "Appearance" },
  { value: "general_fitness", label: "General Fitness" },
];

type Profile = {
  username?: string;
  email?: string;
  fitness_goals?: string;
  goals?: string[];
};

export default function ProfileScreen({ onBack, onOpenSettings, user }: { onBack: () => void; onOpenSettings: () => void; user: { email?: string; first_name?: string; last_name?: string } | null }) {
  const [profile, setProfile] = useState<Profile>({
    username: user?.first_name || "",
    email: user?.email || "",
    fitness_goals: "",
    goals: [],
  });
  const [loading, setLoading] = useState(true);
  const [editingGoals, setEditingGoals] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsDraft, setGoalsDraft] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    withRetry(() => api.listSettings(), { retries: 2, baseDelayMs: 300 }).then((items: any[]) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      items.forEach((s: any) => { if (s.value != null) map[s.key] = s.value; });
      const goals = map.profile_fitness_goals || "";
      setProfile({
        username: user?.first_name || map.profile_username || "",
        email: user?.email || map.profile_email || "",
        fitness_goals: goals,
      });
      setGoalsDraft([]);
      setEditingGoals(false);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    withRetry(() => api.getFitnessProfile(), { retries: 2, baseDelayMs: 300 }).then((fp: any) => {
      if (cancelled) return;
      const goals = Array.isArray(fp?.goal) ? fp.goal : [];
      setProfile((p) => ({ ...p, goals }));
      setGoalsDraft(goals);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const displayValue = (value: string | undefined) => (value && value.trim().length ? value.trim() : "—");

  const startEditGoals = () => {
    setGoalsDraft(profile.goals || []);
    setEditingGoals(true);
  };

  const cancelEditGoals = () => {
    setGoalsDraft(profile.goals || []);
    setEditingGoals(false);
  };

  const saveGoals = async () => {
    setSavingGoals(true);
    try {
      await withRetry(() => fetch(`${getApiBase()}/profile/fitness`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() || ""}`,
        },
        body: JSON.stringify({ goal: goalsDraft }),
      }).then((r: any) => r.json()), { retries: 2, baseDelayMs: 300 });
      setProfile((p) => ({ ...p, goals: goalsDraft }));
      setEditingGoals(false);
    } finally {
      setSavingGoals(false);
    }
  };

  const toggleGoal = (value: string) => {
    setGoalsDraft((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Profile</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            App Settings
          </button>
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">Loading profile...</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-200">Account</div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-widest">First name: </span>
                <span className="text-slate-300">{displayValue(profile.username || user?.first_name)}</span>
              </div>
              {user?.last_name && (
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-widest">Last name: </span>
                  <span className="text-slate-300">{displayValue(user.last_name)}</span>
                </div>
              )}
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-widest">Email: </span>
                <span className="text-slate-300">{displayValue(profile.email || user?.email)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">Fitness Goals</div>
              {editingGoals ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelEditGoals}
                    disabled={savingGoals}
                    className="text-xs text-slate-300 hover:text-slate-100 px-2 py-1 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveGoals}
                    disabled={savingGoals}
                    className="text-xs text-slate-900 bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    {savingGoals ? "Saving..." : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEditGoals}
                  className="text-xs text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded-lg border border-indigo-500/40 hover:border-indigo-400 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {editingGoals ? (
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => toggleGoal(value)}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      goalsDraft.includes(value)
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(profile.goals && profile.goals.length > 0) ? (
                  profile.goals.map((g) => (
                    <span key={g} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-900/40 border border-indigo-700/60 text-indigo-200">
                      {GOAL_OPTIONS.find((o) => o.value === g)?.label || g}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No goals set</span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-200">Billing</div>
            <p className="text-xs text-slate-400">Askeo billing, if applicable, is handled through the App Store.</p>
          </div>
        </>
      )}
    </div>
  );
}
