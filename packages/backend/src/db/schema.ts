import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "./utils.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const paStatusEnum = pgEnum("pa_status", [
  "draft",
  "submitted",
  "pending",
  "approved",
  "denied",
  "expired",
  "appeal",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "therapist",
  "billing",
]);

export const planTierEnum = pgEnum("plan_tier", [
  "solo",
  "practice",
  "enterprise",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "clinical_note",
  "letter_of_necessity",
  "appeal",
]);

// ─── Practices ────────────────────────────────────────────────────────────────

export const practices = pgTable("practices", {
  id: varchar("id", { length: 26 })
    .primaryKey()
    .$defaultFn(() => createId()),
  name: varchar("name", { length: 255 }).notNull(),
  /** Group NPI (Type 2) — maps to 2000B NM109 */
  npi: varchar("npi", { length: 10 }).notNull(),
  address: jsonb("address").notNull().$type<{
    street: string;
    city: string;
    state: string;
    zip: string;
  }>(),
  phone: varchar("phone", { length: 20 }).notNull(),
  /** PER contact fax — used in 278 2000B PER segment */
  fax: varchar("fax", { length: 20 }),
  /** PER contact email */
  email: varchar("email", { length: 255 }),
  plan: planTierEnum("plan").notNull().default("solo"),
  /**
   * Clinic-level EDI / 278 configuration. Configured ONCE during clinic setup.
   * NOT collected per-patient or per-authorization.
   */
  clinicConfig: jsonb("clinic_config").$type<{
    /** PRV03 — taxonomy codes for the practice (e.g. ['225100000X'] for PT) */
    taxonomyCodes: string[];
    /** UM04-1 — facility type code ('11'=Office, '22'=Outpatient Hospital) */
    facilityTypeCode: string;
    /** UM04-2 — claim type: 'B'=Professional, 'A'=Institutional */
    claimType: "B" | "A";
    /** ISA05 — interchange sender qualifier (typically 'ZZ') */
    ediSenderQualifier: string;
    /** ISA06 — interchange sender ID assigned by clearinghouse */
    ediSenderId: string;
    /** ISA07 — interchange receiver qualifier (typically 'ZZ') */
    ediReceiverQualifier: string;
    /** ISA08 — interchange receiver ID (clearinghouse ID) */
    ediReceiverId: string;
    /** GS02 — application sender ID (often same as ediSenderId) */
    gsApplicationSenderId?: string;
    /** GS03 — application receiver ID */
    gsApplicationReceiverId?: string;
    /** UM01 default — request category code ('HS' for outpatient PT/OT/ST) */
    requestCategoryCode?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("therapist"),
    clerkId: varchar("clerk_id", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_practice_id_idx").on(t.practiceId),
    index("users_clerk_id_idx").on(t.clerkId),
  ]
);

// ─── Payers ───────────────────────────────────────────────────────────────────

export const payers = pgTable(
  "payers",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar("name", { length: 255 }).notNull(),
    /** EDI Payer ID — maps to 2000A NM109 in the 278 transaction */
    payerId: varchar("payer_id", { length: 50 }).notNull(),
    /**
     * NM108 qualifier for the payer ID.
     * 'PI' = Payer ID (most commercial payers), '46' = ETIN.
     */
    payerIdQualifier: varchar("payer_id_qualifier", { length: 5 })
      .notNull()
      .default("PI"),
    portalUrl: text("portal_url"),
    rulesConfig: jsonb("rules_config")
      .notNull()
      .$type<{
        requiresPreAuth: boolean;
        submissionMethod: "x12" | "portal" | "fax" | "phone";
        avgDecisionDays: number;
        notes: string;
      }>()
      .default({
        requiresPreAuth: true,
        submissionMethod: "x12",
        avgDecisionDays: 5,
        notes: "",
      }),
    supportsX278: boolean("supports_x278").notNull().default(false),
    supportsFhir: boolean("supports_fhir").notNull().default(false),
    /** Optional clearinghouse routing info for this payer */
    clearinghouseRouting: jsonb("clearinghouse_routing").$type<{
      clearinghouseId: string;
      clearinghouseName: string;
      notes?: string;
    }>(),
  },
  (t) => [uniqueIndex("payers_payer_id_idx").on(t.payerId)]
);

// ─── Patients ─────────────────────────────────────────────────────────────────

export const patients = pgTable(
  "patients",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    payerId: varchar("payer_id", { length: 26 }).references(() => payers.id),

    // ─ Core demographics ─
    firstName: varchar("first_name", { length: 100 }).notNull(),   // 2000C/D NM104
    lastName: varchar("last_name", { length: 100 }).notNull(),     // 2000C/D NM103
    /** NM105 — patient middle name */
    middleName: varchar("middle_name", { length: 100 }),
    dob: varchar("dob", { length: 10 }).notNull(),                 // YYYY-MM-DD → DMG02
    /** DMG03 — gender code: 'M', 'F', or 'U' */
    gender: varchar("gender", { length: 1 }),
    /** N3/N4 — patient address */
    address: jsonb("address").$type<{
      street: string;
      city: string;
      state: string;
      zip: string;
    }>(),
    phone: varchar("phone", { length: 20 }),

    // ─ Insurance ─
    /**
     * Insurance Member ID (from insurance card).
     * Maps to 2000C NM109 (qualifier MI).
     * MOST CRITICAL field for 278 generation.
     */
    memberId: varchar("member_id", { length: 100 }).notNull(),
    /**
     * Relationship to subscriber. '18'=Self, '01'=Spouse, '19'=Child.
     * Maps to INS segment in 2000C/2000D loops.
     * Default '18' (self) means patient IS the subscriber.
     */
    relationshipToSubscriber: varchar("relationship_to_subscriber", { length: 5 })
      .notNull()
      .default("18"),
    /** Plan/group number — maps to 2000C REF */
    groupNumber: varchar("group_number", { length: 50 }),

    // ─ Subscriber info (only when patient is a dependent, i.e. relationship ≠ '18') ─
    /** 2000C NM103 — subscriber last name (when patient is a dependent) */
    subscriberLastName: varchar("subscriber_last_name", { length: 100 }),
    /** 2000C NM104 */
    subscriberFirstName: varchar("subscriber_first_name", { length: 100 }),
    /** 2000C NM105 */
    subscriberMiddleName: varchar("subscriber_middle_name", { length: 100 }),
    /** 2000C NM109 — subscriber/policyholder member ID */
    subscriberMemberId: varchar("subscriber_member_id", { length: 100 }),
    /** 2000C DMG02 — subscriber date of birth (YYYY-MM-DD) */
    subscriberDob: varchar("subscriber_dob", { length: 10 }),
    /** 2000C DMG03 — subscriber gender */
    subscriberGender: varchar("subscriber_gender", { length: 1 }),
    /** 2000C N3/N4 — subscriber address */
    subscriberAddress: jsonb("subscriber_address").$type<{
      street: string;
      city: string;
      state: string;
      zip: string;
    }>(),

    // ─ Clinical ─
    diagnosisCodes: jsonb("diagnosis_codes")
      .notNull()
      .$type<string[]>()
      .default([]),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("patients_practice_id_idx").on(t.practiceId),
    index("patients_payer_id_idx").on(t.payerId),
    index("patients_name_idx").on(t.lastName, t.firstName),
  ]
);

