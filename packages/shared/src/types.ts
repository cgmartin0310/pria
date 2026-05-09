import type { PAStatus, UserRole, PlanTier, DocumentType } from "./constants.js";

// ─── Base ────────────────────────────────────────────────────────────────────

export interface TimestampedEntity {
  createdAt: string; // ISO 8601
  updatedAt?: string;
}

// ─── Practice ───────────────────────────────────────────────────────────────

export interface Practice extends TimestampedEntity {
  id: string;
  name: string;
  npi: string;
  address: Address;
  phone: string;
  plan: PlanTier;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User extends TimestampedEntity {
  id: string;
  practiceId: string;
  email: string;
  name: string;
  role: UserRole;
  clerkId: string | null;
}

// ─── Payer ───────────────────────────────────────────────────────────────────

export interface Payer {
  id: string;
  name: string;
  payerId: string; // EDI ID
  portalUrl: string | null;
  rulesConfig: PayerRulesConfig;
  supportsX278: boolean;
  supportsFhir: boolean;
}

export interface PayerRulesConfig {
  requiresPreAuth: boolean;
  submissionMethod: "x12" | "portal" | "fax" | "phone";
  avgDecisionDays: number;
  notes: string;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export interface Patient extends TimestampedEntity {
  id: string;
  practiceId: string;
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  memberId: string;
  payerId: string;
  diagnosisCodes: string[];
}

export interface PatientWithPayer extends Patient {
  payer: Payer;
}

// ─── Authorization ────────────────────────────────────────────────────────────

export interface Authorization extends TimestampedEntity {
  id: string;
  practiceId: string;
  patientId: string;
  payerId: string;
  status: PAStatus;
  authNumber: string | null;
  cptCodes: string[];
  icdCodes: string[];
  requestedVisits: number;
  approvedVisits: number | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  visitsUsed: number;
  clinicalSummary: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface AuthorizationWithRelations extends Authorization {
  patient: Patient;
  payer: Payer;
  documents: AuthorizationDocument[];
  history: AuthorizationHistoryEntry[];
}

// ─── Authorization Documents ─────────────────────────────────────────────────

export interface AuthorizationDocument extends TimestampedEntity {
  id: string;
  authorizationId: string;
  type: DocumentType;
  content: string;
  aiGenerated: boolean;
}

// ─── Authorization History ────────────────────────────────────────────────────

export interface AuthorizationHistoryEntry {
  id: string;
  authorizationId: string;
  action: string;
  fromStatus: PAStatus | null;
  toStatus: PAStatus;
  notes: string | null;
  performedBy: string;
  createdAt: string;
}

// ─── Payer Rules ──────────────────────────────────────────────────────────────

export interface PayerRule {
  id: string;
  payerId: string;
  cptCode: string;
  requiresAuth: boolean;
  visitThreshold: number | null;
  criteria: PayerRuleCriteria;
  lastUpdated: string;
}

export interface PayerRuleCriteria {
  diagnosisRequired: boolean;
  functionalLimitationsRequired: boolean;
  progressNotesRequired: boolean;
  physicianOrderRequired: boolean;
  additionalDocs: string[];
  notes: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  pendingCount: number;
  approvedThisMonth: number;
  deniedThisMonth: number;
  expiringSoon: number; // within 14 days or 5 visits remaining
  approvalRate: number; // percentage
  avgDecisionDays: number;
}

// ─── AI Types ─────────────────────────────────────────────────────────────────

export interface ClinicalSummaryRequest {
  patientName: string;
  dob: string;
  diagnosisCodes: string[];
  cptCodes: string[];
  requestedVisits: number;
  functionalLimitations?: string;
  treatmentGoals?: string;
  priorTreatments?: string;
}

export interface ClinicalSummaryResponse {
  summary: string;
  keyPoints: string[];
  medicalNecessityScore: number; // 0-100
}

export interface DenialPrediction {
  likelihood: "low" | "medium" | "high";
  score: number; // 0-100
  reasons: string[];
  recommendations: string[];
}

// ─── X12 278 Types ────────────────────────────────────────────────────────────

export interface X12278Request {
  transactionId: string;
  submitterId: string;
  providerId: string;
  providerNpi: string;
  payerId: string;
  patient: {
    memberId: string;
    firstName: string;
    lastName: string;
    dob: string;
  };
  services: Array<{
    cptCode: string;
    icdCodes: string[];
    requestedVisits: number;
    startDate: string;
    endDate: string;
  }>;
}

export interface X12278Response {
  transactionId: string;
  authNumber: string | null;
  status: "approved" | "denied" | "pending" | "error";
  message: string;
  rawSegments: string[];
}

// ─── Query Params ─────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface AuthorizationFilters extends PaginationParams {
  status?: PAStatus;
  patientId?: string;
  payerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PatientFilters extends PaginationParams {
  search?: string;
  payerId?: string;
}
