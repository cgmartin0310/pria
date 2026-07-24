import { eq, and, desc, sql, gte, lt, isNotNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import * as ediService from "./edi.service.js";
import * as aiService from "./ai.service.js";
import { paSubmitQueue } from "../jobs/queue.js";
import type { Authorization, AuthorizationFilters } from "@pria/shared";

const {
  authorizations,
  authorizationHistory,
  authorizationDocuments,
  patients,
  payers,
} = schema;

// ─── List Authorizations ──────────────────────────────────────────────────────

export async function listAuthorizations(
  practiceId: string,
  filters: AuthorizationFilters = {}
) {
  const { status, patientId, payerId, page = 1, pageSize = 20 } = filters;

  const conditions = [eq(authorizations.practiceId, practiceId)];
  if (status) conditions.push(eq(authorizations.status, status));
  if (patientId) conditions.push(eq(authorizations.patientId, patientId));
  if (payerId) conditions.push(eq(authorizations.payerId, payerId));

  const [items, countResult] = await Promise.all([
    db.query.authorizations.findMany({
      where: and(...conditions),
      with: { patient: true, payer: true },
      orderBy: [desc(authorizations.updatedAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(authorizations)
      .where(and(...conditions)),
  ]);

  return {
    data: items,
    total: Number(countResult[0]?.count ?? 0),
    page,
    pageSize,
  };
}

// ─── Get Authorization by ID ──────────────────────────────────────────────────

export async function getAuthorizationById(
  id: string,
  practiceId: string
) {
  return db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, id),
      eq(authorizations.practiceId, practiceId)
    ),
    with: {
      patient: { with: { payer: true } },
      payer: true,
      documents: true,
      history: true,
    },
  });
}

// ─── Create Authorization ─────────────────────────────────────────────────────

export async function createAuthorization(
  practiceId: string,
  data: {
    patientId: string;
    payerId: string;
    cptCodes: string[];
    icdCodes: string[];
    requestedVisits: number;
    startDate?: string;
    endDate?: string;
    clinicalSummary?: string;
  }
) {
  // Tenant check: the patient must belong to THIS practice. Without this, a
  // caller could reference another practice's patient id and every downstream
  // reader (get/preview/submit) would join — and transmit — that patient's PHI.
  const patient = await db.query.patients.findFirst({
    columns: { id: true },
    where: and(
      eq(patients.id, data.patientId),
      eq(patients.practiceId, practiceId)
    ),
  });
  if (!patient) {
    throw new Error("Patient not found");
  }

  const [auth] = await db
    .insert(authorizations)
    .values({
      practiceId,
      patientId: data.patientId,
      payerId: data.payerId,
      status: "draft",
      cptCodes: data.cptCodes,
      icdCodes: data.icdCodes,
      requestedVisits: data.requestedVisits,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      clinicalSummary: data.clinicalSummary ?? null,
    })
    .returning();

  if (!auth) throw new Error("Failed to create authorization");

  await recordHistory({
    authorizationId: auth.id,
    action: "created",
    fromStatus: null,
    toStatus: "draft",
    performedBy: "system",
  });

  return auth;
}

// ─── Submit Authorization ─────────────────────────────────────────────────────

export async function submitAuthorization(
  authorizationId: string,
  practiceId: string
) {
  const auth = await getAuthorizationById(authorizationId, practiceId);
  if (!auth) throw new Error("Authorization not found");
  if (auth.status !== "draft") {
    throw new Error(`Cannot submit authorization in ${auth.status} status`);
  }

  // Mark submitted BEFORE queueing: a fast worker (Test Mode decides instantly)
  // could otherwise apply the decision first and have it stomped back to
  // "submitted" by this update. The status guard also makes double-submits
  // idempotent under concurrency.
  const [updated] = await db
    .update(authorizations)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(authorizations.id, authorizationId),
        eq(authorizations.practiceId, practiceId),
        eq(authorizations.status, "draft")
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Authorization was already submitted");
  }

  try {
    await paSubmitQueue.add(
      "pa-submit",
      { authorizationId, practiceId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );
  } catch (queueErr) {
    // Couldn't queue — revert so the user can retry rather than strand it.
    await db
      .update(authorizations)
      .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
      .where(eq(authorizations.id, authorizationId));
    throw queueErr;
  }

  await recordHistory({
    authorizationId,
    action: "submitted",
    fromStatus: "draft",
    toStatus: "submitted",
    performedBy: "user",
    notes: "Queued for EDI submission",
  });

  return updated;
}

// ─── Generate Clinical Summary ────────────────────────────────────────────────

export async function generateClinicalSummaryForAuth(
  authorizationId: string,
  practiceId: string
) {
  const auth = await getAuthorizationById(authorizationId, practiceId);
  if (!auth) throw new Error("Authorization not found");

  const patient = auth.patient;

  const result = await aiService.generateClinicalSummary({
    patientName: `${patient.firstName} ${patient.lastName}`,
    dob: patient.dob,
    diagnosisCodes: patient.diagnosisCodes,
    cptCodes: auth.cptCodes,
    requestedVisits: auth.requestedVisits,
  });

  // Update authorization with generated summary
  await db
    .update(authorizations)
    .set({ clinicalSummary: result.summary, updatedAt: new Date() })
    .where(eq(authorizations.id, authorizationId));

  // Save as document
  await db.insert(authorizationDocuments).values({
    authorizationId,
    type: "clinical_note",
    content: result.summary,
    aiGenerated: true,
  });

  return result;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(practiceId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [pending, approvedMonth, deniedMonth, expiringSoon, avgDecision] = await Promise.all(
    [
      db
        .select({ count: sql<number>`count(*)` })
        .from(authorizations)
        .where(
          and(
            eq(authorizations.practiceId, practiceId),
            eq(authorizations.status, "pending")
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(authorizations)
        .where(
          and(
            eq(authorizations.practiceId, practiceId),
            eq(authorizations.status, "approved"),
            gte(authorizations.decidedAt, startOfMonth)
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(authorizations)
        .where(
          and(
            eq(authorizations.practiceId, practiceId),
            eq(authorizations.status, "denied"),
            gte(authorizations.decidedAt, startOfMonth)
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(authorizations)
        .where(
          and(
            eq(authorizations.practiceId, practiceId),
            eq(authorizations.status, "approved"),
            gte(authorizations.expiresAt, now),
            lt(authorizations.expiresAt, twoWeeksFromNow)
          )
        ),
      // Average days from submission to decision, over auths that have both dates.
      db
        .select({
          avgDays: sql<number | null>`avg(extract(epoch from (${authorizations.decidedAt} - ${authorizations.submittedAt})) / 86400)`,
        })
        .from(authorizations)
        .where(
          and(
            eq(authorizations.practiceId, practiceId),
            isNotNull(authorizations.decidedAt),
            isNotNull(authorizations.submittedAt)
          )
        ),
    ]
  );

  const pendingCount = Number(pending[0]?.count ?? 0);
  const approvedCount = Number(approvedMonth[0]?.count ?? 0);
  const deniedCount = Number(deniedMonth[0]?.count ?? 0);
  const total = approvedCount + deniedCount;

  const avgDaysRaw = avgDecision[0]?.avgDays;
  const avgDecisionDays =
    avgDaysRaw != null ? Math.round(Number(avgDaysRaw) * 10) / 10 : 0;

  return {
    pendingCount,
    approvedThisMonth: approvedCount,
    deniedThisMonth: deniedCount,
    expiringSoon: Number(expiringSoon[0]?.count ?? 0),
    approvalRate: total > 0 ? Math.round((approvedCount / total) * 100) : 0,
    avgDecisionDays,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function recordHistory(params: {
  authorizationId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  notes?: string;
  performedBy: string;
}) {
  await db.insert(authorizationHistory).values({
    authorizationId: params.authorizationId,
    action: params.action,
    fromStatus: params.fromStatus as typeof authorizationHistory.$inferInsert["fromStatus"],
    toStatus: params.toStatus as typeof authorizationHistory.$inferInsert["toStatus"],
    notes: params.notes ?? null,
    performedBy: params.performedBy,
  });
}