// ─── Authorizations ───────────────────────────────────────────────────────────


// ─── Providers ────────────────────────────────────────────────────────────────

/**
 * Individual therapist/provider records.
 * Maps to the 2010EA (Patient Event Provider) loop in the X12 278.
 * Configured once per therapist — NOT collected per authorization.
 */
export const providers = pgTable(
  "providers",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    /** Optional link to a User record if the provider has portal access */
    userId: varchar("user_id", { length: 26 }).references(() => users.id),
    /** Individual (Type 1) NPI — maps to 2010EA NM109 */
    npi: varchar("npi", { length: 10 }).notNull(),
    /** NM103 */
    lastName: varchar("last_name", { length: 100 }).notNull(),
    /** NM104 */
    firstName: varchar("first_name", { length: 100 }).notNull(),
    /** NM107 (suffix/credentials e.g. 'DPT', 'OTR/L', 'CCC-SLP') */
    suffix: varchar("suffix", { length: 50 }),
    /** Display credentials (for UI; not transmitted in 278) */
    credentials: varchar("credentials", { length: 100 }),
    /** PRV03 — taxonomy code (e.g. '225100000X' for PT) */
    taxonomyCode: varchar("taxonomy_code", { length: 20 }).notNull(),
    /** REF*0B — state license number (some payers require for therapy) */
    stateLicenseNumber: varchar("state_license_number", { length: 50 }),
    /** Discipline: 'PT' | 'OT' | 'ST' — drives auto-population of service codes/modifiers */
    discipline: varchar("discipline", { length: 5 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("providers_practice_id_idx").on(t.practiceId),
    index("providers_user_id_idx").on(t.userId),
    uniqueIndex("providers_npi_idx").on(t.npi),
  ]
);

export const authorizations = pgTable(
  "authorizations",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    patientId: varchar("patient_id", { length: 26 })
      .notNull()
      .references(() => patients.id),
    payerId: varchar("payer_id", { length: 26 })
      .notNull()
      .references(() => payers.id),
    /** Rendering/treating provider — maps to 2010EA NM1 */
    providerId: varchar("provider_id", { length: 26 }).references(() => providers.id),

    status: paStatusEnum("status").notNull().default("draft"),
    /** Authorization number from payer response — HCR02 */
    authNumber: varchar("auth_number", { length: 100 }),

    // 278 UM Segment Fields
    /** UM02: 'I'=Initial, 'R'=Renewal, 'S'=Revised, 'A'=Admission */
    certificationTypeCode: varchar("certification_type_code", { length: 2 }),
    /** UM03: 'AD'=OT, 'AE'=PT, 'AF'=Speech. Auto-populated from provider discipline. */
    serviceTypeCode: varchar("service_type_code", { length: 5 }),
    /** UM06: 'E'=Emergency, 'U'=Urgent, 'R'=Routine */
    levelOfServiceCode: varchar("level_of_service_code", { length: 2 }),
    /** UM04-1: '11'=Office, '22'=Outpatient Hospital. Defaults to clinic config. */
    placeOfServiceCode: varchar("place_of_service_code", { length: 5 }),
    /** UM01: 'HS'=Health Services Review (standard for outpatient PT/OT/ST) */
    requestCategoryCode: varchar("request_category_code", { length: 5 }),

    // Codes (flat lists for legacy/display; serviceLines preferred for 278 generation)
    cptCodes: jsonb("cpt_codes").notNull().$type<string[]>().default([]),
    icdCodes: jsonb("icd_codes").notNull().$type<string[]>().default([]),

    // Visit Pattern (HSD Segment)
    /** Structured visit frequency/duration. Maps to HSD segment in 2000E loop. */
    visitPattern: jsonb("visit_pattern").$type<{
      visitsPerPeriod: number;           // HSD02
      periodFrequency: "DA" | "WK" | "MO"; // HSD03
      periodCount: number;               // HSD04
      totalDurationDays?: number;        // HSD06
    }>(),
    /** Legacy: total visits requested (used when visitPattern is not set) */
    requestedVisits: integer("requested_visits").notNull().default(12),
    approvedVisits: integer("approved_visits"),

    // Service Lines (2000F Loop)
    /** Individual CPT service lines with modifiers. Maps to 2000F SV1 segments. */
    serviceLines: jsonb("service_lines").$type<Array<{
      cptCode: string;          // SV101-2
      modifiers?: string[];     // SV101-3/4 (GP, GO, GN, KX, 59)
      units?: number;           // SV105
      unitType?: "UN" | "VS";   // HSD01 qualifier
      description?: string;
    }>>(),

    // Dates
    startDate: varchar("start_date", { length: 10 }),    // YYYY-MM-DD: DTP service start
    endDate: varchar("end_date", { length: 10 }),        // YYYY-MM-DD: DTP service end
    /** Onset/injury date (YYYY-MM-DD). Maps to DTP in 2000E loop. */
    onsetDate: varchar("onset_date", { length: 10 }),

    // References
    /** Previous auth number for renewals. Maps to REF in 2000E loop. */
    previousAuthNumber: varchar("previous_auth_number", { length: 100 }),
    /** Internal tracking ID. Maps to BHT03 and TRN segment. */
    internalTrackingNumber: varchar("internal_tracking_number", { length: 100 }),
    /**
     * The clearinghouse's own id for this submission (e.g. Availity's service
     * review id), used to poll for the payer's decision.
     */
    clearinghouseSubmissionId: varchar("clearinghouse_submission_id", { length: 255 }),

    // Clinical
    visitsUsed: integer("visits_used").notNull().default(0),
    clinicalSummary: text("clinical_summary"),
    /** Free-text clinical message to UMO. Maps to MSG segment in 2000E. */
    clinicalNotes: text("clinical_notes"),
    /** UM05: 'AA'=Auto Accident, 'OA'=Other Accident. Null if not accident-related. */
    accidentIndicator: varchar("accident_indicator", { length: 3 }),

    // Response fields (populated from 278-11 response)
    /** HCR01: 'A1'=Certified, 'A2'=Modified, 'A3'=Denied, 'A4'=Pended */
    decisionCode: varchar("decision_code", { length: 5 }),
    decisionMessage: text("decision_message"),
    /** HCR03 start: certification period start date from response (YYYY-MM-DD) */
    certificationPeriodStart: varchar("certification_period_start", { length: 10 }),
    /** HCR03 end: certification period end date from response (YYYY-MM-DD) */
    certificationPeriodEnd: varchar("certification_period_end", { length: 10 }),

    submittedAt: timestamp("submitted_at"),
    decidedAt: timestamp("decided_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("auths_practice_id_idx").on(t.practiceId),
    index("auths_patient_id_idx").on(t.patientId),
    index("auths_payer_id_idx").on(t.payerId),
    index("auths_provider_id_idx").on(t.providerId),
    index("auths_status_idx").on(t.status),
    index("auths_expires_at_idx").on(t.expiresAt),
  ]
);

// ─── Authorization Documents ──────────────────────────────────────────────────

export const authorizationDocuments = pgTable(
  "authorization_documents",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    authorizationId: varchar("authorization_id", { length: 26 })
      .notNull()
      .references(() => authorizations.id, { onDelete: "cascade" }),
    type: documentTypeEnum("type").notNull(),
    content: text("content").notNull(),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_docs_auth_id_idx").on(t.authorizationId)]
);

// ─── Authorization History ────────────────────────────────────────────────────

export const authorizationHistory = pgTable(
  "authorization_history",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    authorizationId: varchar("authorization_id", { length: 26 })
      .notNull()
      .references(() => authorizations.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    fromStatus: paStatusEnum("from_status"),
    toStatus: paStatusEnum("to_status").notNull(),
    notes: text("notes"),
    performedBy: varchar("performed_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_history_auth_id_idx").on(t.authorizationId)]
);

// ─── Payer Rules ──────────────────────────────────────────────────────────────

export const payerRules = pgTable(
  "payer_rules",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    payerId: varchar("payer_id", { length: 26 })
      .notNull()
      .references(() => payers.id, { onDelete: "cascade" }),
    cptCode: varchar("cpt_code", { length: 10 }).notNull(),
    requiresAuth: boolean("requires_auth").notNull().default(true),
    visitThreshold: integer("visit_threshold"),
    criteria: jsonb("criteria")
      .notNull()
      .$type<{
        diagnosisRequired: boolean;
        functionalLimitationsRequired: boolean;
        progressNotesRequired: boolean;
        physicianOrderRequired: boolean;
        additionalDocs: string[];
        notes: string;
      }>()
      .default({
        diagnosisRequired: true,
        functionalLimitationsRequired: true,
        progressNotesRequired: false,
        physicianOrderRequired: false,
        additionalDocs: [],
        notes: "",
      }),
    lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  },
  (t) => [
    index("payer_rules_payer_id_idx").on(t.payerId),
    uniqueIndex("payer_rules_payer_cpt_idx").on(t.payerId, t.cptCode),
  ]
);

