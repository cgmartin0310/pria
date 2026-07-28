import { eq, and, desc, sql, gte, lt, isNotNull, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import * as ediService from "./edi.service.js";
import * as aiService from "./ai.service.js";
import { paSubmitQueue } from "../jobs/queue.js";
import {
  getPayerDisplayNames,
  applyPayerDisplayName,
} from "./clearinghouse.service.js";
import type { Authorization, AuthorizationFilters } from "@pria/shared";

const {
  authorizations,
  authorizationHistory,
  authorizationDocuments,
  patients,
  providers,
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

  const [items, countResult, payerNames] = await Promise.all([
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
    getPayerDisplayNames(practiceId),
  ]);

  // Attachment counts, so the list can show which auths have their documents.
  const ids = items.map((a) => a.id);
  const docCounts = new Map<string, number>();
  if (ids.length > 0) {
    const rows = await db
      .select({
        authorizationId: schema.authorizationDocuments.authorizationId,
        count: sql<number>`count(*)`,
      })
      .from(schema.authorizationDocuments)
      .where(
        and(
          inArray(schema.authorizationDocuments.authorizationId, ids),
          isNotNull(schema.authorizationDocuments.fileName)
        )
      )
      .groupBy(schema.authorizationDocuments.authorizationId);
    for (const r of rows) docCounts.set(r.authorizationId, Number(r.count));
  }

  return {
    data: items.map((a) => ({
      ...a,
      payer: applyPayerDisplayName(a.payer, payerNames),
      documentCount: docCounts.get(a.id) ?? 0,
    })),
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
  const [auth, payerNames] = await Promise.all([
    db.query.authorizations.findFirst({
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
    }),
    getPayerDisplayNames(practiceId),
  ]);
  if (!auth) return auth;
  return {
    ...auth,
    payer: applyPayerDisplayName(auth.payer, payerNames),
    patient: auth.patient
      ? {
          ...auth.patient,
          payer: applyPayerDisplayName(auth.patient.payer, payerNames),
        }
      : auth.patient,
  };
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
    startDate?: string | null;
    endDate?: string | null;
    clinicalSummary?: string;
    providerId?: string;
    certificationTypeCode?: string;
    serviceTypeCode?: string;
    levelOfServiceCode?: string;
    placeOfServiceCode?: string;
    visitPattern?: {
      visitsPerPeriod: number;
      periodFrequency: "DA" | "WK" | "MO";
      periodCount: number;
      totalDurationDays?: number;
    };
    clinicalNotes?: string;
    serviceLocation?: {
      label?: string;
      street: string;
      city: string;
      state?: string;
      zip?: string;
    };
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

  // Same tenant check for the treating provider, when one is assigned.
  if (data.providerId) {
    const provider = await db.query.providers.findFirst({
      columns: { id: true },
      where: and(
        eq(providers.id, data.providerId),
        eq(providers.practiceId, practiceId)
      ),
    });
    if (!provider) {
      throw new Error("Provider not found");
    }
  }

  const [auth] = await db
    .insert(authorizations)
    .values({
      practiceId,
      patientId: data.patientId,
      payerId: data.payerId,
      providerId: data.providerId ?? null,
      status: "draft",
      cptCodes: data.cptCodes,
      icdCodes: data.icdCodes,
      requestedVisits: data.requestedVisits,
      certificationTypeCode: data.certificationTypeCode ?? null,
      serviceTypeCode: data.serviceTypeCode ?? null,
      levelOfServiceCode: data.levelOfServiceCode ?? null,
      placeOfServiceCode: data.placeOfServiceCode ?? null,
      visitPattern: data.visitPattern ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      clinicalSummary: data.clinicalSummary ?? null,
      clinicalNotes: data.clinicalNotes ?? null,
      serviceLocation: data.serviceLocation ?? null,
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

/**
 * Edit an authorization. Allowed while it's a draft, and while it's
 * "submitted" but nothing has actually reached a payer yet (no clearinghouse
 * id, no decision) — that state is really "queued", and fixing a wrong
 * therapist there shouldn't require rebuilding the whole request.
 */
export async function updateAuthorization(
  authorizationId: string,
  practiceId: string,
  data: Record<string, unknown>
) {
  const existing = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
  });
  if (!existing) throw new Error("Authorization not found");

  const filed = !!existing.clearinghouseSubmissionId || !!existing.decisionCode;
  if (filed || !["draft", "submitted", "pending"].includes(existing.status)) {
    throw new Error(
      `This authorization can't be edited — it has already been filed with the payer`
    );
  }

  if (data["providerId"]) {
    const provider = await db.query.providers.findFirst({
      columns: { id: true },
      where: and(
        eq(providers.id, String(data["providerId"])),
        eq(providers.practiceId, practiceId)
      ),
    });
    if (!provider) throw new Error("Provider not found");
  }

  const [updated] = await db
    .update(authorizations)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(authorizations.id, authorizationId),
        eq(authorizations.practiceId, practiceId)
      )
    )
    .returning();

  await recordHistory({
    authorizationId,
    action: "edited",
    fromStatus: existing.status,
    toStatus: existing.status,
    performedBy: "user",
    notes: "Authorization details updated before filing",
  });

  return updated;
}

/**
 * Renew an authorization: clone it into a fresh draft with the next date
 * window. Therapy auths run in fixed periods (often 6 months), so continuing
 * care means re-filing the same request — same patient, therapist, codes,
 * location — for the next window.
 */
export async function renewAuthorization(
  authorizationId: string,
  practiceId: string
) {
  const prior = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
  });
  if (!prior) throw new Error("Authorization not found");

  // The new window starts the day after the old one ends (or today, if the
  // old window already lapsed).
  const today = new Date();
  const priorEnd = prior.endDate ? new Date(`${prior.endDate}T00:00:00`) : null;
  const start =
    priorEnd && priorEnd >= today
      ? new Date(priorEnd.getTime() + 86_400_000)
      : today;

  // Reuse the payer's auth window when the practice has recorded one.
  const link = await db.query.clearinghousePayers.findFirst({
    where: and(
      eq(schema.clearinghousePayers.practiceId, practiceId),
      eq(schema.clearinghousePayers.payerId, prior.payerId)
    ),
  });
  const months = link?.authPolicy?.authPeriodMonths ?? 6;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [renewed] = await db
    .insert(authorizations)
    .values({
      practiceId,
      patientId: prior.patientId,
      payerId: prior.payerId,
      providerId: prior.providerId,
      status: "draft",
      cptCodes: prior.cptCodes,
      icdCodes: prior.icdCodes,
      requestedVisits: prior.requestedVisits,
      certificationTypeCode: "S", // renewal/subsequent, not an initial request
      serviceTypeCode: prior.serviceTypeCode,
      levelOfServiceCode: prior.levelOfServiceCode,
      placeOfServiceCode: prior.placeOfServiceCode,
      serviceLocation: prior.serviceLocation,
      visitPattern: prior.visitPattern,
      startDate: iso(start),
      endDate: iso(end),
      clinicalNotes: prior.clinicalNotes,
    })
    .returning();

  if (!renewed) throw new Error("Failed to create the renewal");

  await recordHistory({
    authorizationId: renewed.id,
    action: "renewed_from",
    fromStatus: null,
    toStatus: "draft",
    performedBy: "user",
    notes: `Renewal of authorization ${prior.internalTrackingNumber ?? prior.id}`,
  });

  return renewed;
}

