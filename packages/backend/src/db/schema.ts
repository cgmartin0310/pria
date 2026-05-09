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
  npi: varchar("npi", { length: 10 }).notNull(),
  address: jsonb("address").notNull().$type<{
    street: string;
    city: string;
    state: string;
    zip: string;
  }>(),
  phone: varchar("phone", { length: 20 }).notNull(),
  plan: planTierEnum("plan").notNull().default("solo"),
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
    payerId: varchar("payer_id", { length: 50 }).notNull(), // EDI ID
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
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    dob: varchar("dob", { length: 10 }).notNull(), // YYYY-MM-DD
    memberId: varchar("member_id", { length: 100 }).notNull(),
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
    status: paStatusEnum("status").notNull().default("draft"),
    authNumber: varchar("auth_number", { length: 100 }),
    cptCodes: jsonb("cpt_codes").notNull().$type<string[]>().default([]),
    icdCodes: jsonb("icd_codes").notNull().$type<string[]>().default([]),
    requestedVisits: integer("requested_visits").notNull().default(12),
    approvedVisits: integer("approved_visits"),
    startDate: varchar("start_date", { length: 10 }), // YYYY-MM-DD
    endDate: varchar("end_date", { length: 10 }), // YYYY-MM-DD
    visitsUsed: integer("visits_used").notNull().default(0),
    clinicalSummary: text("clinical_summary"),
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

// ─── Relations ────────────────────────────────────────────────────────────────

export const practiceRelations = relations(practices, ({ many }) => ({
  users: many(users),
  patients: many(patients),
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
