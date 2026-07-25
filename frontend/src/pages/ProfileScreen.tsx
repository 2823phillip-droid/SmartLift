import { useEffect, useState } from "react";
import { api } from "../api";

type Profile = {
  username?: string;
  email?: string;
  fitness_goals?: string;
};

export default function ProfileScreen({ onBack, onOpenSettings }: { onBack: () => void; onOpenSettings: () => void }) {
  const [profile, setProfile] = useState<Profile>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listSettings().then((items: any[]) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      items.forEach((s: any) => { if (s.value != null) map[s.key] = s.value; });
      setProfile({
        username: map.profile_username || "",
        email: map.profile_email || "",
        fitness_goals: map.profile_fitness_goals || "",
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.setSetting("profile_username", profile.username || "");
      await api.setSetting("profile_email", profile.email || "");
      await api.setSetting("profile_fitness_goals", profile.fitness_goals || "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-200">Account</div>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Username</label>
            <input
              type="text"
              value={profile.username || ""}
              onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
              placeholder="@username"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Email</label>
            <input
              type="email"
              value={profile.email || ""}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-200">Fitness Goals</div>
        <textarea
          value={profile.fitness_goals || ""}
          onChange={(e) => setProfile((p) => ({ ...p, fitness_goals: e.target.value }))}
          placeholder="Strength, Hypertrophy, Endurance, Weight Loss..."
          rows={4}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm resize-none placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-200">Billing</div>
        <p className="text-xs text-slate-400">SmartLift billing, if applicable, is handled through the App Store.</p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-40"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save Profile"}
      </button>
    </div>
  );
}
