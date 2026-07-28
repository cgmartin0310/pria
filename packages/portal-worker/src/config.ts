import { config as loadEnv } from "dotenv";

loadEnv();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  /** Same Redis the Pria API enqueues portal-submit jobs on. */
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  /** Same Postgres as the API — the worker reads/writes portal_* tables. */
  databaseUrl: required("DATABASE_URL"),
  /** Must match the API's CREDENTIAL_ENCRYPTION_KEY to decrypt stored logins. */
  encryptionKey: required("CREDENTIAL_ENCRYPTION_KEY"),
  /**
   * Where the browser lives. In production this is a remote CDP/websocket
   * endpoint (a Chromium on the VM, or a hosted browser). playwright-core does
   * not bundle a browser — you point it at one.
   */
  browserWsEndpoint: process.env["BROWSER_WS_ENDPOINT"] ?? "",
  /** How many auths one worker process handles at once (≈ browser tabs). */
  concurrency: parseInt(process.env["WORKER_CONCURRENCY"] ?? "1", 10),
  /**
   * Steel (hosted browsers). When set, each run gets its own Steel session so
   * a PAUSED run can be handed to a human via Steel's live view instead of
   * being thrown away. Unset = local Chromium, no takeover.
   *
   * PHI renders in Steel's browsers — a BAA with Steel is required before real
   * patient data goes through it.
   */
  steelApiKey: process.env["STEEL_API_KEY"] ?? "",
  steelBaseUrl: process.env["STEEL_BASE_URL"] ?? "https://api.steel.dev",
  /** Minutes a paused session stays alive for takeover before Steel reaps it. */
  steelSessionTtlMinutes: parseInt(process.env["STEEL_SESSION_TTL_MIN"] ?? "45", 10),
  /** Identifies this worker in portal_submissions.claimed_by. */
  workerId: process.env["WORKER_ID"] ?? `worker-${process.pid}`,
} as const;
