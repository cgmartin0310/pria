import type { FastifyInstance } from "fastify";
import * as payerService from "../services/payer.service.js";

export async function payerRoutes(app: FastifyInstance) {
  // List all payers
  app.get("/payers", async (req, reply) => {
    const payers = await payerService.listPayers();
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
