import { useEffect, useRef, useState } from "react";
import { api, getApiBase, initApiBaseFromSettings } from "../api";
import BodyWeightQuickLog from "../components/BodyWeightQuickLog";
import { getUnitsPreference, setUnitsPreference } from "../utils/units";
import { BUILD_INFO } from "../build-info";

type SettingItem = { key: string; value: string | null };

export default function SettingsScreen({ onBack, onOpenDebug }: { onBack: () => void; onOpenDebug?: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [apiBaseState, setApiBaseState] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [checkMatch, setCheckMatch] = useState<boolean | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const loadIdRef = useRef(0);

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
      if (map["units_preference"] === "imperial" || map["units_preference"] === "metric") {
        console.debug("[SettingsScreen] load units_preference", map["units_preference"]);
        setSettings((s) => ({ ...s, units_preference: map["units_preference"] }));
      } else {
        console.debug("[SettingsScreen] load missing units_preference");
      }
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    runLoad();
  }, []);

  const save = async (key: string, value?: string) => {
    const mode = value ?? settings[key] ?? "";
    setSaving(key);
    setSaved(null);
    setSettingsError(null);
    try {
      await api.setSetting(key, mode);
      setSaved(key);
      if (key === "units_preference") {
        setUnitsPreference(mode as "metric" | "imperial");
      }
      if (key === "api_base") {
        setApiBaseState(getApiBase());
      }
    } catch (err) {
      setSettingsError((err as Error)?.message || "Save failed");
    } finally {
      if (key !== "api_base") setTimeout(() => setSaved(null), 2000);
    }
  };

  const updateApiBase = async () => {
    const candidate = settings["api_base"]?.trim() || "";
    if (!candidate) {
      setSettingsError("Enter an API base URL");
      return;
    }
    if (!candidate.startsWith("http")) {
      setSettingsError("URL must start with http:// or https://");
      return;
    }
    try {
      await api.request("GET", `${candidate.replace(/\/+$/, "")}/health`, { retries: 1, baseDelayMs: 300 });
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

  const handleCheckVersion = async () => {
    setCheckingVersion(true);
    setCheckMatch(null);
    setCheckError(null);
    try {
      const backend = await api.getVersion();
      const backendCommit = backend?.commit;
      if (!backendCommit) {
        setCheckError("Backend returned no commit");
        return;
      }
      setCheckMatch(backendCommit === BUILD_INFO.commit);
    } catch (err) {
      setCheckError((err as Error)?.message || "Failed to contact backend");
    } finally {
      setCheckingVersion(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <div className="flex items-center gap-2">
          {onOpenDebug && (
            <button
              onClick={onOpenDebug}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 active:scale-[0.98] transition-all"
            >
              Debug
            </button>
          )}
        </div>
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
        {settingsError && (
          <p className="text-xs text-rose-400 text-center">{settingsError}</p>
        )}
        {saved && saved !== "api_base_bad" && (
          <p className="text-xs text-emerald-400 text-center">Saved</p>
        )}
      </div>

      {/* Body Weight */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <div>
            <div className="font-semibold text-sm">Body Weight</div>
            <div className="text-xs text-slate-500">Track your current body weight for relative strength</div>
          </div>
        </div>
        <BodyWeightQuickLog />
      </div>

      {/* Units */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          </svg>
          <div>
            <div className="font-semibold text-sm">Units</div>
            <div className="text-xs text-slate-500">Weight and distance units</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save("units_preference", "imperial")}
            disabled={saving === "units_preference"}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${settings["units_preference"] === "imperial" ? "border-emerald-500 bg-emerald-950/50 text-emerald-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
          >
            Pounds (lbs)
          </button>
          <button
            onClick={() => save("units_preference", "metric")}
            disabled={saving === "units_preference"}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${settings["units_preference"] === "metric" ? "border-emerald-500 bg-emerald-950/50 text-emerald-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
          >
            Kilograms (kg)
          </button>
        </div>
      </div>

      {/* Version Check */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <div className="font-semibold text-sm">Version Check</div>
              <div className="text-xs text-slate-500">Compare app build with deployed backend</div>
            </div>
          </div>
          <button
            onClick={handleCheckVersion}
            disabled={checkingVersion}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${checkMatch !== null ? (checkMatch ? "bg-emerald-700 text-emerald-200" : "bg-red-700 text-red-200") : "bg-indigo-600 text-indigo-100 hover:bg-indigo-500 active:scale-95"} disabled:opacity-50`}
          >
            {checkMatch === null ? "Compare with backend" : checkMatch ? "Saved" : "Mismatch"}
          </button>
        </div>
        {checkError && (
          <p className="text-xs text-red-400 text-center">{checkError}</p>
        )}
      </div>
    </div>
  );
}
