import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, like, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(1),
});

const createPatientSchema = z.object({
  // Core demographics
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["M", "F", "U"]).optional(),
  phone: z.string().max(20).optional(),
  address: addressSchema.optional(),

  // Insurance
  payerId: z.string(),
  memberId: z.string().min(1),
  groupNumber: z.string().max(50).optional(),
  relationshipToSubscriber: z.string().default("18"),

  // Subscriber info (required when relationship !== '18')
  subscriberLastName: z.string().max(100).optional(),
  subscriberFirstName: z.string().max(100).optional(),
  subscriberMiddleName: z.string().max(100).optional(),
  subscriberMemberId: z.string().max(100).optional(),
  subscriberDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subscriberGender: z.enum(["M", "F", "U"]).optional(),
  subscriberAddress: addressSchema.optional(),

  // Referring physician (usually the PCP) — required by payer portals for
  // therapy auths ("Requesting Provider")
  referringProviderFirstName: z.string().max(100).optional(),
  referringProviderLastName: z.string().max(100).optional(),
  referringProviderNpi: z
    .string()
    .regex(/^\d{10}$/, "NPI must be exactly 10 digits")
    .optional(),

  // Clinical
  diagnosisCodes: z.array(z.string()).default([]),
});

export async function patientRoutes(app: FastifyInstance) {
  // List patients
  app.get("/patients", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const search = query["search"];
    const payerId = query["payerId"];
    const page = parseInt(query["page"] ?? "1");
    const pageSize = parseInt(query["pageSize"] ?? "20");

    const conditions = [eq(schema.patients.practiceId, req.auth.practiceId)];
    if (payerId) conditions.push(eq(schema.patients.payerId, payerId));

    const [items, countResult] = await Promise.all([
      db.query.patients.findMany({
        where: and(...conditions),
        with: { payer: true },
        orderBy: (p, { asc }) => [asc(p.lastName), asc(p.firstName)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.patients)
        .where(and(...conditions)),
    ]);

    return reply.send({
      data: items,
      total: Number(countResult[0]?.count ?? 0),
      page,
      pageSize,
    });
  });

  // Get patient by ID
  app.get("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const patient = await db.query.patients.findFirst({
      where: and(
        eq(schema.patients.id, id),
        eq(schema.patients.practiceId, req.auth.practiceId)
      ),
      with: {
        payer: true,
        authorizations: {
          orderBy: (a, { desc }) => [desc(a.createdAt)],
          limit: 10,
        },
      },
    });

    if (!patient) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Patient not found",
        statusCode: 404,
      });
    }

    return reply.send({ data: patient });
  });

  // Create patient
  app.post("/patients", async (req, reply) => {
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const [patient] = await db
      .insert(schema.patients)
      .values({
        practiceId: req.auth.practiceId,
        ...parsed.data,
      })
      .returning();

    return reply.status(201).send({ data: patient });
  });

  // Update patient
  app.patch("/patients/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createPatientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
      });
    }

    const [updated] = await db
      .update(schema.patients)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(schema.patients.id, id),
          eq(schema.patients.practiceId, req.auth.practiceId)
        )
      )
      .returning();

    if (!updated) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Patient not found",
        statusCode: 404,
      });
    }

    return reply.send({ data: updated });
  });
}
