import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import * as portalService from "../services/portal.service.js";
import { PortalError } from "../services/portal.service.js";
import { requireRole } from "../auth/tenant.js";

const connectSchema = z.object({
  portalKey: z.string().min(1).default("availity_essentials"),
  label: z.string().max(255).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  totpSeed: z.string().optional(),
});

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof PortalError) {
    return reply.status(err.statusCode).send({
      error: "PORTAL_ERROR",
      message: err.message,
      statusCode: err.statusCode,
    });
  }
  const message = err instanceof Error ? err.message : "Portal request failed";
  return reply.status(500).send({ error: "PORTAL_ERROR", message, statusCode: 500 });
}

export async function portalRoutes(app: FastifyInstance) {
  // List portal connections (secrets never returned)
  app.get("/portals/connections", async (req, reply) => {
    const data = await portalService.listPortalConnections(req.auth.practiceId);
    return reply.send({ data });
  });

  // Connect / update a portal login (admin) — credentials stored encrypted
  app.post(
    "/portals/connect",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const parsed = connectSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }
      try {
        const row = await portalService.connectPortal(req.auth.practiceId, parsed.data);
        return reply.status(201).send({ data: { id: row?.id, connected: true } });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // Disconnect (admin)
  app.delete(
    "/portals/connections/:id",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await portalService.disconnectPortal(req.auth.practiceId, id);
      return reply.send({ data: { disconnected: true } });
    }
  );

  // Queue an authorization for agent-driven portal submission
  app.post("/authorizations/:id/submit-portal", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const submission = await portalService.enqueuePortalSubmission(
        req.auth.practiceId,
        id
      );
      return reply.status(202).send({ data: submission });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // List portal submissions + their status
  app.get("/portals/submissions", async (req, reply) => {
    const data = await portalService.listSubmissions(req.auth.practiceId);
    return reply.send({ data });
  });
}
