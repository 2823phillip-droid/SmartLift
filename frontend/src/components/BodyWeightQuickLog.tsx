import { useState } from "react";
import { api } from "../api";
import { getUnitsPreference, weightInputPlaceholder } from "../utils/units";

export default function BodyWeightQuickLog() {
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const units = getUnitsPreference();

  const add = async () => {
    const raw = parseFloat(weight);
    if (Number.isNaN(raw) || raw <= 0) return;
    const lbs = units === "imperial" ? raw : raw * 2.20462;
    setSaving(true);
    setError(null);
    try {
      await api.createBodyWeightLog({ weight_lbs: lbs });
      setWeight("");
    } catch (err: any) {
      setError(err?.message || "Failed to log weight");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="text-xs text-rose-400">{error}</div>
      )}
      <div className="flex gap-2">
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={weightInputPlaceholder(units)}
          className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={add}
          disabled={saving}
          className="rounded-xl border border-indigo-800 bg-indigo-950/60 px-4 py-2 text-xs font-semibold text-indigo-200 hover:border-indigo-500/60 transition-colors disabled:opacity-60"
        >
          {saving ? "..." : "Log Weight"}
        </button>
      </div>
    </div>
  );
}