// ─── Clearinghouses ───────────────────────────────────────────────────────────

/**
 * Networks Pria can submit 278s through (Claim.MD, Availity, ...).
 * Global reference data — the same networks are offered to every practice.
 */
export const clearinghouses = pgTable(
  "clearinghouses",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    /** Stable slug used by the code to pick an adapter, e.g. 'claim_md' */
    key: varchar("key", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Whether an adapter is implemented + selectable */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clearinghouses_key_idx").on(t.key)]
);

/**
 * A practice's connection to a clearinghouse — holds the API credential and
 * is the per-practice multi-tenancy boundary for clearinghouse access.
 */
export const practiceClearinghouses = pgTable(
  "practice_clearinghouses",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    clearinghouseId: varchar("clearinghouse_id", { length: 26 })
      .notNull()
      .references(() => clearinghouses.id),
    label: varchar("label", { length: 255 }),
    /**
     * API credentials for the clearinghouse.
     * New writes store `{ enc: "<AES-256-GCM token>" }` — the encrypted JSON of
     * the fields below (see lib/crypto). Legacy rows may still hold the fields
     * in plaintext; readers must go through decryptChCredentials(), which
     * handles both shapes. Never returned to the frontend (masked).
     */
    credentials: jsonb("credentials")
      .notNull()
      .$type<{
        /** Encrypted form: AES-256-GCM token of the JSON credentials. */
        enc?: string;
        /** Claim.MD-style single key (legacy plaintext). */
        accountKey?: string;
        /** Availity OAuth2 client credentials (legacy plaintext). */
        clientId?: string;
        clientSecret?: string;
        scope?: string;
        /** Availity demo/sandbox mode (canned mock responses). */
        demo?: boolean;
        /** Which Availity host authenticated successfully (resolved on connect). */
        environment?: "production" | "test";
        /** Test Mode only: which decision the simulated payer returns. */
        simulatedDecision?: "A1" | "A3" | "A4";
      }>()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("practice_ch_practice_idx").on(t.practiceId),
    uniqueIndex("practice_ch_unique_idx").on(t.practiceId, t.clearinghouseId),
  ]
);

