import { captureError } from "./utils/logger";

let apiBase: string | null = null;

export function getApiBase(): string {
  return apiBase || "";
}

export function setApiBase(next: string) {
  apiBase = next;
}

async function request(path: string, options: RequestInit = {}) {
  const base = apiBase || import.meta.env.VITE_API_BASE || "http://192.168.1.111:8000/api";
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
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
}

export async function initApiBaseFromSettings() {
  try {
    const defaultBase = import.meta.env.VITE_API_BASE || "http://192.168.1.111:8000/api";
    const res = await fetch(`${defaultBase}/settings/${encodeURIComponent("api_base")}`);
    if (res.ok) {
      const data = await res.json();
      const value = data?.value;
      if (value && typeof value === "string") {
        const candidate = value.trim().replace(/\/$/, "");
        if (/^https?:\/\//i.test(candidate) && candidate.length > 7) {
          // probe: if candidate base is actually reachable, use it; otherwise ignore it
          try {
            const test = await fetch(`${candidate}/settings/${encodeURIComponent("api_base")}`);
            if (test.ok) {
              apiBase = candidate;
              return;
            }
          } catch {
            // bad stored base; fall back to default
          }
        }
      }
    }
  } catch {
    // keep default
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

  getSetting: (key: string) => request(`/settings/${encodeURIComponent(key)}`),
  setSetting: (key: string, value: string) =>
    request(`/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    }),
  listSettings: () => request("/settings"),
};
