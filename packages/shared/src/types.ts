import type {
  PAStatus,
  UserRole,
  PlanTier,
  DocumentType,
  CertificationTypeCode,
  ServiceTypeCode,
  LevelOfServiceCode,
  RelationshipCode,
  FacilityTypeCode,
} from "./constants.js";

// ─── Base ────────────────────────────────────────────────────────────────────

export interface TimestampedEntity {
  createdAt: string; // ISO 8601
  updatedAt?: string;
}

// ─── Practice ───────────────────────────────────────────────────────────────

/**
 * Core practice record. For 278 EDI generation, additional clinic-level
 * configuration (taxonomy codes, EDI credentials, etc.) lives in ClinicConfig,
 * which is stored as a JSONB blob on the practice record.
 */
export interface Practice extends TimestampedEntity {
  id: string;
  name: string;
  /** Group NPI (Type 2) — maps to 2000B NM109 */
  npi: string;
  address: Address;
  phone: string;
  fax?: string;   // PER segment contact
  email?: string; // PER segment contact
  plan: PlanTier;
  /** Clinic-level 278 configuration — set once during onboarding */
  clinicConfig?: ClinicConfig;
}

/**
 * Clinic-level EDI/278 configuration. Configured ONCE during clinic setup.
 * None of this is collected per-patient or per-authorization.
 *
 * Maps to multiple 278 segments in the 2000B (Requester) loop.
 */
export interface ClinicConfig {
  /**
   * Provider taxonomy codes for the practice.
   * Maps to PRV03 in the 2000B PRV segment.
   * Example: ['225100000X'] for a PT-only practice, or multiple for multi-discipline.
   */
  taxonomyCodes: string[];

  /**
   * Facility type code for place of service.
   * Maps to UM04-1 in the UM segment (Patient Event loop).
   * Common values: '11' = Office, '22' = Outpatient Hospital, '12' = Home.
   */
  facilityTypeCode: FacilityTypeCode | string;

  /**
   * Claim type for the practice.
   * Maps to UM04-2 in the UM segment.
   * 'B' = Professional (most PT/OT/ST outpatient), 'A' = Institutional.
   */
  claimType: "B" | "A";

  /**
   * EDI interchange sender qualifier.
   * Maps to ISA05. Common value: 'ZZ' (Mutually Defined).
   */
  ediSenderQualifier: string;

  /**
   * EDI interchange sender ID.
   * Maps to ISA06. Assigned by the clearinghouse.
   */
  ediSenderId: string;

  /**
   * EDI interchange receiver qualifier.
   * Maps to ISA07. Common value: 'ZZ' (Mutually Defined).
   */
  ediReceiverQualifier: string;

  /**
   * EDI interchange receiver ID.
   * Maps to ISA08. The clearinghouse's interchange ID.
   */
  ediReceiverId: string;

  /**
   * Application sender ID for the GS segment (GS02).
   * Often same as ediSenderId.
   */
  gsApplicationSenderId?: string;

  /**
   * Application receiver ID for the GS segment (GS03).
   * Often same as ediReceiverId.
   */
  gsApplicationReceiverId?: string;

  /**
   * Default request category code for UM01.
   * For outpatient PT/OT/ST: 'HS' (Health Services Review).
   */
  requestCategoryCode?: string;
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

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * Individual therapist/provider within a practice.
 * Per-therapist data used in the 2010EA (Patient Event Provider) loop.
 * Stored ONCE in the provider profile — not collected per authorization.
 */
export interface Provider extends TimestampedEntity {
  id: string;
  practiceId: string;

  /** Individual (Type 1) NPI — maps to 2010EA NM109 */
  npi: string;

  /** Maps to 2010EA NM103 */
  lastName: string;

  /** Maps to 2010EA NM104 */
  firstName: string;

  /** Maps to 2010EA NM107 (e.g., 'DPT', 'OTR/L', 'CCC-SLP') */
  suffix?: string;

  /** Display credentials (not used in 278 directly, but for UI) */
  credentials?: string;

  /**
   * Individual taxonomy code.
   * Maps to PRV03 in the 2010EA PRV segment.
   * Example: '225100000X' for Physical Therapist.
   */
  taxonomyCode: string;

  /**
   * State license number.
   * Maps to REF*0B in the 2010EA loop (situational; some payers require).
   */
  stateLicenseNumber?: string;

  /** Discipline — used to auto-populate service type codes and CPT modifiers */
  discipline: "PT" | "OT" | "ST";

  /** Link to the User record if this provider has portal access */
  userId?: string;

  isActive: boolean;
}

// ─── Payer ───────────────────────────────────────────────────────────────────

export interface Payer {
  id: string;
  name: string;

