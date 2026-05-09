import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import type { PASubmitJobData, PAStatusCheckJobData } from "../types/index.js";

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

// ─── Queue Health ─────────────────────────────────────────────────────────────

export async function getQueueHealth() {
  const [submitCounts, statusCounts] = await Promise.all([
    paSubmitQueue.getJobCounts("waiting", "active", "completed", "failed"),
    paStatusQueue.getJobCounts("waiting", "active", "completed", "failed"),
  ]);

  return {
    paSubmit: submitCounts,
    paStatus: statusCounts,
  };
}

export async function closeQueues() {
  await Promise.all([
    paSubmitQueue.close(),
    paStatusQueue.close(),
    redisConnection.quit(),
  ]);
}
