/**
 * Seed script: ensures the supported clearinghouse networks exist.
 * Idempotent — safe to run on every deploy (runs after migrations).
 *
 * Usage: node dist/db/seed-clearinghouses.js  (or: pnpm seed:clearinghouses)
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

loadEnv();

const { Pool } = pg;

const CLEARINGHOUSES = [
  { key: "claim_md", name: "Claim.MD", isActive: true },
];

async function seed() {
  const databaseUrl =
    process.env["DATABASE_URL"] ??
    "postgresql://postgres:password@localhost:5432/pria";
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log(`[seed:clearinghouses] Seeding ${CLEARINGHOUSES.length} networks...`);

  for (const ch of CLEARINGHOUSES) {
    // Upsert by unique key so re-runs update the name/status without duplicating.
    await db
      .insert(schema.clearinghouses)
      .values(ch)
      .onConflictDoUpdate({
        target: schema.clearinghouses.key,
        set: { name: ch.name, isActive: ch.isActive },
      });
    console.log(`  ✓ ${ch.name} (${ch.key})`);
  }

  // Touch to confirm connectivity, then close.
  await db.execute(sql`select 1`);
  await pool.end();
  console.log("[seed:clearinghouses] Done.");
}

seed().catch((err) => {
  console.error("[seed:clearinghouses] Failed:", err);
  process.exit(1);
});
