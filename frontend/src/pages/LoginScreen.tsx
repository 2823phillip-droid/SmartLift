import { useState, useEffect } from "react";
import { api, initApiBaseFromSettings, setAuthToken, withRetry } from "../api";

declare global {
  interface Window {
    google?: any;
    Apple?: any;
  }
}

export default function LoginScreen({ onLogin, onSwitch }: { onLogin: (user: { id: number; email: string; role: string; first_name?: string; last_name?: string }) => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await withRetry(() => initApiBaseFromSettings(), { retries: 2, baseDelayMs: 300 });
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      if (!trimmedEmail || !trimmedPassword) {
        setError("Please enter both email and password.");
        return;
      }
      const res = await withRetry(() => api.login(trimmedEmail, trimmedPassword), { retries: 2, baseDelayMs: 300 });
      setAuthToken(res.token);
      onLogin(res.user);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await withRetry(() => initApiBaseFromSettings(), { retries: 2, baseDelayMs: 300 });
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        throw new Error("Google Sign-In is not configured. Missing VITE_GOOGLE_CLIENT_ID.");
      }
      if (!window.google?.accounts?.id) {
        throw new Error("Google Sign-In is not configured yet.");
      }
      const res = await new Promise<any>((resolve, reject) => {
        const client = window.google.accounts.id;
        client.initialize({
          client_id: googleClientId,
          callback: (resp: any) => {
            if (resp.error) {
              reject(new Error(resp.error));
              return;
            }
            const token = resp.credential;
            if (!token) {
              reject(new Error("Missing Google credential"));
              return;
            }
            resolve(token);
          },
        });
        client.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkipped()) {
            reject(new Error("Google sign-in was skipped or not displayed"));
          }
        });
      });
      const authRes = await api.google(res as string);
      setAuthToken(authRes.token);
      onLogin(authRes.user);
    } catch (err) {
      setError((err as Error).message || "Google login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setError("Apple Sign-In is not available yet.");
  };

  return (
    <div className="max-w-sm mx-auto mt-10 space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold">SmartLift</h2>
        <p className="text-slate-400 text-sm">Sign in to your account</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
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
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-indigo-500 focus:outline-none"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <div className="space-y-2">
        <button
          onClick={handleGoogle}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 active:scale-95 transition-all"
        >
          Continue with Google
        </button>
        <button
          onClick={handleApple}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 active:scale-95 transition-all"
        >
          Continue with Apple
        </button>
      </div>
      <p className="text-center text-xs text-slate-400">
        Don&apos;t have an account?{" "}
        <button onClick={onSwitch} className="text-indigo-400 hover:text-indigo-300">
          Sign up
        </button>
      </p>
    </div>
  );
}
