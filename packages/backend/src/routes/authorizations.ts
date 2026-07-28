import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as paService from "../services/pa.service.js";
import { previewX278 } from "../services/edi-assembler.service.js";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const createAuthSchema = z.object({
  patientId: z.string(),
  payerId: z.string(),
  cptCodes: z.array(z.string()).min(1),
  icdCodes: z.array(z.string()).min(1),
  requestedVisits: z.number().int().min(1).max(200),
  // The form sends null for empty dates — accept and normalize.
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  clinicalSummary: z.string().optional(),
  // Fields the form has always sent but the backend silently dropped:
  providerId: z.string().optional(),
  certificationTypeCode: z.string().max(2).optional(),
  serviceTypeCode: z.string().max(5).optional(),
  levelOfServiceCode: z.string().max(2).optional(),
  /** CMS POS code — therapy practices use 11 (Office) or 12 (Home). */
  placeOfServiceCode: z.string().max(5).optional(),
  visitPattern: z
    .object({
      visitsPerPeriod: z.number().int().min(1),
      periodFrequency: z.enum(["DA", "WK", "MO"]),
      periodCount: z.number().int().min(1),
      totalDurationDays: z.number().int().min(1).optional(),
    })
    .optional(),
  clinicalNotes: z.string().max(5000).optional(),
  /** Clinic site the patient is treated at — drives the portal location pick. */
  serviceLocation: z
    .object({
      label: z.string().max(100).optional(),
      street: z.string().max(255),
      city: z.string().max(100),
      state: z.string().max(2).optional(),
      zip: z.string().max(10).optional(),
    })
    .optional(),
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

  // Preview + validate the X12 278 for an authorization (no submission)
  app.get("/authorizations/:id/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await previewX278(id, req.auth.practiceId);
      return reply.send({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview failed";
      return reply.status(404).send({
        error: "NOT_FOUND",
        message,
        statusCode: 404,
      });
    }
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

  // ── Document attachments (portals require e.g. the Plan of Care) ──

  const uploadSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    /** Base64 file bytes; ~10 MB decoded cap. */
    dataBase64: z.string().min(1).max(14_000_000),
    /**
     * Portal attachment-type code (X12 PWK01), e.g. "08" Plan of Treatment,
     * "06" Initial Assessment. Portals require a type per file.
     */
    docType: z.string().max(5).optional(),
  });

  app.post(
    "/authorizations/:id/documents",
    { bodyLimit: 15 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid document upload",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const auth = await db.query.authorizations.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.authorizations.id, id),
          eq(schema.authorizations.practiceId, req.auth.practiceId)
        ),
      });
      if (!auth) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "Authorization not found",
          statusCode: 404,
        });
      }

      const [doc] = await db
        .insert(schema.authorizationDocuments)
        .values({
          authorizationId: id,
          type: "attachment",
          // `content` carries the portal attachment-type code; the filename
          // has its own column.
          content: parsed.data.docType ?? "M1",
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          fileData: parsed.data.dataBase64,
        })
        .returning({ id: schema.authorizationDocuments.id });

      return reply.status(201).send({ data: { id: doc?.id, fileName: parsed.data.fileName } });
    }
  );

  // Remove every attachment on an auth (re-attach fresh, e.g. to fix types).
  app.delete("/authorizations/:id/documents", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await db.query.authorizations.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.practiceId, req.auth.practiceId)
      ),
    });
    if (!auth) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Authorization not found",
        statusCode: 404,
      });
    }
    await db
      .delete(schema.authorizationDocuments)
      .where(eq(schema.authorizationDocuments.authorizationId, id));
    return reply.send({ data: { cleared: true } });
  });

  app.get("/authorizations/:id/documents", async (req, reply) => {
    const { id } = req.params as { id: string };
    const auth = await db.query.authorizations.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.authorizations.id, id),
        eq(schema.authorizations.practiceId, req.auth.practiceId)
      ),
    });
    if (!auth) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Authorization not found",
        statusCode: 404,
      });
    }
    const docs = await db.query.authorizationDocuments.findMany({
      columns: {
        id: true,
        fileName: true,
        mimeType: true,
        type: true,
        content: true,
        createdAt: true,
      },
      where: eq(schema.authorizationDocuments.authorizationId, id),
    });
    return reply.send({ data: docs.filter((d) => d.fileName) });
  });
}