/**
 * A practice's chosen payers, linked through a clearinghouse: which payers THIS
 * practice works with, the payer's ID as known by that clearinghouse, and
 * capability flags. Per-practice (originally global, which let one tenant's
 * adds/overrides affect every other — see migration 0007). The full network
 * directory lives separately in clearinghouse_payer_directory.
 */
export const clearinghousePayers = pgTable(
  "clearinghouse_payers",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    /** Owning practice. Legacy pre-0007 rows are null and invisible to all. */
    practiceId: varchar("practice_id", { length: 26 }).references(
      () => practices.id,
      { onDelete: "cascade" }
    ),
    clearinghouseId: varchar("clearinghouse_id", { length: 26 })
      .notNull()
      .references(() => clearinghouses.id, { onDelete: "cascade" }),
    payerId: varchar("payer_id", { length: 26 })
      .notNull()
      .references(() => payers.id, { onDelete: "cascade" }),
    /** The payer's ID as known by THIS clearinghouse (e.g. Claim.MD payerid). */
    clearinghousePayerId: varchar("clearinghouse_payer_id", { length: 50 }).notNull(),
    /**
     * 278 capability through this clearinghouse. Claim.MD does not publish a
     * per-payer 278 flag, so this is assumed true on sync and can be turned off
     * by an admin for payers known not to accept 278.
     */
    supports278: boolean("supports_278").notNull().default(true),
    /** Raw capability flags from the clearinghouse payer list (claims/era/etc). */
    capabilities: jsonb("capabilities").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ch_payers_ch_idx").on(t.clearinghouseId),
    index("ch_payers_payer_idx").on(t.payerId),
    index("ch_payers_practice_idx").on(t.practiceId),
    uniqueIndex("ch_payers_practice_unique_idx").on(
      t.practiceId,
      t.clearinghouseId,
      t.payerId
    ),
  ]
);

