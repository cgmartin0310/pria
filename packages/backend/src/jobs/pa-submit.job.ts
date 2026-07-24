import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import { redisConnection } from "./queue.js";
import { db, schema } from "../db/index.js";
import * as ediService from "../services/edi.service.js";
import { assembleX278Request } from "../services/edi-assembler.service.js";
import { getRoutingForPayer } from "../services/clearinghouse.service.js";
import { buildSimulatedResponse } from "../services/simulated.service.js";
import { applyX278Response } from "../services/edi-response.service.js";
import * as availity from "../services/availity.service.js";
import { toServiceReview } from "../services/availity-mapper.service.js";
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
    let assembledRequest: Awaited<ReturnType<typeof assembleX278Request>>["request"];

    try {
      const assembled = await assembleX278Request(authorizationId, practiceId);
      assembledRequest = assembled.request;

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

    // ── Route to the practice's connected clearinghouse ───────────────────
    const routing = await getRoutingForPayer(practiceId, auth.payerId);

    if (!routing) {
      // No clearinghouse connected for this payer — falls back to manual.
      await db
        .update(authorizations)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(authorizations.id, authorizationId));
      await db.insert(authorizationHistory).values({
        authorizationId,
        action: "manual_submission_required",
        fromStatus: "submitted",
        toStatus: "pending",
        notes:
          `No connected clearinghouse can reach ${auth.payer.name}. ` +
          `Connect a clearinghouse in Settings and import this payer, or submit manually.`,
        performedBy: "system",
      });
      return;
    }

    if (!routing.supports278) {
      await db
        .update(authorizations)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(authorizations.id, authorizationId));
      await db.insert(authorizationHistory).values({
        authorizationId,
        action: "manual_submission_required",
        fromStatus: "submitted",
        toStatus: "pending",
        notes:
          `${auth.payer.name} is not marked 278-capable via ${routing.clearinghouseKey}. ` +
          `Update the payer's 278 setting or submit manually.`,
        performedBy: "system",
      });
      return;
    }

    // ── Test Mode: simulate the full round trip ───────────────────────────
    // Takes the real generated 278, returns a canned 278 RESPONSE, parses it,
    // and applies the decision — exercising the whole pipeline end to end.
    // Every decision is labelled as simulated in the authorization history.
    if (routing.clearinghouseKey === "simulated") {
      const decision = routing.credentials?.simulatedDecision ?? "A1";

      const { edi: responseEdi } = buildSimulatedResponse({
        decision,
        traceNumber: auth.internalTrackingNumber ?? authorizationId,
        payerName: auth.payer.name,
        payerId: routing.clearinghousePayerId,
        practiceName: "PRACTICE",
        practiceNpi: "0000000000",
        patientLastName: "PATIENT",
        patientFirstName: "TEST",
        memberId: "TESTMEMBER",
      });

      const applied = await applyX278Response(
        authorizationId,
        practiceId,
        responseEdi,
        { source: "Test Mode (simulated payer)", simulated: true }
      );

      console.log(
        `[pa-submit] SIMULATED decision ${decision} → ${applied.status} for auth ${authorizationId}`
      );
      return;
    }

    // ── Availity: submit as a Service Review (structured JSON, not raw X12) ──
    if (routing.clearinghouseKey === "availity") {
      // Idempotency: if a prior attempt already submitted (id recorded), do NOT
      // submit again on a BullMQ retry — that would file a duplicate 278.
      if (auth.clearinghouseSubmissionId) {
        console.warn(
          `[pa-submit] Auth ${authorizationId} already submitted to Availity ` +
            `(${auth.clearinghouseSubmissionId}) — skipping duplicate submission`
        );
        return;
      }

      const creds = routing.credentials ?? {};
      if (!creds.clientId || !creds.clientSecret) {
        throw new Error("Availity connection is missing credentials");
      }

      const payload = toServiceReview(assembledRequest, {
        availityPayerId: routing.clearinghousePayerId,
      });

      const result = await availity.submitServiceReview(
        {
          clientId: creds.clientId,
          clientSecret: creds.clientSecret,
          scope: creds.scope,
          demo: creds.demo,
          environment: creds.environment,
        },
        payload
      );

      // Availity returns 202 + a Location to poll; a terminal statusCode may
      // already be present (A1 certified / A3 denied / A4 pended).
      const terminal = result.statusCode === "A1" || result.statusCode === "A3";

      // From here on the submission HAS happened — record-keeping failures must
      // not throw, or BullMQ would retry the job and file a duplicate 278.
      try {
      await db
        .update(authorizations)
        .set({
          status: terminal
            ? result.statusCode === "A1"
              ? "approved"
              : "denied"
            : "pending",
          clearinghouseSubmissionId: result.id ?? null,
          submittedAt: new Date(),
          ...(terminal ? { decidedAt: new Date() } : {}),
          ...(result.statusCode ? { decisionCode: result.statusCode } : {}),
          ...(result.status ? { decisionMessage: result.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(authorizations.id, authorizationId));

      const notes = [
        `Submitted to Availity Service Reviews${creds.demo ? " (demo)" : ""}` +
          ` — HTTP ${result.httpStatus}` +
          (result.id ? `, service review ${result.id}` : "") +
          (result.status ? `, status: ${result.status} (${result.statusCode ?? "?"})` : ""),
        result.validationMessages.length > 0
          ? `Validation: ${result.validationMessages.join(" | ")}`
          : null,
        `X12 278 also generated locally (${ediContent.split("~").length - 1} segments) for audit.`,
        assemblyWarnings.length > 0
          ? `Assembly warnings: ${assemblyWarnings.join(" | ")}`
          : null,
      ]
        .filter((n): n is string => n !== null)
        .join("\n");

      await db.insert(authorizationHistory).values({
        authorizationId,
        action: terminal ? "decision_received" : "submitted_to_clearinghouse",
        fromStatus: "submitted",
        toStatus: terminal
          ? result.statusCode === "A1"
            ? "approved"
            : "denied"
          : "pending",
        notes,
        performedBy: "system",
      });
      } catch (recordErr) {
        console.error(
          `[pa-submit] Submission to Availity SUCCEEDED for auth ${authorizationId} ` +
            `(service review ${result.id ?? "unknown"}) but recording it failed — ` +
            `NOT retrying to avoid a duplicate submission:`,
          recordErr instanceof Error ? recordErr.message : recordErr
        );
      }

      console.log(
        `[pa-submit] Availity service review ${result.id ?? "(no id)"} → ${result.status ?? "accepted"}`
      );
      return;
    }

    throw new Error(`No adapter implemented for clearinghouse ${routing.clearinghouseKey}`);
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