  /**
   * EDI Payer ID used in the 278 transaction.
   * Maps to 2000A NM109 (the payer/UMO identifier).
   * Examples: '87726' = UnitedHealthcare, '60054' = Aetna.
   */
  payerId: string;

  /**
   * Qualifier for the payer ID in NM108.
   * 'PI' = Payer ID (most common), '46' = Electronic Transmitter ID (ETIN).
   */
  payerIdQualifier: "PI" | "46";

  portalUrl: string | null;
  rulesConfig: PayerRulesConfig;
  supportsX278: boolean;
  supportsFhir: boolean;

  /** Present on practice-scoped payer listings (from the payer link). */
  authPolicy?: PayerAuthPolicy | null;
  /** 278 capability through the practice's clearinghouse link, when listed. */
  supports278?: boolean;

  /**
   * Clearinghouse-specific routing info (optional).
   * Some payers require routing through a specific clearinghouse.
   */
  clearinghouseRouting?: {
    clearinghouseId: string;
    clearinghouseName: string;
    notes?: string;
  };
}

export interface PayerRulesConfig {
  requiresPreAuth: boolean;
  submissionMethod: "x12" | "portal" | "fax" | "phone";
  avgDecisionDays: number;
  notes: string;
}

/**
 * Practice-entered auth policy for a payer — drives New Authorization
 * defaults. Stored on the practice's payer link, not the shared payer row.
 */
export interface PayerAuthPolicy {
  /** Visits allowed before an auth is required (0 = auth before first treatment). */
  unmanagedVisits?: number;
  /** Typical auth window in months (e.g. Healthy Blue: 6). */
  authPeriodMonths?: number;
  /** Max visits granted per auth. */
  maxVisitsPerAuth?: number;
  /**
   * Exact payer name as shown in the portal's payer dropdown, when it differs
   * from the directory name (directory "CENTENE" vs wizard "CAROLINA COMPLETE
   * HEALTH"). Portal recipes select the payer by this.
   */
  portalPayerName?: string;
  notes?: string;
}

// ─── Patient ─────────────────────────────────────────────────────────────────

export interface Patient extends TimestampedEntity {
  id: string;
  practiceId: string;
  payerId: string;

  // ── Core Demographics ──
  firstName: string;               // 2000C/D NM104
  lastName: string;                // 2000C/D NM103
  /** Maps to 2000C/D NM105 */
  middleName?: string;
  dob: string;                     // YYYY-MM-DD → DMG02

  /**
   * Patient gender code.
   * Maps to DMG03. 'M' = Male, 'F' = Female, 'U' = Unknown.
   */
  gender?: "M" | "F" | "U";

  /** Patient address — maps to 2000C/D N3 + N4 */
  address?: Address;

  phone?: string;

  // ── Insurance ──

  /**
   * Insurance Member ID (subscriber ID from the insurance card).
   * Maps to 2000C NM109 (qualifier MI).
   * MOST CRITICAL field for 278 generation.
   */
  memberId: string;

  /**
   * Relationship of this patient to the insurance subscriber.
   * Maps to 2000D INS.
   * '18' = Self (patient IS the subscriber), '01' = Spouse, '19' = Child.
   * When '18', subscriber fields below are not needed.
   */
  relationshipToSubscriber: RelationshipCode | string;

  /**
   * Insurance group/plan number.
   * Maps to 2000C REF (group number qualifier).
   */
  groupNumber?: string;

  // ── Subscriber Info (only when patient is a dependent, i.e., relationship ≠ '18') ──

  /**
   * Subscriber (policyholder) last name.
   * Maps to 2000C NM103 when patient is a dependent.
   */
  subscriberLastName?: string;

  /**
   * Subscriber first name.
   * Maps to 2000C NM104.
   */
  subscriberFirstName?: string;

  subscriberMiddleName?: string;  // 2000C NM105

  /**
   * Subscriber member ID (policyholder's ID).
   * Maps to 2000C NM109.
   */
  subscriberMemberId?: string;

  /**
   * Subscriber date of birth (YYYY-MM-DD).
   * Maps to 2000C DMG02.
   */
  subscriberDob?: string;

  /** Subscriber gender — maps to 2000C DMG03 */
  subscriberGender?: "M" | "F" | "U";

  /** Subscriber address — maps to 2000C N3 + N4 */
  subscriberAddress?: Address;

  // ── Clinical ──
  diagnosisCodes: string[];
}

export interface PatientWithPayer extends Patient {
  payer: Payer;
}

// ─── Visit Pattern ────────────────────────────────────────────────────────────

/**
 * Describes the requested therapy visit frequency and duration.
 * Maps to the HSD segment in the 2000E (Patient Event) loop.
 *
 * Example: 2 visits/week for 6 weeks = { visitsPerPeriod: 2, periodFrequency: 'WK', periodCount: 6, totalDurationDays: 42 }
 */
export interface VisitPattern {
  /** HSD02 — Number of visits/units per period */
  visitsPerPeriod: number;

