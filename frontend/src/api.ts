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
  const base = apiBase || import.meta.env.VITE_API_BASE || "http://192.168.1.111:8000/api";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: headers as Record<string, string>,
    });
    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`API error ${res.status}: ${text}`);
      captureError(error, {
        context: { path, method: options.method, status: res.status },
      });
      throw error;
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err) {
    // Auto-fallback to LAN if the chosen base is dead
    if (base !== "http://192.168.1.111:8000/api") {
      try {
        const fallbackController = new AbortController();
        const fallbackTimer = setTimeout(() => fallbackController.abort(), 3500);
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
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function probe(base: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const test = await fetch(`${base}/settings/${encodeURIComponent("api_base")}`, { signal: controller.signal });
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
  const storedRes = await fetchWithTimeout(`${storedBase}/settings/${encodeURIComponent("api_base")}`);
  if (storedRes?.ok) {
    try {
      const data = await storedRes.json();
      const value = data?.value;
      if (value && typeof value === "string") {
        const candidate = value.trim().replace(/\/$/, "");
        if (/^https?:\/\//i.test(candidate) && candidate.length > 7) {
          candidates.unshift(candidate);
        }
      }
    } catch {
      // ignore bad JSON
    }
  }

  // dedupe preserving order
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const k = c.replace(/\/$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let found = false;
  for (const candidate of unique) {
    if (await probe(candidate)) {
      apiBase = candidate.replace(/\/$/, "");
      found = true;
      break;
    }
  }

  // fallback: if nothing responded, still set to LAN so subsequent requests have a target
  if (!found) {
    apiBase = "http://192.168.1.111:8000/api";
  }
}

export const api = {
  getContexts: () => request("/contexts"),
  createContext: (data: { name: string; description?: string; equipment_tags?: string[]; default_rest_seconds?: number }) =>
    request("/contexts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteContext: (id: number) => request(`/contexts/${id}`, { method: "DELETE" }),
  getTemplates: (contextId: number) => request(`/contexts/${contextId}/templates`),
  getTemplatesAcrossAll: () => request("/templates"),
  getTemplate: (templateId: number) => request(`/templates/${templateId}`),
  updateTemplate: (templateId: number, data: { name: string; type?: string; order?: number; default_rest_seconds?: number }) =>
    request(`/templates/${templateId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteTemplate: (templateId: number) => request(`/templates/${templateId}`, { method: "DELETE" }),
  createTemplate: (data: { context_id: number; name: string; type?: string; order?: number; default_rest_seconds?: number }) =>
    request("/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getExercises: (templateId: number) => request(`/templates/${templateId}/exercises`),
  getAllExercises: () => request("/exercises"),
  createExercise: (data: {
    template_id: number;
    exercise_library_id?: number;
    name: string;
    sets_target?: number;
    reps_target?: number;
    start_weight?: number;
    rest_seconds?: number;
    order?: number;
    notes?: string;
    per_set_data?: string;
  }) =>
    request("/exercises", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateExercise: (id: number, data: {
    template_id?: number;
    exercise_library_id?: number;
    name?: string;
    sets_target?: number;
    reps_target?: number;
    start_weight?: number;
    rest_seconds?: number;
    order?: number;
    notes?: string;
    per_set_data?: string;
  }) =>
    request(`/exercises/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteExercise: (id: number) => request(`/exercises/${id}`, { method: "DELETE" }),
  getExerciseProgress: (exerciseEntryId: number) => request(`/exercises/${exerciseEntryId}/progress`),
  getExerciseNameProgress: (name: string) => request(`/exercise-names/${encodeURIComponent(name)}/progress`),
  getExerciseNames: () => request("/exercise-names"),
  searchExerciseLibrary: (q = "") => request(`/exercise-library?${q ? `q=${encodeURIComponent(q)}` : ""}`),

  getWorkoutLibrary: () => request("/workout-library"),
  getWorkoutLibraryItem: (id: number) => request(`/workout-library/${id}`),
  importWorkoutLibrary: (data: { library_id: number; context_name: string }) =>
    request("/workout-library/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createSession: (data: { template_id?: number; pre_workout_mood?: string; pre_workout_tags?: string[] }) =>
    request("/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getSessions: () => request("/sessions"),
  getSession: (id: number) => request(`/sessions/${id}`),
  getContext: (id: number) => request(`/contexts/${id}`),
  endSession: (id: number) =>
    request(`/sessions/${id}/end`, { method: "POST" }),

  createSetLog: (data: {
    session_id: number;
    exercise_entry_id: number;
    set_index: number;
    suggested_weight?: number;
    suggested_reps?: number;
    actual_weight?: number;
    actual_reps?: number;
    effort?: number;
    notes?: string;
  }) =>
    request("/set-logs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getSessionSetLogs: (sessionId: number) => request(`/sessions/${sessionId}/set-logs`),

  createCoachMessage: (data: { session_id: number; role: string; content: string }) =>
    request("/coach-messages", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getCoachMessages: (sessionId: number) => request(`/sessions/${sessionId}/coach-messages`),

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
    request("/body-weight", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteBodyWeightLog: (id: number) => request(`/body-weight/${id}`, { method: "DELETE" }),

  getSetting: (key: string) => request(`/settings/${encodeURIComponent(key)}`),
  setSetting: (key: string, value: string) =>
    request(`/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    }),
  listSettings: () => request("/settings"),
  saveAITrainerAdjustments: (data: {
    session_id: number;
    template_id?: number;
    total_volume?: number;
    total_sets?: number;
    effort_avg?: number;
    adjustments: Array<{
      exercise_entry_id?: number;
      exercise_name: string;
      proposed_weight?: number;
      proposed_reps?: number;
      proposed_sets?: number;
      proposed_rest_seconds?: number;
      proposed_order?: number;
      effort_avg?: number;
      progression_type?: string;
    }>;
  }) =>
    request("/ai-trainer/adjustments/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listAITrainerAdjustments: (sessionId?: number) =>
    request(`/ai-trainer/adjustments${sessionId ? `?session_id=${sessionId}` : ""}`),

  // Auth
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
  updateProfile: (first_name?: string, last_name?: string) =>
    request("/auth/profile", {
      method: "PUT",
      body: JSON.stringify({ first_name, last_name }),
    }),
};
