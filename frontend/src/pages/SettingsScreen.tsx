import { useEffect, useState } from "react";
import { api, getApiBase, initApiBaseFromSettings } from "../api";
import BodyWeightQuickLog from "../components/BodyWeightQuickLog";

type SettingItem = { key: string; value: string | null };

export default function SettingsScreen({ onBack, onModeChange }: { onBack: () => void; onModeChange?: (mode: "manual" | "ai_trainer") => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [apiBaseState, setApiBaseState] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSettingsError(null);
    initApiBaseFromSettings().then(async () => {
      if (cancelled) return;
      setApiBaseState(getApiBase());
      try {
        const items = await api.listSettings();
        const map: Record<string, string> = {};
        items.forEach((s: SettingItem) => { if (s.value != null) map[s.key] = s.value; });
        setSettings(map);
      } catch (err) {
        if (!cancelled) setSettingsError((err as Error)?.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const save = async (key: string) => {
    setSaving(key);
    setSaved(null);
    await api.setSetting(key, settings[key] ?? "");
    setSaving(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
  };

  const updateApiBase = async () => {
    setSaving("api_base");
    setSaved(null);
    const raw = (settings["api_base"] || "").trim();
    if (!raw) return setSaving(null);
    const candidate = raw.replace(/\/$/, "");
    try {
      const test = await fetch(`${candidate}/settings/${encodeURIComponent("api_base")}`);
      if (!test.ok) throw new Error("unreachable");
    } catch {
      setSaving(null);
      setSaved("api_base_bad");
      setTimeout(() => setSaved(null), 2500);
      return;
    }
    await api.setSetting("api_base", candidate);
    setSaving(null);
    setSaved("api_base");
    setTimeout(() => setSaved(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
        >
          Back
        </button>
      </div>
      <div className="text-xs text-slate-500">API base: {apiBaseState || "(none)"}</div>
      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading settings...</div>
      ) : settingsError ? (
        <div className="text-center space-y-3 py-10">
          <p className="text-red-400 text-sm">{settingsError}</p>
          <button
            onClick={() => {
              setSettingsError(null);
              initApiBaseFromSettings().then(() => setApiBaseState(getApiBase()));
              api.listSettings().then((items: SettingItem[]) => {
                const map: Record<string, string> = {};
                items.forEach((s) => { if (s.value != null) map[s.key] = s.value; });
                setSettings(map);
              }).catch((err) => setSettingsError(err?.message || "Failed again"));
            }}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Global Rest Timer */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-semibold text-sm">Global Rest Timer</div>
                <div className="text-xs text-slate-500">Default rest between sets when no routine/directory overrides it.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={settings["global_rest_seconds"] ?? "90"}
                onChange={(e) => setSettings((s) => ({ ...s, global_rest_seconds: e.target.value }))}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-lg font-semibold tabular-nums
                           focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
              <button
                onClick={() => save("global_rest_seconds")}
                disabled={saving === "global_rest_seconds"}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving === "global_rest_seconds" ? "Saving..." : saved === "global_rest_seconds" ? "Saved" : "Save"}
              </button>
            </div>
            <div className="flex justify-center gap-2">
              {[60, 90, 120, 150, 180].map((s) => (
                <button
                  key={s}
                  onClick={() => setSettings((prev) => ({ ...prev, global_rest_seconds: String(s) }))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                    Number(settings["global_rest_seconds"] ?? 90) === s
                      ? "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {/* Body Weight Quick Log */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a7 7 0 1118 0l-3-9M6 4h12" />
              </svg>
              <div>
                <div className="font-semibold text-sm">Body Weight</div>
                <div className="text-xs text-slate-500">Quick log from Settings</div>
              </div>
            </div>
            <BodyWeightQuickLog />
          </div>

          {/* API Base URL */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              <div>
                <div className="font-semibold text-sm">API Base URL</div>
                <div className="text-xs text-slate-500">Where your frontend sends requests</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings["api_base"] ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, api_base: e.target.value }))}
                placeholder="http://192.168.1.111:8000/api"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              />
              <button
                onClick={updateApiBase}
                disabled={saving === "api_base"}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving === "api_base" ? "Saving..." : saved === "api_base" ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* Workout Mode */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div>
                <div className="font-semibold text-sm">Workout Mode</div>
                <div className="text-xs text-slate-500">Manual = you control template updates. AI Trainer = algorithm adjusts future routines.</div>
              </div>
            </div>
            <div className="flex gap-2">
              {(["manual", "ai_trainer"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSettings((s) => ({ ...s, workout_mode: mode }));
                    save("workout_mode").then(() => onModeChange?.(mode));
                  }}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                    (settings["workout_mode"] ?? "manual") === mode
                      ? mode === "ai_trainer"
                        ? "border-emerald-500 bg-emerald-950/50 text-emerald-300"
                        : "border-indigo-500 bg-indigo-950/50 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {mode === "manual" ? "Manual" : "AI Trainer"}
                </button>
              ))}
            </div>
          </div>

          {/* AI Coach */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div>
                <div className="font-semibold text-sm">AI Coach</div>
                <div className="text-xs text-slate-500">Next-suggestion and post-workout summaries</div>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings["ai_coach_enabled"] ?? "false"}
                onChange={(e) => setSettings((s) => ({ ...s, ai_coach_enabled: e.target.value }))}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              />
              <button
                onClick={() => save("ai_coach_enabled")}
                disabled={saving === "ai_coach_enabled"}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving === "ai_coach_enabled" ? "Saving..." : saved === "ai_coach_enabled" ? "Saved" : "Save"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Use true/false. This is a lightweight toggle now; AI provider selection can follow.</p>
          </div>

          {/* Placeholder for future settings */}
          <p className="text-xs text-slate-600 text-center pt-2">More settings coming soon.</p>
        </div>
      )}
    </div>
  );
}
