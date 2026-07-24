import { config as loadEnv } from "dotenv";

loadEnv();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  server: {
    port: parseInt(process.env["PORT"] ?? "3000", 10),
    host: process.env["HOST"] ?? "0.0.0.0",
    nodeEnv: (process.env["NODE_ENV"] ?? "development") as
      | "development"
      | "production"
      | "test",
  },
  database: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://postgres:password@localhost:5432/pria",
  },
  redis: {
    url: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  },
  anthropic: {
    apiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
    model: "claude-opus-4-5",
  },
  clerk: {
    secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
  },
  cors: {
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
  },
  /**
   * Base64-encoded 32-byte key for encrypting stored credentials at rest
   * (portal logins, clearinghouse secrets). Generate with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  encryptionKey: process.env["CREDENTIAL_ENCRYPTION_KEY"] ?? "",
  /**
   * Comma-separated emails allowed to manage PLATFORM-level resources that
   * affect every tenant (portal recipes). Practice admins are NOT sufficient —
   * any signup gets practice-admin. Empty list = nobody (fail closed).
   */
  platformAdminEmails: (process.env["PLATFORM_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
} as const;
