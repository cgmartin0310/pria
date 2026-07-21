import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import * as chService from "../services/clearinghouse.service.js";
import { ClearinghouseError } from "../services/clearinghouse.service.js";
import { requireRole } from "../auth/tenant.js";

const connectSchema = z.object({
  clearinghouseKey: z.string().min(1),
  accountKey: z.string().min(1),
  label: z.string().max(255).optional(),
});

const addPayerSchema = z.object({
  clearinghousePayerId: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.record(z.string()).optional(),
});

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ClearinghouseError) {
    return reply.status(err.statusCode).send({
      error: "CLEARINGHOUSE_ERROR",
      message: err.message,
      statusCode: err.statusCode,
    });
  }
  const message = err instanceof Error ? err.message : "Clearinghouse request failed";
  return reply.status(502).send({
    error: "CLEARINGHOUSE_ERROR",
    message,
    statusCode: 502,
  });
}

export async function clearinghouseRoutes(app: FastifyInstance) {
  // Available networks (Claim.MD, …)
  app.get("/clearinghouses", async (_req, reply) => {
    const data = await chService.listClearinghouses();
    return reply.send({ data });
  });

  // This practice's connections
  app.get("/clearinghouses/connections", async (req, reply) => {
    const data = await chService.listConnections(req.auth.practiceId);
    return reply.send({ data });
  });

  // Connect / update a clearinghouse credential (admin)
  app.post(
    "/clearinghouses/connect",
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
        const row = await chService.connectClearinghouse(
          req.auth.practiceId,
          parsed.data.clearinghouseKey,
          parsed.data.accountKey,
          parsed.data.label
        );
        return reply.status(201).send({ data: { id: row?.id, connected: true } });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // Disconnect (admin)
  app.delete(
    "/clearinghouses/connections/:id",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await chService.disconnectClearinghouse(req.auth.practiceId, id);
      return reply.send({ data: { disconnected: true } });
    }
  );

  // Search a connection's live payer directory
  app.get("/clearinghouses/connections/:id/payer-search", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = (req.query as Record<string, string>)["q"] ?? "";
    if (q.trim().length < 2) return reply.send({ data: [] });
    try {
      const data = await chService.searchPayers(req.auth.practiceId, id, q.trim());
      return reply.send({ data });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Import a payer from the directory (admin)
  app.post(
    "/clearinghouses/connections/:id/payers",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = addPayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }
      try {
        const payer = await chService.addPayer(req.auth.practiceId, id, parsed.data);
        return reply.status(201).send({ data: payer });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // Admin override: does this payer accept 278?
  app.patch(
    "/clearinghouses/payers/:payerId/278",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { payerId } = req.params as { payerId: string };
      const body = req.body as { supports278?: unknown };
      if (typeof body?.supports278 !== "boolean") {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "supports278 (boolean) is required",
          statusCode: 400,
        });
      }
      await chService.setPayer278(req.auth.practiceId, payerId, body.supports278);
      return reply.send({ data: { updated: true } });
    }
  );
}
