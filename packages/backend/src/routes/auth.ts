import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Auth routes.
 * The tenant-auth hook (see auth/tenant.ts) has already verified the Clerk JWT
 * and resolved req.auth before these handlers run.
 */
export async function authRoutes(app: FastifyInstance) {
  // Returns the current authenticated user + their practice context.
  app.get("/auth/me", async (req, reply) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.auth.userId),
      with: { practice: true },
    });

    if (!user) {
      return reply.status(404).send({
        error: "NOT_FOUND",
        message: "User not found",
        statusCode: 404,
      });
    }

    return reply.send({
      data: {
        id: user.id,
        practiceId: user.practiceId,
        email: user.email,
        name: user.name,
        role: user.role,
        practice: user.practice ?? null,
      },
    });
  });
}
