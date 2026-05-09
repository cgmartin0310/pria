import type { FastifyRequest, FastifyReply } from "fastify";

// Re-export shared types for convenience
export type {
  Authorization,
  AuthorizationWithRelations,
  Patient,
  Payer,
  Practice,
  User,
  DashboardStats,
  ClinicalSummaryRequest,
  ClinicalSummaryResponse,
  DenialPrediction,
  X12278Request,
  X12278Response,
  AuthorizationFilters,
  PatientFilters,
  ApiResponse,
  ApiListResponse,
  ApiError,
} from "@pria/shared";

// ─── Fastify augmentation ─────────────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  practiceId: string;
  email: string;
  name: string;
  role: "admin" | "therapist" | "billing";
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// ─── Route handler types ───────────────────────────────────────────────────────

export type RouteHandler = (
  req: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

// ─── Job types ─────────────────────────────────────────────────────────────────

export interface PASubmitJobData {
  authorizationId: string;
  practiceId: string;
  retryCount?: number;
}

export interface PAStatusCheckJobData {
  authorizationId: string;
  authNumber: string;
  payerId: string;
}
