import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeQueues } from "./jobs/queue.js";

async function main() {
  const app = await buildApp();

  // Start workers (import registers them)
  if (config.server.nodeEnv !== "test") {
    await import("./jobs/pa-submit.job.js");
    await import("./jobs/pa-status.job.js");
    console.log("[workers] PA submit and status workers started");
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
