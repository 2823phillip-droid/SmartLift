import { useState } from "react";
import { api, initApiBaseFromSettings, setAuthToken, withRetry } from "../api";

export default function SignupScreen({ onSignup, onSwitch }: { onSignup: (user: { id: number; email: string; role: string; first_name?: string; last_name?: string }) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await withRetry(() => initApiBaseFromSettings(), { retries: 2, baseDelayMs: 300 });
      const res = await withRetry(() => api.signup(email, password, firstName, lastName), { retries: 2, baseDelayMs: 300 });
      setAuthToken(res.token);
      onSignup(res.user);
    } catch (err) {
      setError((err as Error).message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-10 space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Askeo</h2>
        <p className="text-slate-400 text-sm">Create your account</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">First name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
            placeholder="Given name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
            placeholder="Family name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
            placeholder="Min 8 characters"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <p className="text-center text-xs text-slate-400">
        Already have an account?{" "}
        <button onClick={onSwitch} className="text-indigo-400 hover:text-indigo-300">
          Sign in
        </button>
      </p>
    </div>
  );
}
