import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { eq, and } from "drizzle-orm";
import { config } from "./config.js";
import { db, portalSubmissions, portalConnections, portalRecipes } from "./db.js";
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

    const recipe = await db.query.portalRecipes.findFirst({
      where: and(
        eq(portalRecipes.portalKey, conn.portalKey),
        eq(portalRecipes.isActive, true)
      ),
    });
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
      case "submitted":
        await setStatus(portalSubmissionId, {
          status: "submitted",
          confirmationNumber: outcome.confirmationNumber,
          completedAt: new Date(),
        });
        break;
      case "needs_mfa":
        await setStatus(portalSubmissionId, { status: "needs_mfa", needsHumanReason: outcome.reason });
        break;
      case "needs_human":
        await setStatus(portalSubmissionId, { status: "needs_human", needsHumanReason: outcome.reason });
        break;
      case "failed":
        await setStatus(portalSubmissionId, { status: "failed", lastError: outcome.error });
        throw new Error(outcome.error); // let BullMQ retry per backoff
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
