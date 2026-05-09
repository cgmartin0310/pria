import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

async function runMigrations() {
  const pool = new Pool({ connectionString: config.database.url });
  const db = drizzle(pool);

  console.log("[migrate] Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] Done.");

  await pool.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