// ─── Submit Authorization ─────────────────────────────────────────────────────

export async function submitAuthorization(
  authorizationId: string,
  practiceId: string
) {
  const auth = await getAuthorizationById(authorizationId, practiceId);
  if (!auth) throw new Error("Authorization not found");

  // A "submitted" auth with no clearinghouse id and no decision is STUCK —
  // its submit job died before filing anything. Allow re-queueing those.
  const isStuckRetry =
    auth.status === "submitted" &&
    !auth.clearinghouseSubmissionId &&
    !auth.decisionCode;

  if (auth.status !== "draft" && !isStuckRetry) {
    throw new Error(`Cannot submit authorization in ${auth.status} status`);
  }

  if (auth.status === "draft") {
    // Mark submitted BEFORE queueing: a fast worker (Test Mode decides
    // instantly) could otherwise apply the decision first and have it stomped
    // back to "submitted" by this update. The status guard also makes
    // double-submits idempotent under concurrency.
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
    fromStatus: isStuckRetry ? "submitted" : "draft",
    toStatus: "submitted",
    performedBy: "user",
    notes: isStuckRetry
      ? "Re-queued a stuck submission (no clearinghouse id, no decision)"
      : "Queued for EDI submission",
  });

  return { id: authorizationId, status: "submitted" as const };
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
      // Expiring = approved auths whose window closes within 45 days. The
      // payer's certified end date (expires_at) is only set when a 278
      // RESPONSE comes back; portal filings never take that path, so fall back
      // to the requested end date the practice entered.
      db.query.authorizations.findMany({
        columns: { id: true, endDate: true, expiresAt: true, approvedVisits: true },
        with: { patient: true, payer: true },
        where: and(
          eq(authorizations.practiceId, practiceId),
          eq(authorizations.status, "approved"),
          sql`coalesce(${authorizations.expiresAt}::date, ${authorizations.endDate}::date)
                between current_date and current_date + interval '45 days'`
        ),
        orderBy: [
          sql`coalesce(${authorizations.expiresAt}::date, ${authorizations.endDate}::date) asc`,
        ],
        limit: 20,
      }),
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
    expiringSoon: expiringSoon.length,
    expiring: expiringSoon.map((a) => ({
      id: a.id,
      patientName: a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "",
      payerName: a.payer?.name ?? "",
      endDate: (a.expiresAt ? String(a.expiresAt).slice(0, 10) : a.endDate) ?? null,
      approvedVisits: a.approvedVisits ?? null,
    })),
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
