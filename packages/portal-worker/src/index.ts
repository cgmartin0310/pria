import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { eq, and } from "drizzle-orm";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "./config.js";
import {
  db,
  portalSubmissions,
  portalConnections,
  portalRecipes,
  authorizations,
  authorizationHistory,
  authorizationDocuments,
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
    // Recipes are PER PAYER: wizard flows differ materially between payers on
    // the same portal, so there is deliberately no generic fallback — filing a
    // payer with another payer's flow would fail in ways nobody checked.
    const recipe = auth?.payerId
      ? await db.query.portalRecipes.findFirst({
          where: and(
            eq(portalRecipes.portalKey, conn.portalKey),
            eq(portalRecipes.payerId, auth.payerId),
            eq(portalRecipes.isActive, true)
          ),
        })
      : undefined;
    if (!recipe) {
      await setStatus(portalSubmissionId, {
        status: "needs_human",
        needsHumanReason:
          `No recipe for this payer on ${conn.portalKey} yet — file this one by ` +
          `hand, and add the payer's recipe on the Payers page to automate it.`,
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

    // Materialize uploaded attachments as temp files so recipes can
    // setInputFiles them (portals like CCH require e.g. the Plan of Care).
    const docs = await db.query.authorizationDocuments.findMany({
      where: eq(authorizationDocuments.authorizationId, sub.authorizationId),
    });
    let docDir: string | null = null;
    const documentPaths: string[] = [];
    const documentTypes: string[] = [];
    for (const doc of docs) {
      if (!doc.fileData || !doc.fileName) continue;
      docDir = docDir ?? (await mkdtemp(join(tmpdir(), "pria-docs-")));
      const filePath = join(docDir, doc.fileName.replace(/[^\w.\-]/g, "_"));
      await writeFile(filePath, Buffer.from(doc.fileData, "base64"));
      documentPaths.push(filePath);
      // `content` holds the portal attachment-type code. Documents uploaded
      // before typing existed stored the FILENAME there — anything that isn't
      // a 1-2 character code falls back to M1 (Medical Record Attachment).
      const code = (doc.content ?? "").trim();
      documentTypes.push(/^[A-Za-z0-9]{1,2}$/.test(code) ? code.toUpperCase() : "M1");
    }

    const payload = {
      ...(sub.payload as PortalSubmissionPayload),
      documentPaths,
      documentTypes,
    };

    const outcome = await adapter({
      credentials,
      sessionState,
      recipeSteps: recipe.steps as RecipeStep[],
      payload,
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

    if (docDir) {
      await rm(docDir, { recursive: true, force: true }).catch(() => {});
    }

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
          takeoverSessionId: outcome.takeover?.sessionId ?? null,
          takeoverUrl: outcome.takeover?.liveViewUrl ?? null,
        });
        break;
      case "needs_human":
        await setStatus(portalSubmissionId, {
          status: "needs_human",
          needsHumanReason: outcome.reason,
          pauseScreenshot: outcome.screenshot ?? null,
          takeoverSessionId: outcome.takeover?.sessionId ?? null,
          takeoverUrl: outcome.takeover?.liveViewUrl ?? null,
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
