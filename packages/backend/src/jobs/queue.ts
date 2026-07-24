import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import type { PASubmitJobData, PAStatusCheckJobData } from "../types/index.js";
import type { PortalSubmitJobData } from "../services/portal-adapter.types.js";

// ─── Redis Connection ─────────────────────────────────────────────────────────

export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

redisConnection.on("connect", () => console.log("[Redis] Connected"));
redisConnection.on("error", (err) => console.error("[Redis] Error:", err));

// ─── Queues ───────────────────────────────────────────────────────────────────

export const paSubmitQueue = new Queue<PASubmitJobData>("pa-submit", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const paStatusQueue = new Queue<PAStatusCheckJobData>("pa-status", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Portal submissions consumed by the OpenClaw/agent worker pool. Kept as its
 * own queue so the fleet scales on THIS queue's depth independent of EDI jobs.
 */
export const portalSubmitQueue = new Queue<PortalSubmitJobData>("portal-submit", {
  connection: redisConnection,
  defaultJobOptions: {
    // NO automatic retries: a portal run that died mid-flow may already have
    // clicked submit, and replaying the recipe blind could file the auth twice.
    // Failed/paused submissions are retried deliberately by a human via
    // POST /portals/submissions/:id/retry.
    attempts: 1,
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
  },
});

// ─── Queue Health ─────────────────────────────────────────────────────────────

export async function getQueueHealth() {
  const [submitCounts, statusCounts, portalCounts] = await Promise.all([
    paSubmitQueue.getJobCounts("waiting", "active", "completed", "failed"),
    paStatusQueue.getJobCounts("waiting", "active", "completed", "failed"),
    portalSubmitQueue.getJobCounts("waiting", "active", "completed", "failed"),
  ]);

  return {
    paSubmit: submitCounts,
    paStatus: statusCounts,
    // The portal queue's "waiting" count is the autoscale signal for the fleet.
    portalSubmit: portalCounts,
  };
}

export async function closeQueues() {
  await Promise.all([
    paSubmitQueue.close(),
    paStatusQueue.close(),
    portalSubmitQueue.close(),
    redisConnection.quit(),
  ]);
}
