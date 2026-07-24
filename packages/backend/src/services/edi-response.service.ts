import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { parseX278Response } from "./edi.service.js";

const { authorizations, authorizationHistory } = schema;

type AuthRow = typeof authorizations.$inferSelect;
type PaStatus = AuthRow["status"];

/** YYYYMMDD → YYYY-MM-DD (our date column format). */
function toIsoDate(s?: string): string | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** YYYYMMDD → Date. */
function toDate(s?: string): Date | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  return new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8))
  );
}

export interface ApplyOptions {
  /** Where the response came from — e.g. 'availity' or 'simulated'. */
  source: string;
  /** True for Test Mode decisions; clearly labelled in history. */
  simulated?: boolean;
}

export interface ApplyResult {
  status: PaStatus;
  authNumber: string | null;
  decisionCode?: string;
  message: string;
}

/**
 * Parse an X12 278 response and apply the payer's decision to an authorization:
 * status, auth number, decision code/message, certification period, expiry.
 *
 * Shared by the simulated clearinghouse today and real clearinghouse responses
 * once live submission is enabled.
 */
export async function applyX278Response(
  authorizationId: string,
  practiceId: string,
  rawEdi: string,
  opts: ApplyOptions
): Promise<ApplyResult> {
  const current = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
  });
  if (!current) {
    throw new Error(`Authorization ${authorizationId} not found`);
  }

  const parsed = parseX278Response(rawEdi);

  // Map the 278 response status onto our PA status enum.
  let status: PaStatus;
  switch (parsed.status) {
    case "approved":
    case "modified":
      status = "approved";
      break;
    case "denied":
      status = "denied";
      break;
    default:
      status = "pending";
  }

  const certStart = toIsoDate(parsed.certificationPeriodStart);
  const certEnd = toIsoDate(parsed.certificationPeriodEnd);
  const expiresAt = toDate(parsed.certificationPeriodEnd);

  const updates: Partial<typeof authorizations.$inferInsert> = {
    status,
    decisionCode: parsed.decisionCode ?? null,
    decisionMessage: parsed.message,
    decidedAt: new Date(),
    updatedAt: new Date(),
  };
  if (parsed.authNumber) updates.authNumber = parsed.authNumber;
  if (certStart) updates.certificationPeriodStart = certStart;
  if (certEnd) updates.certificationPeriodEnd = certEnd;
  if (expiresAt) updates.expiresAt = expiresAt;
  // A2 (modified) may certify fewer visits than requested — record the number
  // when the response carries it so "approved" isn't silently overstated.
  if (parsed.certifiedVisits) updates.approvedVisits = parsed.certifiedVisits;

  await db
    .update(authorizations)
    .set(updates)
    .where(eq(authorizations.id, authorizationId));

  const notes = [
    opts.simulated
      ? "⚠ SIMULATED (Test Mode) — this is NOT a real payer decision."
      : null,
    `Decision ${parsed.decisionCode ?? "?"} via ${opts.source}: ${parsed.message}`,
    parsed.authNumber ? `Authorization #: ${parsed.authNumber}` : null,
    certStart || certEnd
      ? `Certification period: ${certStart ?? "?"} → ${certEnd ?? "?"}`
      : null,
  ]
    .filter((n): n is string => n !== null)
    .join("\n");

  await db.insert(authorizationHistory).values({
    authorizationId,
    action: opts.simulated ? "simulated_decision" : "decision_received",
    fromStatus: current.status,
    toStatus: status,
    notes,
    performedBy: "system",
  });

  return {
    status,
    authNumber: parsed.authNumber,
    decisionCode: parsed.decisionCode,
    message: parsed.message,
  };
}
