import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as payerService from "../services/payer.service.js";
import * as chService from "../services/clearinghouse.service.js";
import { requireRole } from "../auth/tenant.js";

const authPolicySchema = z.object({
  unmanagedVisits: z.number().int().min(0).max(99).optional(),
  authPeriodMonths: z.number().int().min(1).max(24).optional(),
  maxVisitsPerAuth: z.number().int().min(1).max(999).optional(),
  portalPayerName: z.string().max(255).optional(),
  portalKey: z.enum(["availity_essentials", "carelon_mbm", "manual"]).optional(),
  notes: z.string().max(500).optional(),
});

export async function payerRoutes(app: FastifyInstance) {
  // List the payers this practice can reach through its connected clearinghouses.
  // (Payers are added from a clearinghouse directory — see clearinghouse routes.)
  app.get("/payers", async (req, reply) => {
    const payers = await chService.listPracticePayers(req.auth.practiceId);
    return reply.send({ data: payers });
  });

  // Get payer by ID with rules
  app.get("/payers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const payer = await payerService.getPayerById(id);
    if (!payer) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Payer not found",
        statusCode: 404,
      });
    }
    return reply.send({ data: payer });
  });

  // Set this practice's auth policy for a payer (unmanaged visits, auth
  // window, visit cap) — drives New Authorization defaults.
  app.patch(
    "/payers/:id/policy",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = authPolicySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid payer policy",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }
      try {
        const data = await chService.setPayerAuthPolicy(
          req.auth.practiceId,
          id,
          parsed.data
        );
        return reply.send({ data });
      } catch (err) {
        if (err instanceof chService.ClearinghouseError) {
          return reply.status(err.statusCode).send({
            error: "CLEARINGHOUSE_ERROR",
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    }
  );

  // Get payer rules for a specific CPT code
  app.get("/payers/:id/rules", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as Record<string, string>;
    const rules = await payerService.getPayerRules(id, query["cptCode"]);
    return reply.send({ data: rules });
  });

  // Check if a CPT requires auth for a payer
  app.get("/payers/:id/check-auth", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as Record<string, string>;
    const cptCode = query["cptCode"];

    if (!cptCode) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "cptCode query parameter required",
        statusCode: 400,
      });
    }

    const result = await payerService.checkRequiresAuth(id, cptCode);
    return reply.send({ data: result });
  });
}
