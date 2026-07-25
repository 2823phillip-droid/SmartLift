import { useState } from "react";
import { api } from "../api";

export default function BodyWeightQuickLog() {
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const lbs = parseFloat(weight);
    if (Number.isNaN(lbs) || lbs <= 0) return;
    setSaving(true);
    try {
      await api.createBodyWeightLog({ weight_lbs: lbs });
      setWeight("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="lbs"
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
  );
}
