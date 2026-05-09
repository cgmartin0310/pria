const API_BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:3000";
const API_PREFIX = `${API_BASE}/api/v1`;

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_PREFIX}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      message: "Request failed",
      error: "UNKNOWN",
    }));
    throw new ApiError(
      response.status,
      errorData.message ?? "Request failed",
      errorData.error
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

// ─── Typed API helpers ────────────────────────────────────────────────────────

import type {
  Authorization,
  AuthorizationWithRelations,
  Patient,
  Payer,
  DashboardStats,
  ApiResponse,
  ApiListResponse,
} from "@pria/shared";

export const authorizationsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<ApiListResponse<AuthorizationWithRelations>>(
      `/authorizations${qs}`
    );
  },
  get: (id: string) =>
    api.get<ApiResponse<AuthorizationWithRelations>>(`/authorizations/${id}`),
  create: (data: unknown) =>
    api.post<ApiResponse<Authorization>>("/authorizations", data),
  submit: (id: string) =>
    api.post<ApiResponse<Authorization>>(`/authorizations/${id}/submit`),
  generateSummary: (id: string) =>
    api.post<ApiResponse<{ summary: string; keyPoints: string[]; medicalNecessityScore: number }>>(
      `/authorizations/${id}/generate-summary`
    ),
  stats: () => api.get<ApiResponse<DashboardStats>>("/authorizations/stats"),
};

export const patientsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<ApiListResponse<Patient>>(`/patients${qs}`);
  },
  get: (id: string) => api.get<ApiResponse<Patient>>(`/patients/${id}`),
  create: (data: unknown) =>
    api.post<ApiResponse<Patient>>("/patients", data),
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<Patient>>(`/patients/${id}`, data),
};

export const payersApi = {
  list: () => api.get<ApiResponse<Payer[]>>("/payers"),
  get: (id: string) => api.get<ApiResponse<Payer>>(`/payers/${id}`),
};
