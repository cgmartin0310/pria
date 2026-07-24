import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import * as portalService from "../services/portal.service.js";
import { PortalError } from "../services/portal.service.js";
import * as recipeService from "../services/portal-recipe.service.js";
import {
  isAllowedRecipeUrl,
  type RecipeStep,
} from "../services/portal-recipe.types.js";
import { requireRole, requirePlatformAdmin } from "../auth/tenant.js";

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

  // ── Recipes (learned portal workflows) ────────────────────────────────────
  // Recipes are GLOBAL: every tenant's worker replays the active one, with live
  // PHI bound into its steps. Writing them is therefore PLATFORM-admin only
  // (practice-admin is self-serve and not a trust boundary), steps are strictly
  // schema-validated, and navigate URLs must stay on the portal's own hosts.

  const selector = z.string().min(1).max(1000);
  const stepSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("navigate"), url: z.string().url().max(2000), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("waitFor"), selector, timeoutMs: z.number().int().min(100).max(120_000).optional(), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("click"), selector, note: z.string().max(500).optional() }),
    z.object({ action: z.literal("type"), selector, value: z.string().max(2000).optional(), binding: z.string().max(200).optional(), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("select"), selector, value: z.string().max(2000).optional(), binding: z.string().max(200).optional(), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("check"), selector, note: z.string().max(500).optional() }),
    z.object({ action: z.literal("captureText"), selector, store: z.literal("confirmationNumber"), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("pauseForHuman"), reason: z.string().min(1).max(500), note: z.string().max(500).optional() }),
    z.object({ action: z.literal("submit"), selector, note: z.string().max(500).optional() }),
  ]);

  const recipeSchema = z.object({
    portalKey: z.string().min(1).max(50),
    name: z.string().min(1).max(255),
    steps: z.array(stepSchema).min(1).max(200),
    activate: z.boolean().optional(),
  });

  app.get("/portals/recipes", async (req, reply) => {
    const portalKey = (req.query as Record<string, string>)["portalKey"];
    const data = await recipeService.listRecipes(portalKey);
    return reply.send({ data });
  });

  app.post(
    "/portals/recipes",
    { preHandler: requirePlatformAdmin },
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

      // Navigation is confined to the portal's own hosts — a recipe runs in an
      // authenticated session with PHI bound in, so anywhere else is exfil.
      for (const step of parsed.data.steps) {
        if (
          step.action === "navigate" &&
          !isAllowedRecipeUrl(parsed.data.portalKey, step.url)
        ) {
          return reply.status(400).send({
            error: "VALIDATION_ERROR",
            message: `navigate URL not allowed for ${parsed.data.portalKey}: ${step.url}`,
            statusCode: 400,
          });
        }
      }

      try {
        const row = await recipeService.createRecipe({
          portalKey: parsed.data.portalKey,
          name: parsed.data.name,
          steps: parsed.data.steps as RecipeStep[],
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
    { preHandler: requirePlatformAdmin },
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
