import { useEffect, useRef, useState } from "react";
import { api, getApiBase, initApiBaseFromSettings } from "../api";
import BodyWeightQuickLog from "../components/BodyWeightQuickLog";
import { getUnitsPreference, setUnitsPreference } from "../utils/units";

type SettingItem = { key: string; value: string | null };

const STORAGE_KEY_SETTINGS = "askeo_workout_mode";

export default function SettingsScreen({ onBack, onModeChange, initialWorkoutMode, onOpenDebug }: { onBack: () => void; onModeChange?: (mode: "manual" | "ai_trainer") => void; initialWorkoutMode?: "manual" | "ai_trainer"; onOpenDebug?: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [apiBaseState, setApiBaseState] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [workoutMode, setWorkoutModeState] = useState<"manual" | "ai_trainer">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored === "ai_trainer" || stored === "manual") return stored;
    }
    return initialWorkoutMode ?? "manual";
  });

  const runLoad = async () => {
    const id = ++loadIdRef.current;
    setLoading(true);
    setSettingsError(null);
    try {
      try {
        await initApiBaseFromSettings();
      } catch {
        // non-fatal: request() still falls back to LAN/env if apiBase is missing
      }
      if (id !== loadIdRef.current) return;
      setApiBaseState(getApiBase());
      let items: SettingItem[];
      try {
        items = (await api.listSettings()) as SettingItem[];
      } catch (err) {
        const errAny = err as any;
        const msg = errAny?.status && errAny?.url ? `${errAny.message} at ${errAny.url}` : (err as Error)?.message || "Failed to load settings";
        const raw = (err as Error)?.stack || errAny?.message || "unknown";
        console.error("[SettingsScreen] raw", JSON.stringify({name: errAny?.name, message: errAny?.message, url: errAny?.url, status: errAny?.status, stack: raw}));
        if (id === loadIdRef.current) {
          setSettingsError(msg);
        }
        throw err;
      }
      console.debug("[SettingsScreen] load", items);
      if (id !== loadIdRef.current) return;
      const map: Record<string, string> = {};
      items.forEach((s) => { if (s.value != null) map[s.key] = s.value; });
      setSettings(map);
      if (map.workout_mode === "ai_trainer" || map.workout_mode === "manual") {
        console.debug("[SettingsScreen] load workout_mode", map.workout_mode);
        setWorkoutModeState(map.workout_mode);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_SETTINGS, map.workout_mode);
        }
      } else {
        console.debug("[SettingsScreen] load missing workout_mode");
      }
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  };

  const loadIdRef = useRef(0);

  useEffect(() => {
    runLoad();
  }, []);

  const save = async (key: string, value?: string) => {
    const mode = value ?? settings[key] ?? "";
    setSaving(key);
    setSaved(null);
    try {
      await api.setSetting(key, mode);
      setSaved(key);
      setSettingsError(null);
      setTimeout(() => setSaved(null), 1500);
    } catch (err) {
      const msg = (err as Error)?.message || `Failed to save ${key}`;
      setSettingsError(msg);
      console.error("[SettingsScreen] save error", key, msg);
    } finally {
      setSaving(null);
    }
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
        <div className="flex items-center gap-2">
          {onOpenDebug && (
            <button
              onClick={onOpenDebug}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800"
            >
              Debug Log
            </button>
          )}
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50"
          >
            Back
          </button>
        </div>
      </div>
      <div className="text-xs text-slate-500">API base: {apiBaseState || "(none)"}</div>
      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading settings...</div>
      ) : settingsError ? (
        <div className="text-center space-y-3 py-10">
          <p className="text-red-400 text-sm font-mono break-words">{settingsError}</p>
          <p className="text-slate-500 text-xs">API: {apiBaseState || "(none)"}</p>
          <button
            onClick={runLoad}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Units Preference */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a7 7 0 1118 0l-3-9M6 4h12" />
              </svg>
              <div>
                <div className="font-semibold text-sm">Units</div>
                <div className="text-xs text-slate-500">Used for weight and height across the app.</div>
              </div>
            </div>
            <div className="flex gap-2">
              {(["imperial", "metric"] as const).map((u) => (
                <button
                  key={u}
                  onClick={async () => {
                    setUnitsPreference(u);
                    setSettings((s) => ({ ...s, units_preference: u }));
                    await save("units_preference", u);
                  }}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${(settings["units_preference"] || getUnitsPreference()) === u ? u === "imperial" ? "border-indigo-500 bg-indigo-950/50 text-indigo-300" : "border-emerald-500 bg-emerald-950/50 text-emerald-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
                >
                  {u === "imperial" ? "Pounds & Inches" : "Kg & Cm"}
                </button>
              ))}
            </div>
          </div>

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
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-lg font-semibold tabular-nums focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
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
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${Number(settings["global_rest_seconds"] ?? 90) === s ? "border-indigo-500 bg-indigo-950/50 text-indigo-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
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
                placeholder="https://askeo.fit/api"
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
                  onClick={async () => {
                    console.debug("[SettingsScreen] workout_mode click", mode, "current=", workoutMode);
                    setWorkoutModeState(mode);
                    setSettings((s) => ({ ...s, workout_mode: mode }));
                    await save("workout_mode", mode);
                    onModeChange?.(mode);
                    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_SETTINGS, mode);
                    console.debug("[SettingsScreen] workout_mode saved", mode);
                  }}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${workoutMode === mode ? mode === "ai_trainer" ? "border-emerald-500 bg-emerald-950/50 text-emerald-300" : "border-indigo-500 bg-indigo-950/50 text-indigo-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
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

          {/* Coach Configuration */}
          <CoachSettingsSection />
        </div>
      )}
    </div>
  );
}

