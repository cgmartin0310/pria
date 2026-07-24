import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import * as portalService from "../services/portal.service.js";
import { PortalError } from "../services/portal.service.js";
import * as recipeService from "../services/portal-recipe.service.js";
import type { RecipeStep } from "../services/portal-recipe.types.js";
import { requireRole } from "../auth/tenant.js";

const connectSchema = z.object({
  portalKey: z.string().min(1).default("availity_essentials"),
  label: z.string().max(255).optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  totpSeed: z.string().optional(),
});

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof PortalError) {
    return reply.status(err.statusCode).send({
      error: "PORTAL_ERROR",
      message: err.message,
      statusCode: err.statusCode,
    });
  }
  const message = err instanceof Error ? err.message : "Portal request failed";
  return reply.status(500).send({ error: "PORTAL_ERROR", message, statusCode: 500 });
}

export async function portalRoutes(app: FastifyInstance) {
  // List portal connections (secrets never returned)
  app.get("/portals/connections", async (req, reply) => {
    const data = await portalService.listPortalConnections(req.auth.practiceId);
    return reply.send({ data });
  });

  // Connect / update a portal login (admin) — credentials stored encrypted
  app.post(
    "/portals/connect",
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
        const row = await portalService.connectPortal(req.auth.practiceId, parsed.data);
        return reply.status(201).send({ data: { id: row?.id, connected: true } });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // Disconnect (admin)
  app.delete(
    "/portals/connections/:id",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await portalService.disconnectPortal(req.auth.practiceId, id);
      return reply.send({ data: { disconnected: true } });
    }
  );

  // Queue an authorization for agent-driven portal submission
  app.post("/authorizations/:id/submit-portal", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const submission = await portalService.enqueuePortalSubmission(
        req.auth.practiceId,
        id
      );
      return reply.status(202).send({ data: submission });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Verify the stored authenticator seed produces the right code (admin)
  app.get(
    "/portals/connections/:id/totp-check",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const data = await portalService.checkTotp(req.auth.practiceId, id);
        return reply.send({ data });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // List portal submissions + their status
  app.get("/portals/submissions", async (req, reply) => {
    const data = await portalService.listSubmissions(req.auth.practiceId);
    return reply.send({ data });
  });

  // ── Recipes (learned portal workflows; global, admin-managed) ─────────────

  const recipeSchema = z.object({
    portalKey: z.string().min(1),
    name: z.string().min(1).max(255),
    steps: z.array(z.record(z.unknown())).min(1),
    activate: z.boolean().optional(),
  });

  app.get("/portals/recipes", async (req, reply) => {
    const portalKey = (req.query as Record<string, string>)["portalKey"];
    const data = await recipeService.listRecipes(portalKey);
    return reply.send({ data });
  });

  app.post(
    "/portals/recipes",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const parsed = recipeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid recipe",
          statusCode: 400,
          details: parsed.error.flatten(),
        });
      }
      try {
        const row = await recipeService.createRecipe({
          portalKey: parsed.data.portalKey,
          name: parsed.data.name,
          steps: parsed.data.steps as unknown as RecipeStep[],
          activate: parsed.data.activate,
          createdBy: req.auth.email,
        });
        return reply.status(201).send({ data: row });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  app.post(
    "/portals/recipes/:id/activate",
    { preHandler: requireRole("admin") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const data = await recipeService.activateRecipe(id);
        return reply.send({ data });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );
}