  /** HSD03 — Period type: 'DA' = Day, 'WK' = Week, 'MO' = Month */
  periodFrequency: "DA" | "WK" | "MO";

  /** HSD04 — Number of periods (e.g., 6 for "6 weeks") */
  periodCount: number;

  /** HSD06 — Total duration in days (e.g., 42 for 6 weeks) */
  totalDurationDays?: number;
}

// ─── Service Line ─────────────────────────────────────────────────────────────

/**
 * Individual CPT/HCPCS service line item.
 * Maps to the 2000F (Service) loop, SV1 segment.
 * Used when individual service lines need separate authorization.
 */
export interface ServiceLine {
  /** SV101-2 — CPT or HCPCS procedure code (e.g., '97110') */
  cptCode: string;

  /**
   * SV101-3/4 — Procedure modifiers.
   * Common: 'GP' (PT plan of care), 'GO' (OT plan of care), 'GN' (ST plan of care).
   * Also: 'KX' (medical necessity documented), '59' (distinct service).
   */
  modifiers?: string[];

  /**
   * SV105 — Units of service requested.
   * Interpretation depends on unitType: 'UN' = 15-min units, 'VS' = visits.
   */
  units?: number;

  /** HSD01 qualifier — 'UN' = Units (15-min), 'VS' = Visits */
  unitType?: "UN" | "VS";

  /** Human-readable description (not transmitted in 278; for display only) */
  description?: string;
}

// ─── Authorization ────────────────────────────────────────────────────────────

export interface Authorization extends TimestampedEntity {
  id: string;
  practiceId: string;
  patientId: string;
  payerId: string;

  /** Rendering/treating provider — maps to 2010EA NM1 */
  providerId?: string;

  status: PAStatus;
  authNumber: string | null;

  // ── 278 UM Segment Fields ──

  /**
   * UM02 — Type of certification being requested.
   * 'I' = Initial, 'R' = Renewal/Extension, 'S' = Revised, 'A' = Admission.
   */
  certificationTypeCode?: CertificationTypeCode;

  /**
   * UM03 — Service type code.
   * 'AD' = Occupational Therapy, 'AE' = Physical Medicine (PT), 'AF' = Speech Therapy.
   * Auto-populated from provider discipline when possible.
   */
  serviceTypeCode?: ServiceTypeCode;

  /**
   * UM06 — Level of service / urgency.
   * 'E' = Emergency, 'U' = Urgent, 'R' = Routine/Elective.
   */
  levelOfServiceCode?: LevelOfServiceCode;

  /**
   * UM04-1 — Place of service / facility type code.
   * Common: '11' = Office, '22' = Outpatient Hospital, '12' = Home Health.
   * Typically defaults to clinic's configured facilityTypeCode.
   */
  placeOfServiceCode?: string;

  /**
   * UM01 — Request category code.
   * 'HS' = Health Services Review (standard for outpatient PT/OT/ST).
   * 'SC' = Specialty Care Referral, 'AR' = Admission Review.
   */
  requestCategoryCode?: string;

  // ── Legacy / Simple Fields ──
  /** Simple CPT code list (for display and legacy support). See serviceLines for full detail. */
  cptCodes: string[];
  icdCodes: string[];

  // ── Visit Pattern (HSD Segment) ──

  /**
   * Structured visit frequency/duration request.
   * Maps to HSD segment in 2000E loop.
   * Replaces simple requestedVisits for 278 generation.
   */
  visitPattern?: VisitPattern;

  /** Legacy: total visits requested (used when visitPattern is not set) */
  requestedVisits: number;
  approvedVisits: number | null;

  // ── Service Lines (2000F Loop) ──

  /**
   * Individual service line items with CPT codes and modifiers.
   * Maps to the 2000F (Service) loop.
   * When present, these drive the SV1 segments in the 278.
   */
  serviceLines?: ServiceLine[];

  // ── Dates ──
  startDate: string | null;   // YYYY-MM-DD — DTP: requested service start
  endDate: string | null;     // YYYY-MM-DD — DTP: requested service end

  /**
   * Date of onset or injury (YYYY-MM-DD).
   * Maps to DTP with qualifier in 2000E loop.
   * Required when UM05 (related causes) is present (accident/injury).
   */
  onsetDate?: string;

  // ── References ──

  /**
   * Previous authorization number — for renewal/revision requests.
   * Maps to REF in the 2000E loop.
   */
  previousAuthNumber?: string;

  /**
   * Internal tracking/reference number for this transaction.
   * Maps to BHT03 (submitter transaction identifier) and TRN segment.
   */
  internalTrackingNumber?: string;

  // ── Clinical ──
  visitsUsed: number;
  clinicalSummary: string | null;

