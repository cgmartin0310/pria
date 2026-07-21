import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { createClerkClient, verifyToken } from "@clerk/backend";
import type { User as ClerkUser } from "@clerk/backend";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";

const { users, practices } = schema;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "therapist" | "billing";

/**
 * Resolved tenant context for an authenticated request.
 * Attached to `req.auth` by the tenant-auth hook and used everywhere a
 * practice-scoped query previously used the hardcoded STUB_PRACTICE_ID.
 */
export interface AuthContext {
  /** PRIA users.id (NOT the Clerk user id) */
  userId: string;
  /** The practice this user belongs to — the multi-tenancy boundary */
  practiceId: string;
  role: UserRole;
  /** Clerk user id (JWT `sub`) */
  clerkId: string;
  email: string;
}

// Augment Fastify so req.auth is typed inside route handlers.
declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

// ─── Clerk client ──────────────────────────────────────────────────────────────

const clerkClient = createClerkClient({ secretKey: config.clerk.secretKey });

/** Origins allowed to mint tokens for this API (defense against token reuse). */
const authorizedParties = config.cors.origin
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ─── Errors ────────────────────────────────────────────────────────────────────

class AuthError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ─── Token verification ─────────────────────────────────────────────────────────

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

async function verifyClerkToken(req: FastifyRequest): Promise<string> {
  const token = extractBearer(req);
  if (!token) {
    throw new AuthError(401, "UNAUTHENTICATED", "Missing bearer token");
  }
  if (!config.clerk.secretKey) {
    throw new AuthError(
      500,
      "AUTH_NOT_CONFIGURED",
      "CLERK_SECRET_KEY is not configured on the server"
    );
  }
  try {
    const claims = await verifyToken(token, {
      secretKey: config.clerk.secretKey,
      ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
    });
    if (!claims.sub) {
      throw new AuthError(401, "UNAUTHENTICATED", "Token has no subject");
    }
    return claims.sub;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    const message = err instanceof Error ? err.message : "Token verification failed";
    throw new AuthError(401, "UNAUTHENTICATED", message);
  }
}

// ─── Clerk profile helpers ──────────────────────────────────────────────────────

function primaryEmail(clerkUser: ClerkUser): string {
  const primaryId = clerkUser.primaryEmailAddressId;
  const primary = clerkUser.emailAddresses.find((e) => e.id === primaryId);
  const email = (primary ?? clerkUser.emailAddresses[0])?.emailAddress;
  if (!email) {
    throw new AuthError(
      403,
      "NO_EMAIL",
      "Clerk account has no email address; cannot provision a practice"
    );
  }
  return email.toLowerCase();
}

function displayName(clerkUser: ClerkUser, fallback: string): string {
  const parts = [clerkUser.firstName, clerkUser.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (clerkUser.username) return clerkUser.username;
  return fallback;
}

function derivePracticeName(clerkUser: ClerkUser, email: string): string {
  const name = displayName(clerkUser, "");
  if (name) return `${name}'s Practice`;
  return `${email.split("@")[0]}'s Practice`;
}

// ─── Tenant resolution + provisioning ───────────────────────────────────────────

type UserRow = typeof users.$inferSelect;

function toContext(user: UserRow, clerkId: string): AuthContext {
  return {
    userId: user.id,
    practiceId: user.practiceId,
    role: user.role,
    clerkId,
    email: user.email,
  };
}

/**
 * Provisioning model = "both":
 *   1. Known Clerk user      → load their existing PRIA user row.
 *   2. Pending invite (email row with no clerkId) → claim it.
 *   3. Brand-new user        → self-serve: create a practice + admin user.
 */
async function resolveTenant(clerkId: string): Promise<AuthContext> {
  // 1. Existing user linked by Clerk id — the common, hot path (DB only).
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (existing) return toContext(existing, clerkId);

  // We need the email/name to claim an invite or self-provision.
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = primaryEmail(clerkUser);

  // 2. Pending invite: a users row seeded by an admin, email match, no clerkId yet.
  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (byEmail) {
    if (byEmail.clerkId && byEmail.clerkId !== clerkId) {
      throw new AuthError(
        409,
        "EMAIL_CONFLICT",
        "This email is already linked to a different account"
      );
    }
    const [claimed] = await db
      .update(users)
      .set({
        clerkId,
        name: byEmail.name || displayName(clerkUser, email),
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    return toContext(claimed ?? byEmail, clerkId);
  }

  // 3. Self-serve: create a fresh practice and make this user its admin.
  return provisionNewPractice(clerkId, clerkUser, email);
}

async function provisionNewPractice(
  clerkId: string,
  clerkUser: ClerkUser,
  email: string
): Promise<AuthContext> {
  try {
    const [practice] = await db
      .insert(practices)
      .values({
        name: derivePracticeName(clerkUser, email),
        // Placeholders — the user completes these during onboarding (Settings).
        npi: "",
        address: { street: "", city: "", state: "", zip: "" },
        phone: "",
      })
      .returning();

    if (!practice) {
      throw new AuthError(500, "PROVISION_FAILED", "Could not create practice");
    }

    const [user] = await db
      .insert(users)
      .values({
        practiceId: practice.id,
        email,
        name: displayName(clerkUser, email),
        role: "admin",
        clerkId,
      })
      .returning();

    if (!user) {
      throw new AuthError(500, "PROVISION_FAILED", "Could not create user");
    }

    return toContext(user, clerkId);
  } catch (err) {
    // Handle the race where a concurrent first request already provisioned:
    // the users.email unique index rejects the second insert — re-resolve.
    if (err instanceof AuthError) throw err;
    const raced = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
    });
    if (raced) return toContext(raced, clerkId);
    throw err;
  }
}

// ─── Fastify plugin ──────────────────────────────────────────────────────────────

/**
 * Registers the tenant-auth hook on the given (encapsulated) instance.
 * Every request routed through this instance must present a valid Clerk
 * bearer token; `req.auth` is populated before any handler runs.
 */
export async function tenantAuthPlugin(api: FastifyInstance): Promise<void> {
  // Request decorators are shared app-wide; guard so building the app more than
  // once (e.g. in tests) doesn't throw "decorator already present".
  if (!api.hasRequestDecorator("auth")) {
    // Populated per-request in the onRequest hook below; the initial null is
    // replaced before any handler runs.
    api.decorateRequest("auth", null as unknown as AuthContext);
  }

  api.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const clerkId = await verifyClerkToken(req);
      req.auth = await resolveTenant(clerkId);
    } catch (err) {
      const e =
        err instanceof AuthError
          ? err
          : new AuthError(500, "AUTH_ERROR", "Authentication failed");
      req.log.warn({ err }, "auth failed");
      return reply.status(e.statusCode).send({
        error: e.code,
        message: e.message,
        statusCode: e.statusCode,
      });
    }
  });
}

// ─── Role guard ──────────────────────────────────────────────────────────────────

/**
 * Route-level guard for role-restricted endpoints (e.g. admin-only invites).
 * Usage: `app.post("/x", { preHandler: requireRole("admin") }, handler)`
 */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(req.auth.role)) {
      await reply.status(403).send({
        error: "FORBIDDEN",
        message: `Requires role: ${roles.join(" or ")}`,
        statusCode: 403,
      });
    }
  };
}
