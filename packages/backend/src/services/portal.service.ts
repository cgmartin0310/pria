import { eq, and, desc, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { encryptSecret, decryptSecret, encryptionAvailable } from "../lib/crypto.js";
import { totp, totpSecondsRemaining } from "../lib/totp.js";
import { portalSubmitQueue } from "../jobs/queue.js";
import type {
  PortalCredentials,
  PortalSubmissionPayload,
} from "./portal-adapter.types.js";

const { portalConnections, portalSubmissions, authorizations } = schema;

export class PortalError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "PortalError";
  }
}

// ─── Connections ────────────────────────────────────────────────────────────────

export async function connectPortal(
  practiceId: string,
  input: {
    portalKey: string;
    label?: string;
    username: string;
    password: string;
    totpSeed?: string;
  }
) {
  if (!encryptionAvailable()) {
    throw new PortalError(
      500,
      "Credential encryption is not configured (CREDENTIAL_ENCRYPTION_KEY) — cannot store portal credentials"
    );
  }
  if (!input.username || !input.password) {
    throw new PortalError(400, "Username and password are required");
  }

  const creds: PortalCredentials = {
    username: input.username,
    password: input.password,
    ...(input.totpSeed ? { totpSeed: input.totpSeed.replace(/\s/g, "") } : {}),
  };
  const encryptedCredentials = encryptSecret(JSON.stringify(creds));

  const [row] = await db
    .insert(portalConnections)
    .values({
      practiceId,
      portalKey: input.portalKey,
      label: input.label ?? "Availity Essentials",
      encryptedCredentials,
      // Changing credentials invalidates any persisted session.
      encryptedSession: null,
      sessionValidUntil: null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [portalConnections.practiceId, portalConnections.portalKey],
      set: {
        label: input.label ?? "Availity Essentials",
        encryptedCredentials,
        encryptedSession: null,
        sessionValidUntil: null,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

function maskUser(username?: string): string | null {
  if (!username) return null;
  if (username.length <= 2) return "••";
  return `${username.slice(0, 2)}••••`;
}

export async function listPortalConnections(practiceId: string) {
  const rows = await db.query.portalConnections.findMany({
    where: eq(portalConnections.practiceId, practiceId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });

  return rows.map((r) => {
    let hasTotp = false;
    let usernameMasked: string | null = null;
    if (r.encryptedCredentials) {
      try {
        const creds = JSON.parse(decryptSecret(r.encryptedCredentials)) as PortalCredentials;
        hasTotp = !!creds.totpSeed;
        usernameMasked = maskUser(creds.username);
      } catch {
        /* leave defaults if decryption fails */
      }
    }
    return {
      id: r.id,
      portalKey: r.portalKey,
      label: r.label,
      usernameMasked,
      hasTotp,
      hasSession: !!r.encryptedSession,
      sessionValidUntil: r.sessionValidUntil,
      lastLoginAt: r.lastLoginAt,
      isActive: r.isActive,
      createdAt: r.createdAt,
    };
  });
}

export async function disconnectPortal(practiceId: string, id: string) {
  await db
    .delete(portalConnections)
    .where(and(eq(portalConnections.id, id), eq(portalConnections.practiceId, practiceId)));
}

/**
 * Decrypted credentials for a connection — used by the Portal Worker only.
 * Never returned through a practice-facing route.
 */
export async function getDecryptedCredentials(
  connectionId: string
): Promise<PortalCredentials> {
  const conn = await db.query.portalConnections.findFirst({
    where: eq(portalConnections.id, connectionId),
  });
  if (!conn?.encryptedCredentials) {
    throw new PortalError(404, "Portal connection or credentials not found");
  }
  return JSON.parse(decryptSecret(conn.encryptedCredentials)) as PortalCredentials;
}

// ─── Submissions ────────────────────────────────────────────────────────────────

function buildPayload(auth: {
  patient: typeof schema.patients.$inferSelect;
  payer: typeof schema.payers.$inferSelect;
  provider: typeof schema.providers.$inferSelect | null;
  practice: typeof schema.practices.$inferSelect;
  cptCodes: string[];
  icdCodes: string[];
  requestedVisits: number;
  startDate: string | null;
  endDate: string | null;
  clinicalNotes: string | null;
}): PortalSubmissionPayload {
  const diagnoses = Array.from(
    new Set([...(auth.icdCodes ?? []), ...(auth.patient.diagnosisCodes ?? [])])
  );
  return {
    payerName: auth.payer.name,
    payerId: auth.payer.payerId,
    patient: {
      firstName: auth.patient.firstName,
      lastName: auth.patient.lastName,
      dob: auth.patient.dob,
      memberId: auth.patient.memberId,
      gender: auth.patient.gender ?? undefined,
    },
    provider: {
      firstName: auth.provider?.firstName,
      lastName: auth.provider?.lastName ?? "",
      npi: auth.provider?.npi ?? "",
      taxonomyCode: auth.provider?.taxonomyCode ?? undefined,
    },
    practice: {
      name: auth.practice.name,
      npi: auth.practice.npi,
      phone: auth.practice.phone ?? undefined,
    },
    diagnoses,
    cptCodes: auth.cptCodes ?? [],
    requestedVisits: auth.requestedVisits,
    startDate: auth.startDate ?? undefined,
    endDate: auth.endDate ?? undefined,
    clinicalNotes: auth.clinicalNotes ?? undefined,
  };
}

/** Queue an authorization for agent-driven portal submission. */
export async function enqueuePortalSubmission(
  practiceId: string,
  authorizationId: string
) {
  const conn = await db.query.portalConnections.findFirst({
    where: and(
      eq(portalConnections.practiceId, practiceId),
      eq(portalConnections.isActive, true)
    ),
  });
  if (!conn) {
    throw new PortalError(
      400,
      "No portal connected — add your Availity Essentials login in Settings first"
    );
  }

  const auth = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
    with: { patient: true, payer: true, provider: true, practice: true },
  });
  if (!auth) throw new PortalError(404, "Authorization not found");

  const payload = buildPayload(auth);

  const [submission] = await db
    .insert(portalSubmissions)
    .values({
      practiceId,
      authorizationId,
      portalConnectionId: conn.id,
      status: "queued",
      payload: payload as unknown as Record<string, unknown>,
    })
    .returning();

  if (!submission) throw new PortalError(500, "Failed to create submission");

  await portalSubmitQueue.add(
    "portal-submit",
    { portalSubmissionId: submission.id, practiceId },
    { jobId: submission.id }
  );

  return submission;
}

/**
 * Generate the current TOTP for a connection so the user can confirm the stored
 * seed matches their authenticator app before trusting unattended login.
 */
export async function checkTotp(practiceId: string, connectionId: string) {
  const conn = await db.query.portalConnections.findFirst({
    where: and(
      eq(portalConnections.id, connectionId),
      eq(portalConnections.practiceId, practiceId)
    ),
  });
  if (!conn?.encryptedCredentials) {
    throw new PortalError(404, "Connection not found");
  }
  const creds = JSON.parse(decryptSecret(conn.encryptedCredentials)) as PortalCredentials;
  if (!creds.totpSeed) {
    throw new PortalError(400, "No authenticator seed stored for this connection");
  }
  return {
    code: totp(creds.totpSeed),
    secondsRemaining: totpSecondsRemaining(),
  };
}

export async function listSubmissions(practiceId: string) {
  return db.query.portalSubmissions.findMany({
    where: eq(portalSubmissions.practiceId, practiceId),
    orderBy: [desc(portalSubmissions.createdAt)],
    limit: 100,
  });
}

/**
 * Re-queue a paused or failed submission. This is the exit from the
 * needs_mfa / needs_human states — after a human resolves whatever paused it
 * (adds a TOTP seed, reviews the portal, fixes data), retry puts it back on
 * the queue for the worker pool.
 */
export async function retrySubmission(practiceId: string, submissionId: string) {
  const [updated] = await db
    .update(portalSubmissions)
    .set({
      status: "queued",
      needsHumanReason: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(portalSubmissions.id, submissionId),
        eq(portalSubmissions.practiceId, practiceId),
        inArray(portalSubmissions.status, ["needs_mfa", "needs_human", "failed"])
      )
    )
    .returning();

  if (!updated) {
    throw new PortalError(
      404,
      "Submission not found, or it isn't in a retryable state"
    );
  }

  // Fresh jobId — the original (submission.id) may still exist in BullMQ's
  // completed set, which would silently dedupe a re-add.
  await portalSubmitQueue.add("portal-submit", {
    portalSubmissionId: updated.id,
    practiceId,
  });

  return updated;
}
