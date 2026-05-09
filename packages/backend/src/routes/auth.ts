import type { FastifyInstance } from "fastify";

/**
 * Auth routes — Clerk integration stubs.
 * Production: implement Clerk JWT verification middleware.
 */
export async function authRoutes(app: FastifyInstance) {
  // Stub: Returns current user info (would verify Clerk JWT in production)
  app.get("/auth/me", async (req, reply) => {
    // In production: verify JWT from Authorization header, look up user in DB
    return reply.send({
      data: {
        id: "user_stub_001",
        practiceId: "practice_stub_001",
        email: "demo@pria.health",
        name: "Demo User",
        role: "admin",
      },
    });
  });

  // Stub: Session refresh
  app.post("/auth/refresh", async (req, reply) => {
    return reply.send({ data: { refreshed: true } });
  });
}