function CoachSettingsSection() {
  const [phase, setPhase] = useState("linear");
  const [week, setWeek] = useState(1);
  const [cycle, setCycle] = useState(4);
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>(["linear", "double", "percentage", "autoregulated"]);

  useEffect(() => {
    api.getCoachState().then((data) => {
      if (data) {
        if (data.coach_phase) setPhase(data.coach_phase);
        if (data.coach_week_in_block) setWeek(data.coach_week_in_block);
        if (data.coach_periodization_cycle_weeks) setCycle(data.coach_periodization_cycle_weeks);
        if (data.coach_custom_phase_order) setCustomOrder([...(data.coach_custom_phase_order)]);  // pyright: ignore [reportImplicitAny]
      }
      setLoading(false);
    }).catch((err: any) => {
      setLoadError(err?.message || "Failed to load coach settings");
      setLoading(false);
    });
  }, []);

  const move = (idx: number, dir: -1 | 1) => {
    setCustomOrder((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const toggle = (p: string) => {
    setCustomOrder((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await api.coachOverride({ phase, week_in_block: week, periodization_cycle_weeks: cycle, custom_phase_order: customOrder });
      setSaved(true);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save coach settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      {loadError && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-amber-300 leading-relaxed flex-1">{loadError}</p>
          <button onClick={() => setLoadError(null)} className="text-amber-400 hover:text-amber-200 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <div>
          <div className="font-semibold text-sm">Coach Configuration</div>
          <div className="text-xs text-slate-500">Defaults for progression blocks and deload cadence</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Starting phase</div>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50"
          >
            <option value="linear">Linear</option>
            <option value="double">Double</option>
            <option value="percentage">Percentage</option>
            <option value="autoregulated">Autoregulated</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Block length (weeks)</div>
          <input
            type="number"
            value={cycle}
            onChange={(e) => setCycle(Number(e.target.value || 0))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Progression order</div>
        <div className="space-y-2">
          {customOrder.map((p, idx) => (
            <div key={p} className="flex items-center gap-2">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs disabled:opacity-30">↑</button>
              <span className="flex-1 rounded-xl border border-indigo-700 bg-indigo-950/30 px-3 py-2 text-xs font-semibold text-indigo-200">{p}</span>
              <button onClick={() => move(idx, 1)} disabled={idx === customOrder.length - 1} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs disabled:opacity-30">↓</button>
              <button onClick={() => toggle(p)} className="rounded-lg border border-rose-700 bg-rose-950/20 px-2 py-1.5 text-xs text-rose-200">✕</button>
            </div>
          ))}
          {!customOrder.includes("linear") && <button onClick={() => toggle("linear")} className="text-[10px] text-indigo-400">+ Linear</button>}
          {!customOrder.includes("double") && <button onClick={() => toggle("double")} className="text-[10px] text-indigo-400 ml-2">+ Double</button>}
          {!customOrder.includes("percentage") && <button onClick={() => toggle("percentage")} className="text-[10px] text-indigo-400 ml-2">+ Percentage</button>}
          {!customOrder.includes("autoregulated") && <button onClick={() => toggle("autoregulated")} className="text-[10px] text-indigo-400 ml-2">+ Autoregulated</button>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400">Deload triggers when your load hits 100%, or every {cycle} weeks as a fallback.</div>
          <div className="text-[10px] text-slate-500">Load is based on recent effort and volume</div>
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-2xl bg-indigo-600 px-5 py-4 text-base font-semibold hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-40"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save Coach Settings"}
      </button>
      {saveError && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-rose-300 leading-relaxed flex-1">{saveError}</p>
          <button onClick={() => setSaveError(null)} className="text-rose-400 hover:text-rose-200 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