/**
 * Cached copy of a clearinghouse's FULL payer directory.
 *
 * Availity's payer-list API has no name-search parameter — only paging — so
 * searching by name requires having the whole list locally. We sync it once per
 * clearinghouse and query this table instead of filtering a single page.
 */
export const clearinghousePayerDirectory = pgTable(
  "clearinghouse_payer_directory",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    clearinghouseId: varchar("clearinghouse_id", { length: 26 })
      .notNull()
      .references(() => clearinghouses.id, { onDelete: "cascade" }),
    /** The payer's id as known by the clearinghouse. */
    payerId: varchar("payer_id", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** transactionDescription values from the clearinghouse's routes. */
    transactions: jsonb("transactions").$type<string[]>(),
    /**
     * True when this payer supports a 278 prior-auth REQUEST via the API
     * (Availity Service Reviews, subtype HS). This is the field that decides
     * API vs portal submission — sourced from the Configurations API, NOT the
     * payer list's 278I/278N transaction types.
     */
    supportsServiceReview: boolean("supports_service_review").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ch_dir_ch_idx").on(t.clearinghouseId),
    index("ch_dir_name_idx").on(t.name),
    uniqueIndex("ch_dir_unique_idx").on(t.clearinghouseId, t.payerId),
  ]
);

// ─── Portal automation (agent-driven portal submission) ───────────────────────

