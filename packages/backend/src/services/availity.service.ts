/**
 * Availity clearinghouse adapter.
 *
 * Availity uses OAuth 2.0 client-credentials. You exchange a client_id +
 * client_secret for a short-lived (5 min) bearer token, then call the REST APIs.
 * The 278 prior-auth product is "Service Reviews".
 *
 *   Token:  POST https://api.availity.com/v1/token   (grant_type=client_credentials)
 *   Base:   https://api.availity.com
 *
 * Demo/sandbox: append the mock headers to an API call to get canned responses
 * (no PHI). The scenario id comes from the API's reference section.
 *   X-Api-Mock-Response: true
 *   X-Api-Mock-Scenario-ID: <scenario id>
 *
 * Docs: https://developer.availity.com/  ·  Access is via Availity's developer
 * portal (org registration + product subscription).
 *
 * NOTE: the exact Service Reviews endpoint path + request schema still need to
 * be confirmed against the API reference before live submission is enabled —
 * getToken/testConnection below are the verified, testable parts.
 */

// Availity is environment-specific: demo/sandbox uses the test host, production
// uses the live host. (Per Availity's Getting Started docs.)
const PROD_BASE = "https://api.availity.com";
const TEST_BASE = "https://tst.api.availity.com";
const TOKEN_PATH = "/v1/token";
const PAYER_LIST_PATH = "/v1/availity-payer-list";
const TIMEOUT_MS = 15_000;

function baseFor(env: AvailityEnvironment): string {
  return env === "test" ? TEST_BASE : PROD_BASE;
}

export type AvailityEnvironment = "production" | "test";

export interface AvailityCredentials {
  clientId: string;
  clientSecret: string;
  /** Optional OAuth scope(s), space-separated (from the product details page). */
  scope?: string;
  /** When true, API calls request Availity's canned demo responses. */
  demo?: boolean;
  /** Which host to authenticate against. Resolved on connect if unset. */
  environment?: AvailityEnvironment;
}

export class AvailityError extends Error {
  constructor(
    message: string,
    public statusCode = 502
  ) {
    super(message);
    this.name = "AvailityError";
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AvailityError("Availity request timed out", 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange client credentials for a bearer access token.
 * Throws AvailityError with a helpful message if the credentials are rejected.
 */
export async function getToken(
  creds: AvailityCredentials,
  envOverride?: AvailityEnvironment
): Promise<string> {
  // client_secret_post: credentials go in the request body (confirmed by the
  // app's "TOKEN ENDPOINT AUTH METHOD" in Availity's portal).
  const body: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  };
  if (creds.scope) body["scope"] = creds.scope;

  const env: AvailityEnvironment =
    envOverride ?? creds.environment ?? (creds.demo ? "test" : "production");
  const tokenUrl = `${baseFor(env)}${TOKEN_PATH}`;

  return withTimeout(async (signal) => {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body).toString(),
      signal,
    });

    const json = (await res.json().catch(() => null)) as
      | { access_token?: string; error_description?: string; error?: string }
      | null;

    if (!res.ok || !json?.access_token) {
      const detail = json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
      throw new AvailityError(`Availity token request failed: ${detail}`, 400);
    }

    return json.access_token;
  });
}

/**
 * Validate credentials by fetching a token. Returns true if accepted.
 */
