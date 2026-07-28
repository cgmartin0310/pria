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
  const hasBody = body !== undefined && body !== null;

  // Only declare a JSON content type when we're actually sending JSON. Fastify
  // rejects a request that advertises application/json with an empty body
  // ("Body cannot be empty when content-type is set to 'application/json'"),
  // which silently broke every bodyless POST — submit, sync, diagnostics.
  const response = await fetch(url, {
    method,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
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
  update: (id: string, data: unknown) =>
    api.patch<ApiResponse<Authorization>>(`/authorizations/${id}`, data),
  submit: (id: string) =>
    api.post<ApiResponse<Authorization>>(`/authorizations/${id}/submit`),
  renew: (id: string) =>
    api.post<ApiResponse<Authorization>>(`/authorizations/${id}/renew`),
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

export const authDocsApi = {
  upload: (
    authId: string,
    data: {
      fileName: string;
      mimeType: string;
      dataBase64: string;
      docType?: string;
    }
  ) =>
    api.post<ApiResponse<{ id: string; fileName: string }>>(
      `/authorizations/${authId}/documents`,
      data
    ),
  list: (authId: string) =>
    api.get<ApiResponse<{ id: string; fileName: string }[]>>(
      `/authorizations/${authId}/documents`
    ),
  clear: (authId: string) =>
    api.delete<ApiResponse<{ cleared: boolean }>>(
      `/authorizations/${authId}/documents`
    ),
};

export const payersApi = {
  list: () => api.get<ApiResponse<Payer[]>>("/payers"),
  get: (id: string) => api.get<ApiResponse<Payer>>(`/payers/${id}`),
  updatePolicy: (id: string, policy: unknown) =>
    api.patch<ApiResponse<unknown>>(`/payers/${id}/policy`, policy),
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
  environment: "production" | "test" | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  payerCount: number;
  createdAt: string;
}

export interface ServiceReviewTest {
  ok: boolean;
  httpStatus: number | null;
  status: string | null;
  statusCode: string | null;
  serviceReviewId: string | null;
  validationMessages: string[];
  message: string;
  debug?: {
    url: string;
    method: string;
    contentType: string;
    bodySent: boolean;
    bodyLength: number;
    bodyPreview: string;
    mockHeaders: boolean;
    responseStatus?: number;
    responseBody?: string;
  } | null;
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
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    demo?: boolean;
    simulatedDecision?: "A1" | "A3" | "A4";
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
  syncDirectory: (id: string) =>
    api.post<
      ApiResponse<{
        synced: number;
        pages: number;
        truncated: boolean;
        serviceReviewCapable: number;
        coverageError: string | null;
      }>
    >(`/clearinghouses/connections/${id}/sync-directory`),
  testServiceReview: (id: string) =>
    api.post<ApiResponse<ServiceReviewTest>>(
      `/clearinghouses/connections/${id}/test-service-review`
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

export interface PortalConnection {
  id: string;
  portalKey: string;
  label: string | null;
  usernameMasked: string | null;
  hasTotp: boolean;
  hasSession: boolean;
  sessionValidUntil: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export const portalApi = {
  connections: () =>
    api.get<ApiResponse<PortalConnection[]>>("/portals/connections"),
  connect: (data: {
    portalKey?: string;
    label?: string;
    username: string;
    password: string;
    totpSeed?: string;
  }) =>
    api.post<ApiResponse<{ id: string; connected: boolean }>>(
      "/portals/connect",
      data
    ),
  disconnect: (id: string) =>
    api.delete<ApiResponse<{ disconnected: boolean }>>(
      `/portals/connections/${id}`
    ),
  totpCheck: (id: string) =>
    api.get<ApiResponse<{ code: string; secondsRemaining: number }>>(
      `/portals/connections/${id}/totp-check`
    ),
  submissions: () =>
    api.get<ApiResponse<PortalSubmission[]>>("/portals/submissions"),
  submission: (id: string) =>
    api.get<ApiResponse<PortalSubmissionDetail>>(`/portals/submissions/${id}`),
  retrySubmission: (id: string) =>
    api.post<ApiResponse<PortalSubmission>>(`/portals/submissions/${id}/retry`),
  completeSubmission: (id: string, confirmationNumber?: string) =>
    api.post<ApiResponse<PortalSubmission>>(
      `/portals/submissions/${id}/complete`,
      confirmationNumber ? { confirmationNumber } : undefined
    ),
  recipes: () => api.get<ApiResponse<PortalRecipeSummary[]>>("/portals/recipes"),
  createRecipe: (data: {
    portalKey: string;
    payerId?: string;
    name: string;
    steps: unknown[];
    activate?: boolean;
  }) => api.post<ApiResponse<PortalRecipeSummary>>("/portals/recipes", data),
  activateRecipe: (id: string) =>
    api.post<ApiResponse<{ activated: string }>>(
      `/portals/recipes/${id}/activate`
    ),
};

export type PortalSubmissionStatus =
  | "queued"
  | "logging_in"
  | "needs_mfa"
  | "in_progress"
  | "needs_human"
  | "submitted"
  | "failed";

export interface PortalSubmission {
  id: string;
  authorizationId: string;
  portalConnectionId: string;
  status: PortalSubmissionStatus;
  confirmationNumber: string | null;
  attempts: number;
  lastError: string | null;
  needsHumanReason: string | null;
  takeoverSessionId?: string | null;
  takeoverUrl?: string | null;
  claimedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSubmissionDetail extends PortalSubmission {
  payload: Record<string, unknown> | null;
  pauseScreenshot: string | null;
}

export interface PortalRecipeSummary {
  id: string;
  portalKey: string;
  payerId: string | null;
  name: string;
  version: number;
  stepCount: number;
  isActive: boolean;
  createdAt: string;
}

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