export const portalSubmissionStatusEnum = pgEnum("portal_submission_status", [
  "queued", // waiting for a worker
  "logging_in", // agent authenticating (may need MFA)
  "needs_mfa", // paused: a human must supply an MFA code / device trust
  "in_progress", // agent filling the portal form
  "needs_human", // paused: unexpected screen / CAPTCHA / review needed
  "submitted", // accepted by the portal (confirmation captured)
  "failed", // gave up after retries
]);

/**
 * A practice's connection to a web portal that has NO API (e.g. Availity
 * Essentials). Holds ENCRYPTED credentials + a persisted, encrypted browser
 * session so agents log in once and reuse the session across many auths.
 */
export const portalConnections = pgTable(
  "portal_connections",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    /** Which portal, e.g. 'availity_essentials'. */
    portalKey: varchar("portal_key", { length: 50 }).notNull(),
    label: varchar("label", { length: 255 }),
    /** Encrypted JSON: { username, password, totpSeed? }. See lib/crypto. */
    encryptedCredentials: text("encrypted_credentials"),
    /** Encrypted browser storage state (cookies) so any worker can resume login. */
    encryptedSession: text("encrypted_session"),
    /** When the persisted session is expected to still be valid. */
    sessionValidUntil: timestamp("session_valid_until"),
    lastLoginAt: timestamp("last_login_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("portal_conn_practice_idx").on(t.practiceId),
    uniqueIndex("portal_conn_unique_idx").on(t.practiceId, t.portalKey),
  ]
);

/**
 * One queued/attempted portal submission of an authorization. Workers pull
 * these; humans resolve the paused ones (MFA / review).
 */
