import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeQueues } from "./jobs/queue.js";
import { ensureBaselineData } from "./db/bootstrap.js";

async function main() {
  const app = await buildApp();

  // Ensure baseline reference data (clearinghouses) exists — idempotent, and
  // tolerant of a not-yet-migrated DB so it never blocks startup.
  try {
    await ensureBaselineData();
    console.log("[bootstrap] baseline data ensured");
  } catch (err) {
    console.warn("[bootstrap] ensureBaselineData skipped:", err instanceof Error ? err.message : err);
  }

  // Start workers (import registers them) — gracefully skip if Redis unavailable
  if (config.server.nodeEnv !== "test" && config.redis.url) {
    try {
      await import("./jobs/pa-submit.job.js");
      await import("./jobs/pa-status.job.js");
      console.log("[workers] PA submit and status workers started");
    } catch (err) {
      console.warn("[workers] Failed to start workers (Redis may be unavailable):", err);
    }
  }

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(
      `[server] Pria API running at http://${config.server.host}:${config.server.port}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[server] Shutting down...");
    await app.close();
    await closeQueues();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
