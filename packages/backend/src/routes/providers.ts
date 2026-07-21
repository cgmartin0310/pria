import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { DISCIPLINE_TAXONOMY_DEFAULTS } from "@pria/shared";

const createProviderSchema = z.object({
  npi: z.string().min(10).max(10).regex(/^\d{10}$/, "NPI must be exactly 10 digits"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  discipline: z.enum(["PT", "OT", "ST"]),
  taxonomyCode: z.string().max(20).optional(),
  suffix: z.string().max(50).optional(),
  credentials: z.string().max(100).optional(),
  stateLicenseNumber: z.string().max(50).optional(),
  userId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export async function providerRoutes(app: FastifyInstance) {
  // ─── List providers ───────────────────────────────────────────────────────

  app.get("/providers", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const page = parseInt(query["page"] ?? "1");
    const pageSize = parseInt(query["pageSize"] ?? "20");
    const discipline = query["discipline"] as "PT" | "OT" | "ST" | undefined;
    const activeOnly = query["active"] !== "false";

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.providers.practiceId, req.auth.practiceId),
    ];

    if (activeOnly) {
      conditions.push(eq(schema.providers.isActive, true));
    }

    if (discipline) {
      conditions.push(eq(schema.providers.discipline, discipline));
    }

    const [items, countResult] = await Promise.all([
      db.query.providers.findMany({
        where: and(...conditions),
        orderBy: (p, { asc }) => [asc(p.lastName), asc(p.firstName)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.providers)
        .where(and(...conditions)),
    ]);

    return reply.send({
      data: items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    });
  });

  // ─── Get single provider ──────────────────────────────────────────────────

  app.get("/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const provider = await db.query.providers.findFirst({
      where: and(
        eq(schema.providers.id, id),
        eq(schema.providers.practiceId, req.auth.practiceId)
      ),
    });

    if (!provider) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Provider not found",
        statusCode: 404,
      });
    }

    return reply.send({ data: provider });
  });

  // ─── Create provider ──────────────────────────────────────────────────────

  app.post("/providers", async (req, reply) => {
    const parsed = createProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    // Auto-populate taxonomyCode from discipline if not provided
    const taxonomyCode =
      data.taxonomyCode ??
      DISCIPLINE_TAXONOMY_DEFAULTS[data.discipline];

    const [provider] = await db
      .insert(schema.providers)
      .values({
        practiceId: req.auth.practiceId,
        npi: data.npi,
        firstName: data.firstName,
        lastName: data.lastName,
        discipline: data.discipline,
        taxonomyCode,
        suffix: data.suffix,
        credentials: data.credentials,
        stateLicenseNumber: data.stateLicenseNumber,
        userId: data.userId,
        isActive: data.isActive,
      })
      .returning();

    return reply.status(201).send({ data: provider });
  });

  // ─── Update provider ──────────────────────────────────────────────────────

  app.patch("/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const parsed = createProviderSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    // If discipline is being updated and no explicit taxonomyCode provided, re-derive it
    let taxonomyCode = data.taxonomyCode;
    if (data.discipline && !data.taxonomyCode) {
      taxonomyCode = DISCIPLINE_TAXONOMY_DEFAULTS[data.discipline];
    }

    const [updated] = await db
      .update(schema.providers)
      .set({
        ...data,
        ...(taxonomyCode ? { taxonomyCode } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.providers.id, id),
          eq(schema.providers.practiceId, req.auth.practiceId)
        )
      )
      .returning();

    if (!updated) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Provider not found",
        statusCode: 404,
      });
    }

    return reply.send({ data: updated });
  });
}
