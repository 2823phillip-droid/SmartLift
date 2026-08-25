import { captureError } from "./utils/logger";

let apiBase: string | null = null;
let authToken: string | null = null;

export function getApiBase(): string {
  return apiBase || "";
}

export function setApiBase(next: string) {
  apiBase = next;
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiBase().replace(/\/api$/, "");
  return base + url;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(next: string | null) {
  authToken = next;
}

async function request(path: string, options: RequestInit = {}) {
  const FLY_DEFAULT = "https://askeo.fit/api";
  let base = apiBase || import.meta.env.VITE_API_BASE || FLY_DEFAULT;
  let url = `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const makeRequest = async (attemptBase: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.signal ? 0 : 30000);
    try {
      const res = await fetch(`${attemptBase}${path}`, {
        ...options,
        signal: options.signal || controller.signal,
        headers: headers as Record<string, string>,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        const error = new Error(`API error ${res.status}: ${text}`);
        (error as any).url = `${attemptBase}${path}`;
        (error as any).status = res.status;
        captureError(error, {
          context: { path, method: options.method, status: res.status },
        });
        throw error;
      }
      if (res.status === 204) return null;
      return res.json();
    } catch (err: any) {
      clearTimeout(timer);
      if (!(err as any)?.url) (err as any).url = `${attemptBase}${path}`;
      throw err;
    }
  };

  const isAuthPath = path.startsWith("/api/auth/");
  const refreshAndRetry = async (err: any) => {
    const status = err?.status;
    if (!authToken || isAuthPath || typeof status !== "number" || (status !== 401 && status !== 403)) {
      throw err;
    }
    try {
      const refreshed = await api.refreshToken();
      if (!refreshed || !refreshed.token) throw new Error("no_token");
      setAuthToken(refreshed.token);
      if (typeof window !== "undefined") localStorage.setItem("askeo_token", refreshed.token);
      headers["Authorization"] = `Bearer ${refreshed.token}`;
      return await makeRequest(base);
    } catch {
      setAuthToken(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("askeo_token");
      }
      throw err;
    }
  };

  try {
    return await makeRequest(base);
  } catch (err) {
    try {
      return await refreshAndRetry(err);
    } catch {
      const isProductionDefault = base === FLY_DEFAULT || apiBase === null;
      const looksNetwork = !(err as any)?.status || (err as any).status >= 400;
      if (isProductionDefault && looksNetwork) {
        try {
          await initApiBaseFromSettings();
          const newBase = apiBase || import.meta.env.VITE_API_BASE || FLY_DEFAULT;
          if (newBase !== base) {
            base = newBase;
            url = `${base}${path}`;
            return await makeRequest(base);
          }
        } catch {
          // fall through to original error
        }
      }
      if (!(err as any)?.url) (err as any).url = url;
      throw err;
    }
  }
}

function isNetworkOrTransientError(err: any, res?: any) {
  if (!navigator?.onLine) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException) return true;
  if (err && typeof err.name === "string" && err.name === "AbortError") return true;
  if (typeof err?.message === "string" && /load failed|network error|cors|failed to fetch/i.test(err.message)) return true;
  if (res && (res.status === 408 || res.status === 429 || res.status >= 500)) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number; signal?: AbortSignal }
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const baseDelay = opts?.baseDelayMs ?? 400;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts?.signal?.aborted) throw err;
      if (attempt >= retries) break;
      const res = (err as any)?.status ? { status: (err as any).status } : undefined;
      if (!isNetworkOrTransientError(err, res)) break;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function probe(base: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const test = await fetch(`${base}/settings/${encodeURIComponent("api_base")}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return test.ok;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

export async function initApiBaseFromSettings() {
  const candidates: string[] = [];

  // 1) baked env var from build
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase) candidates.push(envBase);

  // 2) production backend first
  candidates.push("https://askeo.fit/api");

  // 3) stored backend setting
  const storedBase = envBase || "https://askeo.fit/api";
  const storedRes = await fetchWithTimeout(
    `${storedBase}/settings/${encodeURIComponent("api_base")}`
  );
  if (storedRes?.ok) {
    try {
      const stored = (await storedRes.json())?.value;
      if (stored && typeof stored === "string") {
        const trimmed = stored.trim().replace(/\/$/, "");
        if (/^https?:\/\//i.test(trimmed) && trimmed.length > 7) {
          candidates.unshift(trimmed);
        }
      }
    } catch {
      // ignore
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\/$/, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (await probe(normalized)) {
      apiBase = normalized;
      return;
    }
  }
  apiBase = "https://askeo.fit/api";
}

export async function ensureApiBase(): Promise<void> {
  if (apiBase) return;
  await initApiBaseFromSettings();
}

export interface Context {
  id: number;
  name: string;
  order: number;
}

export interface Template {
  id: number;
  name: string;
  type: string;
  context_id?: number | null;
  order: number;
  default_rest_seconds?: number;
  exercises: Exercise[];
}

export interface Exercise {
  id: string;
  name: string;
}

export interface ExerciseNameProgressResponse {
  name: string;
  points: Array<{ date: string; weight: number; reps: number }>;
  seeded?: boolean;
}

export interface Session {
  id: number;
  started_at: string;
  ended_at?: string | null;
}

export interface ProgressionTransition {
  id: number;
  exercise_entry_id: number;
  from_phase: string;
  to_phase: string;
  week_in_block: number;
  reason?: string;
  created_at?: string;
}

export interface SessionHistory extends Session {
  template_id?: number;
  pre_workout_mood?: string;
  pre_workout_tags: string[];
  status: string;
  template_name?: string;
  context_name?: string;
}

export interface SetLog {
  id: number;
  session_id: number;
  exercise_entry_id: number;
  set_number: number;
  set_index: number;
  suggested_weight?: number | null;
  suggested_reps?: number | null;
  actual_weight?: number | null;
  actual_reps?: number | null;
  effort?: number | null;
  completed?: boolean;
  logged_at?: string | null;
  notes?: string | null;
}

export interface SetLogUpdate {
  actual_weight?: number | null;
  actual_reps?: number | null;
  effort?: number | null;
  notes?: string | null;
}

export const api = {
  getContext: (id: number) => request(`/contexts/${id}`),
  updateContext: (id: number, data: { name?: string; description?: string | null; equipment_tags?: string[]; default_rest_seconds?: number; order?: number }) =>
    request(`/contexts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteContext: (id: number) => request(`/contexts/${id}`, { method: "DELETE" }),
  createContext: (data: { name: string; description?: string | null; equipment_tags?: string[]; default_rest_seconds?: number; order?: number }) =>
    request("/contexts", { method: "POST", body: JSON.stringify(data) }),
  getContexts: () => request("/contexts"),

  getTemplates: (contextId: number) => request(`/contexts/${contextId}/templates`),
  getTemplatesAcrossAll: () => request("/templates"),
  getTemplate: (id: number) => request(`/templates/${id}`),
  updateTemplate: (id: number, data: Partial<Template>) =>
    request(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: number) => request(`/templates/${id}`, { method: "DELETE" }),
  createTemplate: (data: Partial<Template>) =>
    request("/templates", { method: "POST", body: JSON.stringify(data) }),

  getExercises: (templateId: number) => request(`/templates/${templateId}/exercises`),
  getAllExercises: () => request("/exercises"),
  createExercise: (data: { template_id: number; name: string; exercise_library_id?: number; order: number; sets_target?: number; reps_target?: number; start_weight?: number; rest_seconds?: number; notes?: string | null; group_id?: string | null }) =>
    request("/exercises", { method: "POST", body: JSON.stringify(data) }),
  updateExercise: (id: number, data: Partial<Exercise>) =>
    request(`/exercises/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteExercise: (id: number) => request(`/exercises/${id}`, { method: "DELETE" }),

  getExerciseProgress: (exerciseId: number) =>
    request(`/exercises/${exerciseId}/progress`),
  getExerciseNameProgress: (name: string) =>
    request(`/exercise-names/${encodeURIComponent(name)}/progress`),
  getExerciseNames: () => request("/exercise-names"),
  getExerciseNameLastSession: (name: string) =>
    request(`/exercise-names/${encodeURIComponent(name)}/last-session`),
  getTotalVolume: () => request("/stats/total-volume"),
  getStreak: () => request("/stats/streak"),

  searchExerciseLibrary: (query = "") =>
    request(`/exercise-library${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  getWorkoutLibrary: () => request("/workout-library"),
  getWorkoutLibraryItem: (id: number) => request(`/workout-library/${id}`),
  importWorkoutLibrary: (data: Record<string, unknown>) =>
    request("/workout-library/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createSession: (data: { template_id?: number | null; pre_workout_mood?: string | null; pre_workout_tags?: string[] }) =>
    request("/sessions", { method: "POST", body: JSON.stringify(data) }),
  getSessions: () => request("/sessions"),
  getSession: (id: number) => request(`/sessions/${id}`),
  endSession: (id: number) =>
    request(`/sessions/${id}/end`, { method: "POST" }),
  cancelSession: (id: number) =>
    request(`/sessions/${id}/cancel`, { method: "POST" }),
  deleteSession: (id: number) =>
    request(`/sessions/${id}`, { method: "DELETE" }),
  deleteSetLog: (sessionId: number, logId: number) =>
    request(`/sessions/${sessionId}/set-logs/${logId}`, { method: "DELETE" }),
  updateSetLog: (sessionId: number, logId: number, data: SetLogUpdate) =>
    request(`/sessions/${sessionId}/set-logs/${logId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  createSetLog: (data: {
    session_id: number;
    exercise_entry_id: number;
    set_index: number;
    suggested_weight?: number | null;
    suggested_reps?: number | null;
    actual_weight?: number | null;
    actual_reps?: number | null;
    effort?: number | null;
    rir?: number | null;
    notes?: string | null;
  }) =>
    request("/set-logs", { method: "POST", body: JSON.stringify(data) }),
  getSessionSetLogs: (sessionId: number) =>
    request(`/sessions/${sessionId}/set-logs`),

  createCoachMessage: (data: { session_id: number; role: string; content: string }) =>
    request("/coach-messages", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getCoachMessages: (sessionId: number) =>
    request(`/sessions/${sessionId}/coach-messages`),

  coachOverride: (data: { phase: string; week_in_block: number; force_deload?: boolean; periodization_cycle_weeks?: number; custom_phase_order?: string[] }) =>
    request("/coach/override", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getCoachState: () => request("/coach/state"),

  nextPrescription: (data: {
    start_weight: number;
    reps_target: number;
    sets_target: number;
    rest_seconds: number;
    progression_type: string;
    history: Array<{
      actual_weight: number;
      actual_reps: number;
      effort?: number | null;
      rpe?: number | null;
      rir?: number | null;
      is_seeded?: boolean;
      completed_at?: string | null;
    }>;
    linear_increment?: number;
    double_increment?: number;
    double_success_threshold?: number;
    estimated_1rm?: number | null;
    percentage_of_1rm?: number;
    pct_increment_success?: number;
    pct_decrement_fail?: number;
    week?: number;
    periodization_cycle_weeks?: number;
    force_deload?: boolean;
    deload_volume_factor?: number;
    deload_intensity_factor?: number;
    hard_effort_threshold?: number;
    easy_effort_threshold?: number;
    ai_progression_sensitivity?: number | null;
    ai_volume_tolerance?: number | null;
    ai_recovery_multiplier?: number | null;
    ai_preferred_rir?: number | null;
    ai_stress_fatigue_adjustment?: number | null;
    ai_calibrated_1rm?: number | null;
    current_phase?: string | null;
    current_week_in_block?: number | null;
    custom_phase_order?: string[] | null;
    exercise_entry_id?: number | null;
  }) =>
    request("/rules/next-prescription", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAlgorithmState: (exerciseEntryId: number) =>
    request(`/rules/algorithm-state/${exerciseEntryId}`),

  listProgressionTransitions: () => request("/progression/transitions"),

  aiNextSuggestion: (data: {
    session_id: number;
    context: string;
    current_exercise_name: string;
    last_set_effort?: number;
    goal?: string;
  }) =>
    request("/ai/next-suggestion", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  seed: () => request("/seed", { method: "POST" }),

  getBodyWeightLogs: () => request("/body-weight"),
  createBodyWeightLog: (data: { weight_lbs: number; notes?: string }) =>
    request("/body-weight", { method: "POST", body: JSON.stringify(data) }),
  deleteBodyWeightLog: (id: number) => request(`/body-weight/${id}`, { method: "DELETE" }),

  getSetting: (key: string) => request(`/settings/${encodeURIComponent(key)}`),
  setSetting: (key: string, value: string) =>
    request(`/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    }),
  listSettings: () => request("/settings"),

  getFitnessProfile: () => request("/profile/fitness"),
  putFitnessProfile: (data: any) =>
    request("/profile/fitness", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  generateTrainer: (data: any) =>
    request("/trainer/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  saveAITrainerAdjustments: (data: any) =>
    request("/ai-trainer/adjustments/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listAITrainerAdjustments: (sessionId?: number) =>
    request(
      `/ai-trainer/adjustments${
        sessionId ? `?session_id=${sessionId}` : ""
      }`
    ),

  signup: (email: string, password: string, first_name?: string, last_name?: string) =>
    request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, first_name, last_name }),
    }),
  login: (email: string, password: string) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  google: (idToken: string) =>
    request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token: idToken }),
    }),
  apple: (identityToken: string) =>
    request("/auth/apple", {
      method: "POST",
      body: JSON.stringify({ identity_token: identityToken }),
    }),
  me: () => request("/auth/me"),
  updateProfile: (first_name: string, last_name: string) =>
    request("/auth/profile", {
      method: "PUT",
      body: JSON.stringify({ first_name, last_name }),
    }),
  refreshToken: (currentToken?: string) =>
    request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ token: currentToken || authToken }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
};
