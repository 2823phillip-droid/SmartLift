import { captureError } from "./utils/logger";

let apiBase: string | null = null;
let authToken: string | null = null;

export function getApiBase(): string {
  return apiBase || "";
}

export function setApiBase(next: string) {
  apiBase = next;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(next: string | null) {
  authToken = next;
}

async function request(path: string, options: RequestInit = {}) {
  const base =
    apiBase || import.meta.env.VITE_API_BASE || "http://192.168.1.111:8000/api";
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: headers as Record<string, string>,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      const error = new Error(
        `API error ${res.status}: ${text}`
      );
      (error as any).url = url;
      (error as any).status = res.status;
      captureError(error, {
        context: { path, method: options.method, status: res.status },
      });
      throw error;
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    if (base !== "http://192.168.1.111:8000/api") {
      try {
        const fallbackController = new AbortController();
        const fallbackTimer = setTimeout(() => fallbackController.abort(), 12000);
        const fallbackHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          ...(options.headers as Record<string, string> | undefined),
        };
        if (authToken) {
          fallbackHeaders["Authorization"] = `Bearer ${authToken}`;
        }
        const fallbackRes = await fetch(`http://192.168.1.111:8000/api${path}`, {
          ...options,
          signal: fallbackController.signal,
          headers: fallbackHeaders as Record<string, string>,
        });
        clearTimeout(fallbackTimer);
        if (fallbackRes.ok) {
          apiBase = "http://192.168.1.111:8000/api";
          if (fallbackRes.status === 204) return null;
          return fallbackRes.json();
        }
      } catch {
        // fall through
      }
    }
    (err as any).url = (err as any).url || url;
    throw err;
  }
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

  // 1) LAN default first — fastest on WiFi and avoids dead tunnel first-hop
  candidates.push("http://192.168.1.111:8000/api");

  // 2) baked env var from build
  const envBase = import.meta.env.VITE_API_BASE;
  if (envBase) candidates.push(envBase);

  // 3) stored backend setting
  const storedBase = envBase || "http://192.168.1.111:8000/api";
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
  apiBase = "http://192.168.1.111:8000/api";
}

export async function ensureApiBase(): Promise<void> {
  if (apiBase) return;
  await initApiBaseFromSettings();
}

export interface Context {
  id: number;
  name: string;
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
  getContexts: () => request("/contexts"),
  createContext: (data: { name: string; description?: string | null; equipment_tags?: string[]; default_rest_seconds?: number }) =>
    request("/contexts", { method: "POST", body: JSON.stringify(data) }),
  deleteContext: (id: number) => request(`/contexts/${id}`, { method: "DELETE" }),

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
  createExercise: (data: { template_id: number; name: string; exercise_library_id?: number; order: number }) =>
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
  getContext: (id: number) => request(`/contexts/${id}`),
  endSession: (id: number) =>
    request(`/sessions/${id}/end`, { method: "POST" }),
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
};
