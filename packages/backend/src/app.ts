import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { authorizationRoutes } from "./routes/authorizations.js";
import { patientRoutes } from "./routes/patients.js";
import { payerRoutes } from "./routes/payers.js";
import { providerRoutes } from "./routes/providers.js";
import { practiceRoutes } from "./routes/practices.js";
import { icd10Routes } from "./routes/icd10.js";
import { clearinghouseRoutes } from "./routes/clearinghouses.js";
import { tenantAuthPlugin } from "./auth/tenant.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        config.server.nodeEnv === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // ─── Plugins ─────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  await app.register(sensible);

  // ─── Health Check ─────────────────────────────────────────────────────────

  const healthResponse = async () => ({
    status: "ok",
    service: "pria-api",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });

  app.get("/health", healthResponse);
  app.get("/api/health", healthResponse);

  // ─── Routes ───────────────────────────────────────────────────────────────

  const API_PREFIX = "/api/v1";

  await app.register(
    async (api) => {
      // Tenant-auth: verifies Clerk JWT and populates req.auth for every
      // route registered in this scope. Applied directly (not via register) so
      // the onRequest hook covers the sibling routes below rather than being
      // encapsulated. Public routes (/health) live outside this scope.
      await tenantAuthPlugin(api);

      await api.register(authRoutes);
      await api.register(authorizationRoutes);
      await api.register(patientRoutes);
      await api.register(payerRoutes);
      await api.register(providerRoutes);
      await api.register(practiceRoutes);
      await api.register(icd10Routes);
      await api.register(clearinghouseRoutes);
    },
    { prefix: API_PREFIX }
  );

  // ─── Global Error Handler ─────────────────────────────────────────────────

  app.setErrorHandler(async (error: Error & { statusCode?: number; code?: string }, req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: error.code ?? "INTERNAL_ERROR",
      message:
        config.server.nodeEnv === "production"
          ? "An internal error occurred"
          : error.message,
      statusCode,
    });
  });

  return app;
}
