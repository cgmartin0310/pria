import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  pgTable,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { config } from "./config.js";

/**
 * The worker shares Pria's Postgres and touches only the portal_* tables.
 * These declarations mirror the API schema for the columns the worker uses.
 */
export const portalSubmissions = pgTable("portal_submissions", {
  id: varchar("id", { length: 26 }).primaryKey(),
  practiceId: varchar("practice_id", { length: 26 }).notNull(),
  authorizationId: varchar("authorization_id", { length: 26 }).notNull(),
  portalConnectionId: varchar("portal_connection_id", { length: 26 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  payload: jsonb("payload"),
  confirmationNumber: varchar("confirmation_number", { length: 100 }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  needsHumanReason: text("needs_human_reason"),
  pauseScreenshot: text("pause_screenshot"),
  claimedBy: varchar("claimed_by", { length: 100 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at"),
});

export const portalConnections = pgTable("portal_connections", {
  id: varchar("id", { length: 26 }).primaryKey(),
  practiceId: varchar("practice_id", { length: 26 }).notNull(),
  portalKey: varchar("portal_key", { length: 50 }).notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  encryptedSession: text("encrypted_session"),
  sessionValidUntil: timestamp("session_valid_until"),
  lastLoginAt: timestamp("last_login_at"),
  updatedAt: timestamp("updated_at"),
});

export const portalRecipes = pgTable("portal_recipes", {
  id: varchar("id", { length: 26 }).primaryKey(),
  portalKey: varchar("portal_key", { length: 50 }).notNull(),
  steps: jsonb("steps").notNull(),
  isActive: boolean("is_active").notNull().default(false),
});

const { Pool } = pg;
const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });

export const db = drizzle(pool, {
  schema: { portalSubmissions, portalConnections, portalRecipes },
});
