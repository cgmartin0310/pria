import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const { payers, payerRules } = schema;

// ─── Common Payers Seed Data ──────────────────────────────────────────────────

export const COMMON_PAYERS = [
  {
    name: "UnitedHealthcare",
    payerId: "87726",
    portalUrl: "https://www.uhcprovider.com",
    supportsX278: true,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12" as const,
      avgDecisionDays: 3,
      notes: "Real-time decisions available via X12 278",
    },
  },
  {
    name: "Anthem Blue Cross Blue Shield",
    payerId: "00227",
    portalUrl: "https://www.anthem.com/provider",
    supportsX278: true,
    supportsFhir: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12" as const,
      avgDecisionDays: 5,
      notes: "Check portal for FHIR PA endpoint availability",
    },
  },
  {
    name: "Aetna",
    payerId: "60054",
    portalUrl: "https://www.aetna.com/providers",
    supportsX278: true,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12" as const,
      avgDecisionDays: 4,
      notes: "Requires clinical documentation for >12 visits",
    },
  },
  {
    name: "Cigna",
    payerId: "62308",
    portalUrl: "https://cignaforhcp.cigna.com",
    supportsX278: false,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "portal" as const,
      avgDecisionDays: 7,
      notes: "Portal submission required. No EDI support.",
    },
  },
  {
    name: "Humana",
    payerId: "61101",
    portalUrl: "https://provider.humana.com",
    supportsX278: true,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12" as const,
      avgDecisionDays: 5,
      notes: "Real-time available for some PT services",
    },
  },
  {
    name: "Medicare (Noridian)",
    payerId: "01192",
    portalUrl: null,
    supportsX278: false,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: false,
      submissionMethod: "phone" as const,
      avgDecisionDays: 0,
      notes: "Medicare generally does not require PT/OT/ST prior auth",
    },
  },
  {
    name: "Medicaid (varies by state)",
    payerId: "77799",
    portalUrl: null,
    supportsX278: false,
    supportsFhir: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "portal" as const,
      avgDecisionDays: 10,
      notes: "Requirements vary significantly by state MCO",
    },
  },
] as const;

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listPayers() {
  return db.query.payers.findMany({
    orderBy: (p, { asc }) => [asc(p.name)],
  });
}

export async function getPayerById(id: string) {
  return db.query.payers.findFirst({
    where: eq(payers.id, id),
    with: { rules: true },
  });
}

export async function getPayerRules(payerId: string, cptCode?: string) {
  if (cptCode) {
    return db.query.payerRules.findFirst({
      where: (r, { and, eq }) => and(eq(r.payerId, payerId), eq(r.cptCode, cptCode)),
    });
  }
  return db.query.payerRules.findMany({
    where: eq(payerRules.payerId, payerId),
  });
}

/**
 * Check if a specific CPT code requires prior authorization for a given payer.
 */
export async function checkRequiresAuth(
  payerId: string,
  cptCode: string
): Promise<{ requiresAuth: boolean; visitThreshold: number | null; notes: string }> {
  const rule = await db.query.payerRules.findFirst({
    where: (r, { and, eq }) =>
      and(eq(r.payerId, payerId), eq(r.cptCode, cptCode)),
  });

  if (!rule) {
    // Default: require auth if no rule found
    return {
      requiresAuth: true,
      visitThreshold: null,
      notes: "No specific rule found; defaulting to prior auth required",
    };
  }

  return {
    requiresAuth: rule.requiresAuth,
    visitThreshold: rule.visitThreshold,
    notes: rule.criteria.notes,
  };
}