export async function testConnection(creds: AvailityCredentials): Promise<boolean> {
  try {
    await getToken(creds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Availity's docs are ambiguous about which host demo-plan credentials
 * authenticate against (production vs the tst. test host), so try both and
 * report which one worked. The result is stored on the connection so later
 * calls go straight to the right host.
 */
export async function resolveConnection(
  creds: AvailityCredentials
): Promise<
  | { ok: true; environment: AvailityEnvironment }
  | { ok: false; error: string }
> {
  const attempts: AvailityEnvironment[] = creds.demo
    ? ["test", "production"]
    : ["production", "test"];

  const errors: string[] = [];
  for (const env of attempts) {
    try {
      await getToken(creds, env);
      return { ok: true, environment: env };
    } catch (err) {
      errors.push(
        `${env}: ${err instanceof Error ? err.message : "request failed"}`
      );
    }
  }
  return { ok: false, error: errors.join(" · ") };
}

/**
 * Headers for an authenticated Availity API call, including demo mock headers
 * when the connection is in demo mode.
 */
export function apiHeaders(
  token: string,
  opts?: { demo?: boolean; scenarioId?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (opts?.demo) {
    headers["X-Api-Mock-Response"] = "true";
    if (opts.scenarioId) headers["X-Api-Mock-Scenario-ID"] = opts.scenarioId;
  }
  return headers;
}

// ─── Payer List ───────────────────────────────────────────────────────────────

export interface AvailityPayer {
  payerId: string;
  payerName: string;
  /** Transaction codes detected in the payer's processingRoutes (e.g. 270, 278). */
  transactions: string[];
  /** Whether the payer's routes mention a 278 (prior auth) transaction. */
  supports278: boolean;
}

/**
 * Pull the payer array out of Availity's response regardless of wrapper shape,
 * and normalise the id/name field names (they vary across their APIs).
 */
function extractPayers(json: unknown): AvailityPayer[] {
  let rows: unknown[] = [];
  if (Array.isArray(json)) {
    rows = json;
  } else if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["payers", "availityPayerList", "payerList", "data", "results"]) {
      if (Array.isArray(obj[key])) {
        rows = obj[key] as unknown[];
        break;
      }
    }
  }

  const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const payerId = pick(r, ["payerId", "payerID", "id", "payerCode", "code"]);
      // Availity returns both `name` and `displayName`; prefer the display one.
      const payerName = pick(r, ["displayName", "name", "payerName", "description"]);
      if (!payerId || !payerName) return null;

      // processingRoutes carries the per-transaction detail. Its exact shape
      // isn't published, so scan it for transaction codes rather than assume.
      const routesRaw = JSON.stringify(r["processingRoutes"] ?? "");
      const transactions = Array.from(
        new Set(routesRaw.match(/\b\d{3}[A-Z]?\b/g) ?? [])
      );
      const supports278 = /278/.test(routesRaw);

      return { payerId, payerName, transactions, supports278 };
    })
    .filter((p): p is AvailityPayer => p !== null);
}

/** One token+request attempt against a specific environment. */
async function payerListAttempt(
  creds: AvailityCredentials,
  env: AvailityEnvironment,
  query: string
): Promise<AvailityPayer[]> {
  const token = await getToken(creds, env);
  return withTimeout(async (signal) => {
    const res = await fetch(`${baseFor(env)}${PAYER_LIST_PATH}${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal,
    });
    if (!res.ok) {
      throw new AvailityError(`Availity payer list returned ${res.status}`, 502);
    }
    return extractPayers(await res.json());
  });
}

/**
 * Fetch Availity's payer directory. Tries the connection's resolved environment
 * first, then the other host (tokens are environment-specific, so each attempt
 * fetches its own token).
 */
export async function fetchPayerList(
  creds: AvailityCredentials,
  opts?: { q?: string; transactionType?: string; limit?: number }
): Promise<AvailityPayer[]> {
  // Only send parameters Availity actually documents (payerId, transactionType,
  // submissionMode, availability, enrollmentRequired) — undocumented params like
  // a name search or limit can be rejected. Name filtering happens locally.
  const params = new URLSearchParams();
  if (opts?.transactionType) params.set("transactionType", opts.transactionType);
  const query = params.toString() ? `?${params.toString()}` : "";

  const primary: AvailityEnvironment =
    creds.environment ?? (creds.demo ? "test" : "production");
  const order: AvailityEnvironment[] =
    primary === "test" ? ["test", "production"] : ["production", "test"];

  const errors: string[] = [];
  for (const env of order) {
    try {
      const payers = await payerListAttempt(creds, env, query);
      const limit = opts?.limit ?? 50;
      if (!opts?.q) return payers.slice(0, limit);

      const q = opts.q.toLowerCase();
      return payers
        .filter(
          (p) =>
            p.payerName.toLowerCase().includes(q) ||
            p.payerId.toLowerCase().includes(q)
        )
        .slice(0, limit);
    } catch (err) {
      errors.push(
        `${env}: ${err instanceof Error ? err.message : "request failed"}`
      );
    }
  }
  throw new AvailityError(`Availity payer list failed — ${errors.join(" · ")}`, 502);
}

/**
 * Submit a 278 Service Review. NOT YET ENABLED — the exact Service Reviews
 * endpoint path + payload schema must be confirmed against Availity's API
 * reference (available once the app is subscribed to the Service Reviews
 * product). Kept as an explicit throw so the submit path fails loudly rather
 * than silently pretending to submit.
 */
export async function submitServiceReview(): Promise<never> {
  throw new AvailityError(
    "Availity Service Reviews (278) submission is not yet configured — " +
      "pending confirmation of the endpoint from the API reference.",
    501
  );
}

export { PROD_BASE, TEST_BASE };
