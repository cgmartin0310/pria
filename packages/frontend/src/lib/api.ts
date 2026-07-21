const API_BASE = import.meta.env["VITE_API_URL"] ?? "";
const API_PREFIX = `${API_BASE}/api/v1`;

// ─── Auth token injection ─────────────────────────────────────────────────────
// The fetch wrapper is a plain module, so Clerk's session token is supplied via
// a getter registered at app init (see ApiAuthBridge in main.tsx). This keeps
// api.ts decoupled from React/Clerk while every request carries a bearer token.

type TokenGetter = () => Promise<string | null>;

let getToken: TokenGetter | null = null;

export function setAuthTokenGetter(fn: TokenGetter | null): void {
  getToken = fn;
}

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
  const token = getToken ? await getToken() : null;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  Provider,
  Practice,
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
  preview: (id: string) =>
    api.get<ApiResponse<Preview278>>(`/authorizations/${id}/preview`),
};

export interface Preview278 {
  valid: boolean;
  errors: string[];
  warnings: string[];
  edi: string | null;
}

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

export const providersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<ApiListResponse<Provider>>(`/providers${qs}`);
  },
  get: (id: string) => api.get<ApiResponse<Provider>>(`/providers/${id}`),
  create: (data: unknown) => api.post<ApiResponse<Provider>>("/providers", data),
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<Provider>>(`/providers/${id}`, data),
};

export const practiceApi = {
  getCurrent: () => api.get<ApiResponse<Practice>>("/practices/current"),
  updateCurrent: (data: unknown) =>
    api.patch<ApiResponse<Practice>>("/practices/current", data),
  updateClinicConfig: (data: unknown) =>
    api.patch<ApiResponse<Practice>>("/practices/current/clinic-config", data),
};

export interface CurrentUser {
  id: string;
  practiceId: string;
  email: string;
  name: string;
  role: "admin" | "therapist" | "billing";
  practice: Practice | null;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "admin" | "therapist" | "billing";
  status: "active" | "invited";
  createdAt?: string;
}

export const authApi = {
  me: () => api.get<ApiResponse<CurrentUser>>("/auth/me"),
};

export interface Clearinghouse {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
}

export interface ClearinghouseConnection {
  id: string;
  clearinghouseId: string;
  clearinghouseKey: string;
  clearinghouseName: string;
  label: string | null;
  accountKeyMasked: string | null;
  demo: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
  payerCount: number;
  createdAt: string;
}

export interface DirectoryPayer {
  clearinghousePayerId: string;
  name: string;
  capabilities: Record<string, string>;
  added: boolean;
}

export const clearinghouseApi = {
  list: () => api.get<ApiResponse<Clearinghouse[]>>("/clearinghouses"),
  connections: () =>
    api.get<ApiResponse<ClearinghouseConnection[]>>("/clearinghouses/connections"),
  connect: (data: {
    clearinghouseKey: string;
    clientId: string;
    clientSecret: string;
    scope?: string;
    demo?: boolean;
    label?: string;
  }) =>
    api.post<ApiResponse<{ id: string; connected: boolean }>>(
      "/clearinghouses/connect",
      data
    ),
  disconnect: (id: string) =>
    api.delete<ApiResponse<{ disconnected: boolean }>>(
      `/clearinghouses/connections/${id}`
    ),
  searchPayers: (connId: string, q: string) =>
    api.get<ApiResponse<DirectoryPayer[]>>(
      `/clearinghouses/connections/${connId}/payer-search?q=${encodeURIComponent(q)}`
    ),
  addPayer: (
    connId: string,
    data: { clearinghousePayerId: string; name: string; capabilities?: Record<string, string> }
  ) =>
    api.post<ApiResponse<Payer>>(
      `/clearinghouses/connections/${connId}/payers`,
      data
    ),
};

export interface Icd10Result {
  code: string;
  name: string;
}

export const icd10Api = {
  search: (q: string, limit = 25) =>
    api.get<ApiResponse<Icd10Result[]>>(
      `/icd10/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
};

export const teamApi = {
  list: () => api.get<ApiResponse<TeamMember[]>>("/practices/current/team"),
  invite: (data: { email: string; name?: string; role?: string }) =>
    api.post<ApiResponse<TeamMember>>("/practices/current/invites", data),
};
