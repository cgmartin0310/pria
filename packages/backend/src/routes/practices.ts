import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireRole } from "../auth/tenant.js";

const inviteSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255).optional(),
  role: z.enum(["admin", "therapist", "billing"]).default("therapist"),
});

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(1),
});

const updatePracticeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  npi: z
    .string()
    .min(10)
    .max(10)
    .regex(/^\d{10}$/, "NPI must be exactly 10 digits")
    .optional(),
  address: addressSchema.optional(),
  phone: z.string().max(20).optional(),
  fax: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
});

const clinicConfigSchema = z.object({
  taxonomyCodes: z.array(z.string()).min(1),
  facilityTypeCode: z.string().min(1),
  claimType: z.enum(["B", "A"]),
  ediSenderQualifier: z.string().min(1),
  ediSenderId: z.string().min(1),
  ediReceiverQualifier: z.string().min(1),
  ediReceiverId: z.string().min(1),
  gsApplicationSenderId: z.string().optional(),
  gsApplicationReceiverId: z.string().optional(),
  requestCategoryCode: z.string().optional(),
});

export async function practiceRoutes(app: FastifyInstance) {
  // ─── Get current practice ─────────────────────────────────────────────────

  app.get("/practices/current", async (req, reply) => {
    const practice = await db.query.practices.findFirst({
      where: eq(schema.practices.id, req.auth.practiceId),
    });

    if (!practice) {
      // Return a sensible stub if no practice record exists yet
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Practice not configured yet",
        statusCode: 404,
      });
    }

    return reply.send({ data: practice });
  });

  // ─── Update practice info ─────────────────────────────────────────────────

  app.patch("/practices/current", async (req, reply) => {
    const parsed = updatePracticeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const [updated] = await db
      .update(schema.practices)
      .set(parsed.data)
      .where(eq(schema.practices.id, req.auth.practiceId))
      .returning();

    if (!updated) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Practice not found",
        statusCode: 404,
      });
    }

    return reply.send({ data: updated });
  });

  // ─── Update clinic config (EDI / taxonomy / billing settings) ────────────

  app.patch("/practices/current/clinic-config", async (req, reply) => {
    const parsed = clinicConfigSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request body",
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    // Fetch current practice to merge clinic config (JSONB partial update)
    const current = await db.query.practices.findFirst({
      where: eq(schema.practices.id, req.auth.practiceId),
    });

    if (!current) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "Practice not found",
        statusCode: 404,
      });
    }

    const mergedConfig = {
      ...(current.clinicConfig ?? {}),
      ...parsed.data,
    } as NonNullable<typeof current.clinicConfig>;

    const [updated] = await db
      .update(schema.practices)
      .set({ clinicConfig: mergedConfig })
      .where(eq(schema.practices.id, req.auth.practiceId))
      .returning();

    return reply.send({ data: updated });
  });

  // ─── List team members ────────────────────────────────────────────────────

  app.get("/practices/current/team", async (req, reply) => {
    const team = await db.query.users.findMany({
      where: eq(schema.users.practiceId, req.auth.practiceId),
      orderBy: (u, { asc }) => [asc(u.name)],
    });

    return reply.send({
      data: team.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        // A member who hasn't signed in yet has no linked Clerk account.
        status: u.clerkId ? "active" : "invited",
        createdAt: u.createdAt,
      })),
    });
  });

  // ─── Invite a team member (admin only) ────────────────────────────────────
  // Creates a pending users row scoped to the caller's practice. When that
  // person signs up in Clerk with the same email, the tenant-auth hook claims
  // this row (see resolveTenant → "pending invite" path) instead of creating a
  // new practice.

  app.post(
    "/practices/current/invites",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const parsed = inviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid request body",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }

      const email = parsed.data.email.toLowerCase();

      // users.email is globally unique — reject if already taken (invited or active).
      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });
      if (existing) {
        const onThisTeam = existing.practiceId === req.auth.practiceId;
        return reply.status(409).send({
          error: "EMAIL_EXISTS",
          message: onThisTeam
            ? "This person is already on your team"
            : "This email is already registered to another practice",
          statusCode: 409,
        });
      }

      const [invited] = await db
        .insert(schema.users)
        .values({
          practiceId: req.auth.practiceId,
          email,
          name: parsed.data.name ?? email.split("@")[0],
          role: parsed.data.role,
          clerkId: null,
        })
        .returning();

      return reply.status(201).send({
        data: {
          id: invited?.id,
          email: invited?.email,
          name: invited?.name,
          role: invited?.role,
          status: "invited",
        },
      });
    }
  );
}
