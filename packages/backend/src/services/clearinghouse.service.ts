import { eq, and, sql, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import * as claimmd from "./claimmd.service.js";
import * as availity from "./availity.service.js";

/** Credentials accepted when connecting a clearinghouse. */
export interface ConnectCredentials {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  demo?: boolean;
  environment?: "production" | "test";
  /** Test Mode only. */
  simulatedDecision?: "A1" | "A3" | "A4";
}

const {
  clearinghouses,
  practiceClearinghouses,
  clearinghousePayers,
  clearinghousePayerDirectory,
  payers,
} = schema;

// ─── Networks ──────────────────────────────────────────────────────────────────

export async function listClearinghouses() {
  return db.query.clearinghouses.findMany({
    where: eq(clearinghouses.isActive, true),
    orderBy: (c, { asc }) => [asc(c.name)],
  });
}

// ─── Connections (per practice) ─────────────────────────────────────────────────

function maskKey(key?: string): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

/** Best identifier to show for a connection's credential, never the secret. */
function credentialLabel(creds: {
  accountKey?: string;
  clientId?: string;
}): string | null {
  if (creds.clientId) return maskKey(creds.clientId);
  if (creds.accountKey) return maskKey(creds.accountKey);
  return null;
}

export async function listConnections(practiceId: string) {
  const rows = await db.query.practiceClearinghouses.findMany({
    where: eq(practiceClearinghouses.practiceId, practiceId),
    with: { clearinghouse: true },
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });

  // Count linked payers per clearinghouse (directory is shared per clearinghouse).
  const counts = await db
    .select({
      clearinghouseId: clearinghousePayers.clearinghouseId,
      count: sql<number>`count(*)`,
    })
    .from(clearinghousePayers)
    .groupBy(clearinghousePayers.clearinghouseId);
  const countMap = new Map(counts.map((c) => [c.clearinghouseId, Number(c.count)]));

  return rows.map((r) => ({
    id: r.id,
    clearinghouseId: r.clearinghouseId,
    clearinghouseKey: r.clearinghouse.key,
    clearinghouseName: r.clearinghouse.name,
    label: r.label,
    accountKeyMasked: credentialLabel(r.credentials ?? {}),
    demo: r.credentials?.demo ?? false,
    environment: r.credentials?.environment ?? null,
    isActive: r.isActive,
    lastSyncedAt: r.lastSyncedAt,
    payerCount: countMap.get(r.clearinghouseId) ?? 0,
    createdAt: r.createdAt,
  }));
}

export async function connectClearinghouse(
  practiceId: string,
  clearinghouseKey: string,
  creds: ConnectCredentials,
  label?: string
) {
  const ch = await db.query.clearinghouses.findFirst({
    where: eq(clearinghouses.key, clearinghouseKey),
  });
  if (!ch) throw new ClearinghouseError(404, "Unknown clearinghouse");

  let stored: ConnectCredentials;

  if (clearinghouseKey === "simulated") {
    // Test Mode needs no credentials — just which decision to simulate.
    stored = { simulatedDecision: creds.simulatedDecision ?? "A1" };
  } else if (clearinghouseKey === "availity") {
    if (!creds.clientId || !creds.clientSecret) {
      throw new ClearinghouseError(400, "Client ID and Client Secret are required");
    }

    // Validate against Availity's token endpoint before saving. Their docs are
    // ambiguous about which host demo credentials use, so try both and remember
    // whichever authenticated.
    const resolved = await availity.resolveConnection({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scope: creds.scope,
      demo: creds.demo,
    });

    if (!resolved.ok) {
      throw new ClearinghouseError(
        400,
        `Availity rejected those credentials. Check the Client ID (API KEY), ` +
          `Client Secret, and that the Scope matches your product's scope ` +
          `permissions. Details — ${resolved.error}`
      );
    }

    stored = {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scope: creds.scope,
      demo: creds.demo ?? false,
      environment: resolved.environment,
    };
  } else {
    throw new ClearinghouseError(
      400,
      `${ch.name} integration is being set up and isn't available to connect yet.`
    );
  }

  const [row] = await db
    .insert(practiceClearinghouses)
    .values({
      practiceId,
      clearinghouseId: ch.id,
      label: label ?? ch.name,
      credentials: stored,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [practiceClearinghouses.practiceId, practiceClearinghouses.clearinghouseId],
      set: {
        credentials: stored,
        label: label ?? ch.name,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function disconnectClearinghouse(
  practiceId: string,
  connectionId: string
) {
  await db
    .delete(practiceClearinghouses)
    .where(
      and(
        eq(practiceClearinghouses.id, connectionId),
        eq(practiceClearinghouses.practiceId, practiceId)
      )
    );
}

// ─── Payer directory search + add ───────────────────────────────────────────────

async function getConnection(practiceId: string, connectionId: string) {
  const conn = await db.query.practiceClearinghouses.findFirst({
    where: and(
      eq(practiceClearinghouses.id, connectionId),
      eq(practiceClearinghouses.practiceId, practiceId)
    ),
    with: { clearinghouse: true },
  });
  if (!conn) throw new ClearinghouseError(404, "Connection not found");
  return conn;
}

/**
 * Pull the clearinghouse's ENTIRE payer directory into our cache.
 *
 * Availity pages at 50 per request and offers no name search, so a usable
 * search requires the whole list locally. Rate limit is 5 calls/sec, so pages
 * are spaced out; this is a deliberate, occasional admin action.
 */
export async function syncPayerDirectory(
  practiceId: string,
  connectionId: string
): Promise<{
  synced: number;
  pages: number;
  truncated: boolean;
  serviceReviewCapable: number;
  coverageError: string | null;
}> {
  const conn = await getConnection(practiceId, connectionId);
  const creds = conn.credentials ?? {};

  if (conn.clearinghouse.key !== "availity") {
    throw new ClearinghouseError(
      400,
      "Directory sync is only available for Availity connections"
    );
  }
  if (!creds.clientId || !creds.clientSecret) {
    throw new ClearinghouseError(400, "Connection has no Availity credentials");
  }

  const availityCreds = {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    scope: creds.scope,
    demo: creds.demo,
    environment: creds.environment,
  };

  const PAGE = 50;
  const MAX_PAGES = 200; // 10k payers ceiling so a runaway list can't hang us
  const SPACING_MS = 220; // stay under Availity's 5 req/sec

  let offset = 0;
  let pages = 0;
  let truncated = false;

  // Availity returns one row per payer PER TRANSACTION ROUTE, so the same
  // payerId recurs many times. Collect and merge first — inserting duplicates in
  // one statement fails with "ON CONFLICT DO UPDATE command cannot affect row a
  // second time".
  const collected = new Map<string, { name: string; transactions: Set<string> }>();

  for (; pages < MAX_PAGES; pages++) {
    const page = await availity.fetchPayerList(availityCreds, {
      offset,
      limit: PAGE,
    });
    if (page.length === 0) break;

    for (const p of page) {
      const existing = collected.get(p.payerId);
      if (existing) {
        for (const t of p.transactions) existing.transactions.add(t);
      } else {
        collected.set(p.payerId, {
          name: p.payerName,
          transactions: new Set(p.transactions),
        });
      }
    }

    offset += PAGE;
    if (page.length < PAGE) break; // last page
    await new Promise((r) => setTimeout(r, SPACING_MS));
  }

  if (pages >= MAX_PAGES) truncated = true;

  // Authoritative 278-request coverage: which payers accept a Service Reviews
  // (278) request via the API. This is what decides API vs portal submission.
  let coverage = new Set<string>();
  let coverageError: string | null = null;
  try {
    coverage = await availity.fetchServiceReviewPayerIds(availityCreds, {
      subtypeId: "HS",
    });
  } catch (err) {
    coverageError = err instanceof Error ? err.message : "coverage lookup failed";
  }

  // Bulk upsert the de-duplicated directory in chunks.
  const rows = Array.from(collected.entries()).map(([payerId, v]) => ({
    clearinghouseId: conn.clearinghouseId,
    payerId,
    name: v.name,
    transactions: Array.from(v.transactions).sort(),
    supportsServiceReview: coverage.has(payerId),
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(clearinghousePayerDirectory)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [
          clearinghousePayerDirectory.clearinghouseId,
          clearinghousePayerDirectory.payerId,
        ],
        set: {
          name: sql`excluded.name`,
          transactions: sql`excluded.transactions`,
          supportsServiceReview: sql`excluded.supports_service_review`,
          updatedAt: new Date(),
        },
      });
  }

  const synced = rows.length;
  const serviceReviewCapable = rows.filter((r) => r.supportsServiceReview).length;

  await db
    .update(practiceClearinghouses)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(practiceClearinghouses.id, connectionId));

  return { synced, pages, truncated, serviceReviewCapable, coverageError };
}

/** Search the connected clearinghouse's payer directory. */
export async function searchPayers(
  practiceId: string,
  connectionId: string,
  query: string
) {
  const conn = await getConnection(practiceId, connectionId);
  const creds = conn.credentials ?? {};

  // Normalised results across clearinghouses.
  let results: Array<{
    clearinghousePayerId: string;
    name: string;
    capabilities?: Record<string, string>;
  }>;

  if (conn.clearinghouse.key === "availity") {
    // Search the synced directory. Availity has no name-search parameter, so
    // querying live would only ever filter the first page of thousands.
    const like = `%${query.toLowerCase()}%`;
    const rows = await db
      .select({
        payerId: clearinghousePayerDirectory.payerId,
        name: clearinghousePayerDirectory.name,
        transactions: clearinghousePayerDirectory.transactions,
        supportsServiceReview: clearinghousePayerDirectory.supportsServiceReview,
      })
      .from(clearinghousePayerDirectory)
      .where(
        and(
          eq(clearinghousePayerDirectory.clearinghouseId, conn.clearinghouseId),
          sql`(lower(${clearinghousePayerDirectory.name}) like ${like} or lower(${clearinghousePayerDirectory.payerId}) like ${like})`
        )
      )
      .orderBy(clearinghousePayerDirectory.name)
      .limit(50);

    if (rows.length === 0) {
      const [{ count } = { count: 0 }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(clearinghousePayerDirectory)
        .where(eq(clearinghousePayerDirectory.clearinghouseId, conn.clearinghouseId));
      if (Number(count) === 0) {
        throw new ClearinghouseError(
          400,
          "Payer directory hasn't been synced yet — click “Sync payer directory” first."
        );
      }
    }

    results = rows.map((r) => ({
      clearinghousePayerId: r.payerId,
      name: r.name,
      capabilities: {
        transactions: (r.transactions ?? []).join(", "),
        // Authoritative 278-request capability from the Configurations API.
        api278: r.supportsServiceReview ? "yes" : "no",
      },
    }));
  } else if (conn.clearinghouse.key === "claim_md") {
    const accountKey = creds.accountKey;
    if (!accountKey) throw new ClearinghouseError(400, "Connection has no Account Key");
    const payers = await claimmd.fetchPayerList(accountKey, query);
    results = payers.map((p) => ({
      clearinghousePayerId: p.payerid,
      name: p.payer_name,
      capabilities: p.capabilities,
    }));
  } else {
    throw new ClearinghouseError(
      400,
      "Payer search isn't available for this clearinghouse — add payers manually."
    );
  }

  // Flag which are already imported into this clearinghouse's directory.
  const existing = await db
    .select({ chPayerId: clearinghousePayers.clearinghousePayerId })
    .from(clearinghousePayers)
    .where(eq(clearinghousePayers.clearinghouseId, conn.clearinghouseId));
  const have = new Set(existing.map((e) => e.chPayerId));

  return results.slice(0, 50).map((p) => ({
    ...p,
    capabilities: p.capabilities ?? {},
    added: have.has(p.clearinghousePayerId),
  }));
}

/** Import a payer from the clearinghouse directory into our payer list. */
export async function addPayer(
  practiceId: string,
  connectionId: string,
  payer: { clearinghousePayerId: string; name: string; capabilities?: Record<string, string> }
) {
  const conn = await getConnection(practiceId, connectionId);

  // Upsert the canonical payer (keyed by EDI payer id).
  const [canonical] = await db
    .insert(payers)
    .values({
      name: payer.name,
      payerId: payer.clearinghousePayerId,
      payerIdQualifier: "PI",
      supportsX278: true,
      rulesConfig: {
        requiresPreAuth: true,
        submissionMethod: "x12",
        avgDecisionDays: 5,
        notes: `Imported from ${conn.clearinghouse.name}`,
      },
    })
    .onConflictDoUpdate({
      target: payers.payerId,
      set: { name: payer.name },
    })
    .returning();

  if (!canonical) throw new ClearinghouseError(500, "Failed to save payer");

  // Link it to the clearinghouse directory (278 assumed capable by default).
  await db
    .insert(clearinghousePayers)
    .values({
      clearinghouseId: conn.clearinghouseId,
      payerId: canonical.id,
      clearinghousePayerId: payer.clearinghousePayerId,
      supports278: true,
      capabilities: payer.capabilities ?? null,
    })
    .onConflictDoUpdate({
      target: [clearinghousePayers.clearinghouseId, clearinghousePayers.payerId],
      set: {
        clearinghousePayerId: payer.clearinghousePayerId,
        capabilities: payer.capabilities ?? null,
        updatedAt: new Date(),
      },
    });

  await db
    .update(practiceClearinghouses)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(practiceClearinghouses.id, connectionId));

  return canonical;
}

/**
 * Diagnostic: fire a DEMO Service Reviews request to find out whether this
 * connection's credentials actually have access to the 278 product.
 *
 * Always forced to demo mode with Availity's mock scenario, so it never submits
 * a real authorization to a real payer — it only answers "does my app have
 * Service Reviews access?".
 */
export async function testServiceReview(practiceId: string, connectionId: string) {
  const conn = await getConnection(practiceId, connectionId);
  const creds = conn.credentials ?? {};

  if (conn.clearinghouse.key !== "availity") {
    throw new ClearinghouseError(400, "Only available for Availity connections");
  }
  if (!creds.clientId || !creds.clientSecret) {
    throw new ClearinghouseError(400, "Connection has no Availity credentials");
  }

  // Demo is forced on, so submitServiceReview sends the documented empty `{}`
  // body and the mock scenario header decides the response — nothing here can
  // reach a real payer. The payload below is therefore unused in demo mode.
  const probe = { requestTypeCode: "HS" };

  try {
    const result = await availity.submitServiceReview(
      {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        scope: creds.scope,
        demo: true, // mock header when honoured; probe is inert regardless
        environment: creds.environment,
      },
      probe
    );
    return {
      ok: true,
      httpStatus: result.httpStatus,
      status: result.status,
      statusCode: result.statusCode,
      serviceReviewId: result.id,
      validationMessages: result.validationMessages,
      debug: null,
      message:
        "Service Reviews accepted the call — your subscription includes 278.",
    };
  } catch (err) {
    const httpStatus =
      err instanceof availity.AvailityError ? err.statusCode : null;
    const detail = err instanceof Error ? err.message : "Request failed";

    // 401/403 = genuinely no access. Anything else (esp. 400 validation) means
    // we authenticated and reached the Service Reviews API — i.e. we DO have
    // access, and the messages are its required-field feedback.
    const debug =
      err instanceof availity.AvailityError ? (err.debug ?? null) : null;

    const denied = httpStatus === 401 || httpStatus === 403;
    if (denied) {
      return {
        ok: false,
        httpStatus,
        status: null,
        statusCode: null,
        serviceReviewId: null,
        validationMessages: [],
        debug,
        message:
          "Availity rejected the call as unauthorized — Service Reviews is NOT included in this subscription.",
      };
    }

    return {
      ok: true,
      httpStatus,
      status: null,
      statusCode: null,
      serviceReviewId: null,
      validationMessages: [detail],
      debug,
      message:
        "Service Reviews is reachable — you have 278 access. The probe was " +
        "intentionally incomplete, so this is Availity's field validation talking.",
    };
  }
}

/** Admin override for whether a payer accepts 278 through a clearinghouse. */
export async function setPayer278(
  practiceId: string,
  payerId: string,
  supports278: boolean
) {
  // Restrict to clearinghouses this practice has connected.
  const connected = await db
    .select({ clearinghouseId: practiceClearinghouses.clearinghouseId })
    .from(practiceClearinghouses)
    .where(eq(practiceClearinghouses.practiceId, practiceId));
  const ids = connected.map((c) => c.clearinghouseId);
  if (ids.length === 0) return;

  await db
    .update(clearinghousePayers)
    .set({ supports278, updatedAt: new Date() })
    .where(
      and(
        eq(clearinghousePayers.payerId, payerId),
        inArray(clearinghousePayers.clearinghouseId, ids)
      )
    );
}

// ─── Payers available to a practice (via connected clearinghouses) ──────────────

export async function listPracticePayers(practiceId: string) {
  const rows = await db
    .select({
      id: payers.id,
      name: payers.name,
      payerId: payers.payerId,
      payerIdQualifier: payers.payerIdQualifier,
      supports278: clearinghousePayers.supports278,
      clearinghousePayerId: clearinghousePayers.clearinghousePayerId,
      clearinghouseId: clearinghousePayers.clearinghouseId,
    })
    .from(payers)
    .innerJoin(clearinghousePayers, eq(clearinghousePayers.payerId, payers.id))
    .innerJoin(
      practiceClearinghouses,
      eq(practiceClearinghouses.clearinghouseId, clearinghousePayers.clearinghouseId)
    )
    .where(
      and(
        eq(practiceClearinghouses.practiceId, practiceId),
        eq(practiceClearinghouses.isActive, true)
      )
    )
    .orderBy(payers.name);

  // De-dupe by payer id (a payer could be reachable via >1 connected network).
  const seen = new Set<string>();
  const result: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    result.push(r);
  }
  return result;
}

/**
 * Resolve which connected clearinghouse should carry a 278 for `payerId`.
 * Returns the credential + clearinghouse-specific payer id, or null if none.
 */
export async function getRoutingForPayer(practiceId: string, payerId: string) {
  const rows = await db
    .select({
      connectionId: practiceClearinghouses.id,
      clearinghouseKey: clearinghouses.key,
      credentials: practiceClearinghouses.credentials,
      clearinghousePayerId: clearinghousePayers.clearinghousePayerId,
      supports278: clearinghousePayers.supports278,
    })
    .from(practiceClearinghouses)
    .innerJoin(
      clearinghouses,
      eq(clearinghouses.id, practiceClearinghouses.clearinghouseId)
    )
    .innerJoin(
      clearinghousePayers,
      eq(clearinghousePayers.clearinghouseId, practiceClearinghouses.clearinghouseId)
    )
    .where(
      and(
        eq(practiceClearinghouses.practiceId, practiceId),
        eq(practiceClearinghouses.isActive, true),
        eq(clearinghousePayers.payerId, payerId)
      )
    );

  // Prefer a connection that supports 278.
  const best = rows.find((r) => r.supports278) ?? rows[0];
  if (!best) return null;

  return {
    connectionId: best.connectionId,
    clearinghouseKey: best.clearinghouseKey,
    credentials: best.credentials ?? null,
    clearinghousePayerId: best.clearinghousePayerId,
    supports278: best.supports278,
  };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ClearinghouseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ClearinghouseError";
  }
}
