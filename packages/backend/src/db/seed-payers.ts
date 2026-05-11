/**
 * Seed script: inserts common payers into the database.
 *
 * Usage:
 *   pnpm seed:payers
 *
 * Requires DATABASE_URL env var to be set.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config as loadEnv } from "dotenv";
import * as schema from "./schema.js";

loadEnv();

const { Pool } = pg;

interface PayerSeed {
  name: string;
  payerId: string;
  payerIdQualifier: "PI" | "46";
  supportsX278: boolean;
  rulesConfig: {
    requiresPreAuth: boolean;
    submissionMethod: "x12" | "portal" | "fax" | "phone";
    avgDecisionDays: number;
    notes: string;
  };
}

const PAYERS_TO_SEED: PayerSeed[] = [
  {
    name: "UnitedHealthcare",
    payerId: "87726",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 3,
      notes:
        "UnitedHealthcare requires prior auth for PT/OT/ST. X12 278 supported via Optum/RelayHealth clearinghouse. Verify plan-specific rules — some UHC plans allow initial eval without auth.",
    },
  },
  {
    name: "Aetna",
    payerId: "60054",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 3,
      notes:
        "Aetna requires prior auth for PT/OT/ST beyond initial evaluation. Electronic submission preferred via Emdeon/Change Healthcare clearinghouse.",
    },
  },
  {
    name: "Cigna",
    payerId: "62308",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 5,
      notes:
        "Cigna requires auth for most outpatient PT/OT/ST. Portal submission also available at cignaforhcp.com. Typically 2–5 business days for routine requests.",
    },
  },
  {
    name: "Anthem BCBS",
    payerId: "00630",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 5,
      notes:
        "Anthem BCBS — verify payer ID by state (varies). Some states use different EDI IDs. Auth requirements vary by plan; check Availity for plan-specific rules.",
    },
  },
  {
    name: "Humana",
    payerId: "61101",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 5,
      notes:
        "Humana requires prior auth for outpatient PT/OT/ST. Electronic 278 submission supported. Check for Humana Medicare Advantage plans which may have different requirements.",
    },
  },
  {
    name: "BCBS of North Carolina",
    payerId: "00610",
    payerIdQualifier: "PI",
    supportsX278: true,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "x12",
      avgDecisionDays: 5,
      notes:
        "Blue Cross Blue Shield of North Carolina. Prior auth required for PT/OT/ST beyond initial eval (typically first 6–12 visits). Submit via Blue Connect or clearinghouse. BlueCard claims use different routing — verify member's home plan.",
    },
  },
  {
    name: "TRICARE",
    payerId: "99726",
    payerIdQualifier: "PI",
    supportsX278: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "portal",
      avgDecisionDays: 7,
      notes:
        "TRICARE — Department of Defense health program. Regional contractors vary (Humana Military East, Health Net West). Prior auth required for outpatient PT/OT/ST after initial eval. Submit via Humana Military portal (East region) or Health Net Federal portal. Important for practices near military installations (~25% veteran patient population). TRICARE Prime requires referral; TRICARE Select is more flexible. Average decision: 5–10 business days.",
    },
  },
  {
    name: "Medicare",
    payerId: "00001",
    payerIdQualifier: "PI",
    supportsX278: false,
    rulesConfig: {
      requiresPreAuth: false,
      submissionMethod: "portal",
      avgDecisionDays: 0,
      notes:
        "Medicare Traditional (Fee-for-Service). PT/OT/ST generally does NOT require prior authorization under traditional Medicare. Documentation requirements apply (functional limitation reporting, therapy cap exceptions). KX modifier required when therapy cap is exceeded. Submit via Medicare Administrative Contractor (MAC) — Palmetto GBA serves NC. Note: Medicare Advantage plans (HMOs/PPOs) DO require prior auth — treat those as separate payers.",
    },
  },
  {
    name: "NC Medicaid (NC DHHS)",
    payerId: "84146",
    payerIdQualifier: "PI",
    supportsX278: false,
    rulesConfig: {
      requiresPreAuth: true,
      submissionMethod: "portal",
      avgDecisionDays: 10,
      notes:
        "North Carolina Medicaid administered by NC Department of Health and Human Services. Prior auth required for PT/OT/ST. Submit via NCTracks portal (nctracks.nc.gov). NC Medicaid Managed Care (NC Health Choice/NC Medicaid Direct) — verify if patient is in a managed care plan as those have different auth workflows. EPSDT applies for pediatric patients. Standard auth: 5–10 business days; expedited: 72 hours.",
    },
  },
];

async function seedPayers() {
  const databaseUrl =
    process.env["DATABASE_URL"] ??
    "postgresql://postgres:password@localhost:5432/pria";

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log(`[seed:payers] Seeding ${PAYERS_TO_SEED.length} payers...`);

  let inserted = 0;
  let skipped = 0;

  for (const payer of PAYERS_TO_SEED) {
    try {
      await db
        .insert(schema.payers)
        .values({
          name: payer.name,
          payerId: payer.payerId,
          payerIdQualifier: payer.payerIdQualifier,
          supportsX278: payer.supportsX278,
          rulesConfig: payer.rulesConfig,
        })
        .onConflictDoNothing();

      console.log(`  ✓ ${payer.name} (${payer.payerId})`);
      inserted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠ Skipped ${payer.name}: ${message}`);
      skipped++;
    }
  }

  console.log(
    `[seed:payers] Done. Inserted: ${inserted}, Skipped: ${skipped}`
  );

  await pool.end();
}

seedPayers().catch((err) => {
  console.error("[seed:payers] Fatal error:", err);
  process.exit(1);
});
