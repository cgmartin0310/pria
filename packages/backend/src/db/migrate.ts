import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

// Resolve the drizzle folder relative to THIS file, not the process CWD, so the
// script works whether run via tsx (src/db/) or compiled node (dist/db/) and
// from any working directory (e.g. Render's repo-root preDeploy step).
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

async function runMigrations() {
  const pool = new Pool({ connectionString: config.database.url });
  const db = drizzle(pool);

  console.log(`[migrate] Running migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] Done.");

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
