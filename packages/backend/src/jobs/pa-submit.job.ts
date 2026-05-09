import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import { redisConnection } from "./queue.js";
import { db, schema } from "../db/index.js";
import * as ediService from "../services/edi.service.js";
import type { PASubmitJobData } from "../types/index.js";

const { authorizations, authorizationHistory, patients, payers } = schema;

export const paSubmitWorker = new Worker<PASubmitJobData>(
  "pa-submit",
  async (job) => {
    const { authorizationId, practiceId } = job.data;

    console.log(`[pa-submit] Processing job ${job.id} for auth ${authorizationId}`);

    // Load authorization with relations
    const auth = await db.query.authorizations.findFirst({
      where: and(
        eq(authorizations.id, authorizationId),
        eq(authorizations.practiceId, practiceId)
      ),
      with: { patient: true, payer: true },
    });

    if (!auth) {
      throw new Error(`Authorization ${authorizationId} not found`);
    }

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
        notes: `Payer ${auth.payer.name} requires portal/fax submission`,
        performedBy: "system",
      });
      return;
    }

    // Generate X12 278 request
    const x278Request = ediService.generateX278Request({
      transactionId: authorizationId.substring(0, 9),
      submitterId: practiceId,
      providerId: practiceId,
      providerNpi: "0000000000", // Would come from practice record
      payerId: auth.payer.payerId,
      patient: {
        memberId: auth.patient.memberId,
        firstName: auth.patient.firstName,
        lastName: auth.patient.lastName,
        dob: auth.patient.dob,
      },
      services: auth.cptCodes.map((cptCode) => ({
        cptCode,
        icdCodes: auth.icdCodes,
        requestedVisits: auth.requestedVisits,
        startDate: auth.startDate ?? new Date().toISOString().slice(0, 10),
        endDate:
          auth.endDate ??
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
      })),
    });

    // Submit to clearinghouse
    const submission = await ediService.submitToClearinghouse(
      x278Request,
      auth.payer.payerId
    );

    if (submission.status === "rejected") {
      throw new Error(
        `Clearinghouse rejected submission: ${submission.errors.join(", ")}`
      );
    }

    console.log(
      `[pa-submit] Submitted to clearinghouse. Submission ID: ${submission.submissionId}`
    );

    // Update to pending (awaiting payer response)
    await db
      .update(authorizations)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(authorizations.id, authorizationId));

    await db.insert(authorizationHistory).values({
      authorizationId,
      action: "edi_submitted",
      fromStatus: "submitted",
      toStatus: "pending",
      notes: `EDI submission accepted. Submission ID: ${submission.submissionId}`,
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
