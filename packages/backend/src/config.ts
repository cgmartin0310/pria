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
} as const;
