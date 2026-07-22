import { db, schema } from "./index.js";

/**
 * Baseline reference data that must always exist, applied idempotently on every
 * server startup. This is belt-and-suspenders alongside the pre-deploy seed:
 * even if the pre-deploy seed step doesn't run, the app self-heals on boot.
 *
 * Safe to fail — if the tables don't exist yet (migrations not applied), the
 * caller logs and continues rather than crashing the server.
 */
const CLEARINGHOUSES = [
  { key: "availity", name: "Availity", isActive: true },
  // Test harness: exercises the full submit → response → decision pipeline
  // without a live clearinghouse. Decisions are clearly labelled as simulated.
  { key: "simulated", name: "Test Mode (Simulated Payer)", isActive: true },
];

export async function ensureBaselineData(): Promise<void> {
  for (const ch of CLEARINGHOUSES) {
    await db
      .insert(schema.clearinghouses)
      .values(ch)
      .onConflictDoUpdate({
        target: schema.clearinghouses.key,
        set: { name: ch.name, isActive: ch.isActive },
      });
  }
}
