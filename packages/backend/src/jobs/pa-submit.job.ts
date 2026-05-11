import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import { redisConnection } from "./queue.js";
import { db, schema } from "../db/index.js";
import * as ediService from "../services/edi.service.js";
import { assembleX278Request } from "../services/edi-assembler.service.js";
import type { PASubmitJobData } from "../types/index.js";

const { authorizations, authorizationHistory } = schema;

export const paSubmitWorker = new Worker<PASubmitJobData>(
  "pa-submit",
  async (job) => {
    const { authorizationId, practiceId } = job.data;

    console.log(`[pa-submit] Processing job ${job.id} for auth ${authorizationId}`);

    // ── Load authorization to check payer support ─────────────────────────
    const auth = await db.query.authorizations.findFirst({
      where: and(
        eq(authorizations.id, authorizationId),
        eq(authorizations.practiceId, practiceId)
      ),
      with: { payer: true },
    });

    if (!auth) {
      throw new Error(`Authorization ${authorizationId} not found`);
    }

    // If payer doesn't support X12 278, update status and exit gracefully
    if (!auth.payer.supportsX278) {
      console.log(
        `[pa-submit] Payer ${auth.payer.name} does not support X12 278; manual submission required`
      );

      await db
        .update(authorizations)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(authorizations.id, authorizationId));

      await db.insert(authorizationHistory).values({
        authorizationId,
        action: "manual_submission_required",
        fromStatus: "submitted",
        toStatus: "pending",
        notes: `Payer ${auth.payer.name} requires portal/fax submission — X12 278 not supported`,
        performedBy: "system",
      });

      return;
    }

    // ── Assemble X12278Request from DB records ────────────────────────────
    // The assembler loads all related records (practice, patient, payer, provider),
    // validates required fields, auto-populates from discipline/clinic config,
    // and handles subscriber vs. dependent logic.
    let assemblyWarnings: string[] = [];
    let ediContent: string;

    try {
      const assembled = await assembleX278Request(authorizationId, practiceId);

      if (assembled.warnings.length > 0) {
        assemblyWarnings = assembled.warnings;
        console.warn(`[pa-submit] Assembly warnings for auth ${authorizationId}:`);
        for (const warning of assemblyWarnings) {
          console.warn(`  ⚠ ${warning}`);
        }
      }

      // Generate X12 278 EDI string from the assembled request
      ediContent = ediService.generateX278Request(assembled.request);
      console.log(
        `[pa-submit] Generated X12 278 (${ediContent.length} chars, ` +
        `${ediContent.split("~").length - 1} segments)`
      );

      // Log EDI content for debugging (in production, store as document instead)
      // TODO: Store ediContent as an authorizationDocument once an 'edi_x278' document
      // type is added to the documentTypeEnum schema migration.
      console.log(`[pa-submit] EDI preview (first 500 chars):\n${ediContent.substring(0, 500)}`);

    } catch (assembleErr) {
      const msg = assembleErr instanceof Error ? assembleErr.message : String(assembleErr);
      throw new Error(`Failed to assemble/generate X12 278: ${msg}`);
    }

    // ── Submit to clearinghouse ───────────────────────────────────────────
    const submission = await ediService.submitToClearinghouse(
      ediContent,
      auth.payer.payerId
    );

    if (submission.status === "rejected") {
      throw new Error(
        `Clearinghouse rejected 278 submission: ${submission.errors.join(", ")}`
      );
    }

    console.log(
      `[pa-submit] 278 submission accepted by clearinghouse. Submission ID: ${submission.submissionId}`
    );

    // ── Update authorization status ───────────────────────────────────────
    await db
      .update(authorizations)
      .set({
        status: "pending",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(authorizations.id, authorizationId));

    // ── Record in authorization history ───────────────────────────────────
    const historyNotes = [
      `X12 278 EDI submitted to clearinghouse. Submission ID: ${submission.submissionId}`,
      assemblyWarnings.length > 0
        ? `Assembly warnings: ${assemblyWarnings.join(" | ")}`
        : null,
    ]
      .filter((n): n is string => n !== null)
      .join("\n");

    await db.insert(authorizationHistory).values({
      authorizationId,
      action: "edi_submitted",
      fromStatus: "submitted",
      toStatus: "pending",
      notes: historyNotes,
      performedBy: "system",
    });
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

paSubmitWorker.on("completed", (job) => {
  console.log(`[pa-submit] Job ${job.id} completed`);
});

paSubmitWorker.on("failed", (job, err) => {
  console.error(`[pa-submit] Job ${job?.id} failed:`, err.message);
});