  /**
   * Free-text clinical message to the UMO.
   * Maps to MSG segment in 2000E loop.
   */
  clinicalNotes?: string;

  /**
   * Accident indicator code (UM05).
   * 'AA' = Auto Accident, 'OA' = Other Accident. Omit if not accident-related.
   */
  accidentIndicator?: string;

  // ── Response Fields (populated from 278-11 response) ──

  /**
   * HCR01 — Decision action code from 278 response.
   * 'A1' = Certified/Approved, 'A2' = Modified, 'A3' = Denied, 'A4' = Pended.
   */
  decisionCode?: string;

  decisionMessage?: string;

  /**
   * HCR03 start — Certification/authorization period start date (from response).
   */
  certificationPeriodStart?: string;

  /**
   * HCR03 end — Certification/authorization period end date (from response).
   */
  certificationPeriodEnd?: string;

  // ── Timestamps ──
  submittedAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface AuthorizationWithRelations extends Authorization {
  patient: Patient;
  payer: Payer;
  provider?: Provider;
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

/**
 * Full X12 278 request payload — assembled just before EDI generation.
 * Combines data from Practice/ClinicConfig, Provider, Patient, and Authorization.
 */
export interface X12278Request {
  // BHT segment
  transactionId: string;           // BHT03 — internal reference
  transactionDate: string;         // BHT04 — CCYYMMDD
  transactionTime: string;         // BHT05 — HHMM

  // ISA/GS — sender/receiver (from ClinicConfig)
  ediSenderQualifier: string;      // ISA05
  ediSenderId: string;             // ISA06
  ediReceiverQualifier: string;    // ISA07
  ediReceiverId: string;           // ISA08

  // 2000A — Payer/UMO
  payer: {
    name: string;                  // NM103
    ediId: string;                 // NM109
    idQualifier: "PI" | "46";     // NM108
  };

  // 2000B — Requester/Submitting Provider (Group Practice)
  submitter: {
    practiceId: string;
    practiceName: string;          // NM103
    groupNpi: string;              // NM109
    taxonomyCodes: string[];       // PRV03
    address: Address;              // N3/N4
    phone: string;                 // PER
    fax?: string;
    facilityTypeCode: string;      // UM04-1
    claimType: "B" | "A";         // UM04-2
  };

  // 2000E — Patient Event / Authorization Request
  authRequest: {
    requestCategoryCode: string;   // UM01
    certificationTypeCode: string; // UM02
    serviceTypeCode: string;       // UM03
    levelOfServiceCode?: string;   // UM06
    traceNumber: string;           // TRN
    diagnoses: string[];           // HI — ICD-10 codes (BF qualifier)
    startDate?: string;            // DTP
    endDate?: string;              // DTP
    onsetDate?: string;            // DTP
    visitPattern?: VisitPattern;   // HSD
    /** Fallback total visits when no structured visitPattern is set (HSD*VS). */
    requestedVisits?: number;
    previousAuthNumber?: string;   // REF
    clinicalNotes?: string;        // MSG
  };

  // 2010EA — Rendering/Treating Provider
  provider: {
    providerId: string;
    lastName: string;              // NM103
    firstName: string;             // NM104
    npi: string;                   // NM109
    taxonomyCode: string;          // PRV03
    stateLicenseNumber?: string;   // REF*0B
    address?: Address;             // N3/N4
    phone?: string;                // PER
  };

  // 2000C — Subscriber
  subscriber: {
    lastName: string;              // NM103
    firstName: string;             // NM104
    middleName?: string;           // NM105
    memberId: string;              // NM109
    dob?: string;                  // DMG02
    gender?: "M" | "F" | "U";     // DMG03
    address?: Address;             // N3/N4
    groupNumber?: string;          // REF
  };

  // 2000D — Dependent (only present when patient ≠ subscriber)
  dependent?: {
    lastName: string;              // NM103
    firstName: string;             // NM104
    middleName?: string;           // NM105
    dob?: string;                  // DMG02
    gender?: "M" | "F" | "U";     // DMG03
    relationshipCode: string;      // INS
  };

  // 2000F — Service lines (optional; used when per-CPT auth is needed)
  serviceLines?: ServiceLine[];
}

export interface X12278Response {
  transactionId: string;
  authNumber: string | null;
  status: "approved" | "denied" | "pending" | "modified" | "error";
  decisionCode?: string;  // HCR01: A1=Approved, A2=Modified, A3=Denied, A4=Pended
  message: string;
  certificationPeriodStart?: string;
  certificationPeriodEnd?: string;
  /** Certified visit count when the response carries an HSD*VS segment. */
  certifiedVisits?: number;
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
  providerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PatientFilters extends PaginationParams {
  search?: string;
  payerId?: string;
}
