import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { redisConnection } from "./queue.js";
import { db, schema } from "../db/index.js";
import * as ediService from "../services/edi.service.js";
import type { PAStatusCheckJobData } from "../types/index.js";

const { authorizations, authorizationHistory } = schema;

export const paStatusWorker = new Worker<PAStatusCheckJobData>(
  "pa-status",
  async (job) => {
    const { authorizationId, authNumber, payerId } = job.data;

    console.log(
      `[pa-status] Checking status for auth ${authorizationId} (${authNumber})`
    );

    const statusResult = await ediService.inquireAuthStatus(authNumber, payerId);

    if (statusResult.status === "approved") {
      await db
        .update(authorizations)
        .set({
          status: "approved",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(authorizations.id, authorizationId));

      await db.insert(authorizationHistory).values({
        authorizationId,
        action: "status_update",
        fromStatus: "pending",
        toStatus: "approved",
        notes: statusResult.message,
        performedBy: "system",
      });
    } else if (statusResult.status === "denied") {
      await db
        .update(authorizations)
        .set({
          status: "denied",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(authorizations.id, authorizationId));

      await db.insert(authorizationHistory).values({
        authorizationId,
        action: "status_update",
        fromStatus: "pending",
        toStatus: "denied",
        notes: statusResult.message,
        performedBy: "system",
      });
    } else {
      console.log(
        `[pa-status] Auth ${authorizationId} still pending: ${statusResult.message}`
      );
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
  }
);

paStatusWorker.on("completed", (job) => {
  console.log(`[pa-status] Job ${job.id} completed`);
});

paStatusWorker.on("failed", (job, err) => {
  console.error(`[pa-status] Job ${job?.id} failed:`, err.message);
});
