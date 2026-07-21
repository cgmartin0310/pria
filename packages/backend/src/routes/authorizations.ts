import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as paService from "../services/pa.service.js";

const createAuthSchema = z.object({
  patientId: z.string(),
  payerId: z.string(),
  cptCodes: z.array(z.string()).min(1),
  icdCodes: z.array(z.string()).min(1),
  requestedVisits: z.number().int().min(1).max(200),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  clinicalSummary: z.string().optional(),
});

export async function authorizationRoutes(app: FastifyInstance) {
  // List authorizations
  app.get("/authorizations", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const result = await paService.listAuthorizations(req.auth.practiceId, {
      status: query["status"] as typeof result extends { status: infer S } ? S : never,
      patientId: query["patientId"],
      payerId: query["payerId"],
      page: query["page"] ? parseInt(query["page"]) : 1,
      pageSize: query["pageSize"] ? parseInt(query["pageSize"]) : 20,
    });
    return reply.send(result);
  });

  // Get dashboard stats
  app.get("/authorizations/stats", async (req, reply) => {
    const stats = await paService.getDashboardStats(req.auth.practiceId);
    return reply.send({ data: stats });
  });

  // Get single authorization
  app.get("/authorizations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await paService.getAuthorizationById(id, req.auth.practiceId);
    if (!auth) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Authorization not found",
        statusCode: 404,
      });
    }
    return reply.send({ data: auth });
  });

  // Create authorization
  app.post("/authorizations", async (req, reply) => {
    const parsed = createAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const auth = await paService.createAuthorization(
      req.auth.practiceId,
      parsed.data
    );
    return reply.status(201).send({ data: auth });
  });

  // Submit authorization (queues EDI job)
  app.post("/authorizations/:id/submit", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const auth = await paService.submitAuthorization(id, req.auth.practiceId);
      return reply.send({ data: auth });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      return reply.status(400).send({
        error: "SUBMISSION_ERROR",
        message,
        statusCode: 400,
      });
    }
  });

  // Generate AI clinical summary
  app.post("/authorizations/:id/generate-summary", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await paService.generateClinicalSummaryForAuth(
        id,
        req.auth.practiceId
      );
      return reply.send({ data: result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI generation failed";
      return reply.status(500).send({
        error: "AI_ERROR",
        message,
        statusCode: 500,
      });
    }
  });
}
