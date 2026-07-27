import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { eq, and, isNull } from "drizzle-orm";
import { config } from "./config.js";
import {
  db,
  portalSubmissions,
  portalConnections,
  portalRecipes,
  authorizations,
  authorizationHistory,
} from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import * as availityEssentials from "./adapters/availity-essentials.js";
import type { PortalCredentials, PortalSubmissionPayload, RecipeStep } from "./types.js";

/**
 * portalKey → adapter dispatch. Previously the Availity adapter was hardcoded
 * for every portal, so a connection with any other portalKey would have been
 * driven against the wrong login flow.
 */
const adapters: Record<string, typeof availityEssentials.submit> = {
  availity_essentials: availityEssentials.submit,
};

const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

async function setStatus(id: string, fields: Record<string, unknown>) {
  await db
    .update(portalSubmissions)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(portalSubmissions.id, id));
}

/**
 * One portal submission: load the work + creds + active recipe, drive the
 * portal, and record the outcome. Every worker in the fleet runs this loop;
 * scaling = running more of them (autoscale on the queue's waiting count).
 */
const worker = new Worker<{ portalSubmissionId: string; practiceId: string }>(
  "portal-submit",
  async (job) => {
    const { portalSubmissionId } = job.data;

    const sub = await db.query.portalSubmissions.findFirst({
      where: eq(portalSubmissions.id, portalSubmissionId),
    });
    if (!sub) throw new Error(`Submission ${portalSubmissionId} not found`);

    const conn = await db.query.portalConnections.findFirst({
      where: eq(portalConnections.id, sub.portalConnectionId),
    });
    if (!conn?.encryptedCredentials) throw new Error("Portal connection/credentials missing");

    // Resolve the recipe payer-specific first (wizard flows differ per payer
    // within one portal), then fall back to the portal's generic recipe.
    const auth = await db.query.authorizations.findFirst({
      where: eq(authorizations.id, sub.authorizationId),
      columns: { id: true, payerId: true, status: true, authNumber: true, submittedAt: true, updatedAt: true },
    });
    let recipe = auth?.payerId
      ? await db.query.portalRecipes.findFirst({
          where: and(
            eq(portalRecipes.portalKey, conn.portalKey),
            eq(portalRecipes.payerId, auth.payerId),
            eq(portalRecipes.isActive, true)
          ),
        })
      : undefined;
    if (!recipe) {
      recipe = await db.query.portalRecipes.findFirst({
        where: and(
          eq(portalRecipes.portalKey, conn.portalKey),
          isNull(portalRecipes.payerId),
          eq(portalRecipes.isActive, true)
        ),
      });
    }
    if (!recipe) {
      await setStatus(portalSubmissionId, {
        status: "needs_human",
        needsHumanReason: `No active recipe for ${conn.portalKey} — record one first`,
      });
      return;
    }

    const adapter = adapters[conn.portalKey];
    if (!adapter) {
      await setStatus(portalSubmissionId, {
        status: "needs_human",
        needsHumanReason: `No adapter implemented for portal '${conn.portalKey}'`,
      });
      return;
    }

    const credentials = JSON.parse(decryptSecret(conn.encryptedCredentials)) as PortalCredentials;
    const sessionState = conn.encryptedSession ? decryptSecret(conn.encryptedSession) : undefined;

    await setStatus(portalSubmissionId, {
      status: "logging_in",
      claimedBy: config.workerId,
      startedAt: new Date(),
      attempts: (sub.attempts ?? 0) + 1,
    });

    const outcome = await adapter({
      credentials,
      sessionState,
      recipeSteps: recipe.steps as RecipeStep[],
      payload: sub.payload as PortalSubmissionPayload,
      onSession: async (storageStateJson) => {
        await db
          .update(portalConnections)
          .set({
            encryptedSession: encryptSecret(storageStateJson),
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(portalConnections.id, conn.id));
      },
    });

    switch (outcome.kind) {
      case "submitted": {
        await setStatus(portalSubmissionId, {
          status: "submitted",
          confirmationNumber: outcome.confirmationNumber,
          completedAt: new Date(),
        });
        // Reflect the filing on the authorization itself: pending = filed with
        // the payer, awaiting their decision. Best-effort — the submission row
        // above is the source of truth.
        try {
          await db
            .update(authorizations)
            .set({
              status: "pending",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(authorizations.id, sub.authorizationId));
          await db.insert(authorizationHistory).values({
            authorizationId: sub.authorizationId,
            action: "portal_submitted",
            fromStatus: "pending",
            toStatus: "pending",
            notes:
              `Filed via payer portal by ${config.workerId}` +
              (outcome.confirmationNumber
                ? ` — confirmation ${outcome.confirmationNumber}`
                : " (no confirmation number captured)"),
            performedBy: "system",
          });
        } catch (err) {
          console.error(
            `[portal-worker] filed OK but couldn't update authorization ${sub.authorizationId}:`,
            err instanceof Error ? err.message : err
          );
        }
        break;
      }
      case "needs_mfa":
        await setStatus(portalSubmissionId, {
          status: "needs_mfa",
          needsHumanReason: outcome.reason,
          pauseScreenshot: outcome.screenshot ?? null,
        });
        break;
      case "needs_human":
        await setStatus(portalSubmissionId, {
          status: "needs_human",
          needsHumanReason: outcome.reason,
          pauseScreenshot: outcome.screenshot ?? null,
        });
        break;
      case "failed":
        await setStatus(portalSubmissionId, {
          status: "failed",
          lastError: outcome.error,
          pauseScreenshot: outcome.screenshot ?? null,
        });
        // No throw: the portal queue has attempts:1 by design (a died-mid-flow
        // run may already have clicked submit) — retries are human-driven.
        break;
    }
  },
  { connection, concurrency: config.concurrency }
);

worker.on("completed", (job) => console.log(`[portal-worker] ${config.workerId} done ${job.id}`));
worker.on("failed", (job, err) =>
  console.error(`[portal-worker] ${config.workerId} failed ${job?.id}:`, err.message)
);

console.log(
  `[portal-worker] ${config.workerId} listening on portal-submit (concurrency ${config.concurrency})`
);