export const portalSubmissions = pgTable(
  "portal_submissions",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    practiceId: varchar("practice_id", { length: 26 })
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    authorizationId: varchar("authorization_id", { length: 26 })
      .notNull()
      .references(() => authorizations.id, { onDelete: "cascade" }),
    portalConnectionId: varchar("portal_connection_id", { length: 26 })
      .notNull()
      .references(() => portalConnections.id, { onDelete: "cascade" }),
    status: portalSubmissionStatusEnum("status").notNull().default("queued"),
    /** Structured field values the agent enters (from the 278 assembler/mapper). */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** Payer's confirmation/reference number once submitted. */
    confirmationNumber: varchar("confirmation_number", { length: 100 }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Why a human is needed, when status is needs_mfa / needs_human. */
    needsHumanReason: text("needs_human_reason"),
    /** Which worker/agent picked it up (for debugging the pool). */
    claimedBy: varchar("claimed_by", { length: 100 }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("portal_sub_practice_idx").on(t.practiceId),
    index("portal_sub_auth_idx").on(t.authorizationId),
    index("portal_sub_status_idx").on(t.status),
  ]
);

/**
 * A learned, replayable workflow for driving one portal ("teach-by-demo").
 * GLOBAL, not per-practice: record Availity Essentials once and every clinic
 * uses it. Versioned so a portal redesign can be re-recorded without losing the
 * prior recipe. Steps are stored as a flexible JSON array (see RecipeStep).
 */
export const portalRecipes = pgTable(
  "portal_recipes",
  {
    id: varchar("id", { length: 26 })
      .primaryKey()
      .$defaultFn(() => createId()),
    portalKey: varchar("portal_key", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    version: integer("version").notNull().default(1),
    steps: jsonb("steps").notNull().$type<unknown[]>().default([]),
    /** Only one active recipe per portalKey is used by the worker. */
    isActive: boolean("is_active").notNull().default(false),
    createdBy: varchar("created_by", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("portal_recipes_portal_idx").on(t.portalKey),
    uniqueIndex("portal_recipes_version_idx").on(t.portalKey, t.version),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const practiceRelations = relations(practices, ({ many }) => ({
  users: many(users),
  patients: many(patients),
  providers: many(providers),
  authorizations: many(authorizations),
}));

export const userRelations = relations(users, ({ one }) => ({
  practice: one(practices, {
    fields: [users.practiceId],
    references: [practices.id],
  }),
}));

export const payerRelations = relations(payers, ({ many }) => ({
  patients: many(patients),
  authorizations: many(authorizations),
  rules: many(payerRules),
}));

export const patientRelations = relations(patients, ({ one, many }) => ({
  practice: one(practices, {
    fields: [patients.practiceId],
    references: [practices.id],
  }),
  payer: one(payers, {
    fields: [patients.payerId],
    references: [payers.id],
  }),
  authorizations: many(authorizations),
}));

export const providerRelations = relations(providers, ({ one, many }) => ({
  practice: one(practices, {
    fields: [providers.practiceId],
    references: [practices.id],
  }),
  user: one(users, {
    fields: [providers.userId],
    references: [users.id],
  }),
  authorizations: many(authorizations),
}));

export const authorizationRelations = relations(
  authorizations,
  ({ one, many }) => ({
    practice: one(practices, {
      fields: [authorizations.practiceId],
      references: [practices.id],
    }),
    patient: one(patients, {
      fields: [authorizations.patientId],
      references: [patients.id],
    }),
    payer: one(payers, {
      fields: [authorizations.payerId],
      references: [payers.id],
    }),
    provider: one(providers, {
      fields: [authorizations.providerId],
      references: [providers.id],
    }),
    documents: many(authorizationDocuments),
    history: many(authorizationHistory),
  })
);

export const authDocRelations = relations(authorizationDocuments, ({ one }) => ({
  authorization: one(authorizations, {
    fields: [authorizationDocuments.authorizationId],
    references: [authorizations.id],
  }),
}));

export const authHistoryRelations = relations(
  authorizationHistory,
  ({ one }) => ({
    authorization: one(authorizations, {
      fields: [authorizationHistory.authorizationId],
      references: [authorizations.id],
    }),
  })
);

export const payerRuleRelations = relations(payerRules, ({ one }) => ({
  payer: one(payers, {
    fields: [payerRules.payerId],
    references: [payers.id],
  }),
}));

export const clearinghouseRelations = relations(clearinghouses, ({ many }) => ({
  connections: many(practiceClearinghouses),
  payers: many(clearinghousePayers),
}));

export const practiceClearinghouseRelations = relations(
  practiceClearinghouses,
  ({ one }) => ({
    practice: one(practices, {
      fields: [practiceClearinghouses.practiceId],
      references: [practices.id],
    }),
    clearinghouse: one(clearinghouses, {
      fields: [practiceClearinghouses.clearinghouseId],
      references: [clearinghouses.id],
    }),
  })
);

export const clearinghousePayerRelations = relations(
  clearinghousePayers,
  ({ one }) => ({
    clearinghouse: one(clearinghouses, {
      fields: [clearinghousePayers.clearinghouseId],
      references: [clearinghouses.id],
    }),
    payer: one(payers, {
      fields: [clearinghousePayers.payerId],
      references: [payers.id],
    }),
  })
);
