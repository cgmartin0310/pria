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
// Availity's own docs disagree on the base path: the endpoint page shows
// /v1/availity-payer-list, while the full API guide consistently uses
// /availity/v1/... (and /availity/v2/service-reviews). Try the documented-in-
// the-guide form first, then fall back.
// The API Guide's own samples use no /availity/ prefix
// (https://api.availity.com/v1/availity-payer-list), while some reference pages
// show /availity/v1/... Try the guide's form first, then the prefixed one.
const PAYER_LIST_PATHS = [
  "/v1/availity-payer-list",
  "/availity/v1/availity-payer-list",
];
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

/** What we actually put on the wire — for diagnosing API rejections. */
export interface AvailityRequestDebug {
  url: string;
  method: string;
  contentType: string;
  bodySent: boolean;
  bodyLength: number;
  bodyPreview: string;
  mockHeaders: boolean;
  responseStatus?: number;
  responseBody?: string;
}

export class AvailityError extends Error {
  constructor(
    message: string,
    public statusCode = 502,
    public debug?: AvailityRequestDebug
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
/**
 * Token cache: Availity tokens live 5 minutes and every API call previously
 * fetched a fresh one — doubling request volume and blowing the 5 req/s limit
 * during directory syncs. Cached for 4 minutes, keyed by client+env+scope.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

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

  const cacheKey = `${creds.clientId}|${env}|${creds.scope ?? ""}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

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

    // Tokens are valid 5 min; cache for 4 to leave headroom for in-flight use.
    tokenCache.set(cacheKey, {
      token: json.access_token,
      expiresAt: Date.now() + 4 * 60_000,
    });
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
  /**
   * transactionDescription values from the payer's processingRoutes, e.g.
   * "Eligibility and Benefits Inquiry", "Claim Status Inquiry".
   *
   * NOTE: Availity's payer list does NOT expose 278 prior-authorization
   * *request* capability. Its 278 values are 278I (Health Care Services
   * Inquiry) and 278N (Notice of Admission) — neither is the PA request, which
   * goes through the separate Service Reviews API. Do not infer PA capability
   * from this list.
   */
  transactions: string[];
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
    // Availity collection resources wrap the page in a plural key (their docs
    // call it e.g. "coverages"), alongside offset/limit/count/totalCount.
    for (const key of [
      "payers",
      "availityPayerList",
      "payerList",
      "resources",
      "data",
      "results",
    ]) {
      if (Array.isArray(obj[key])) {
        rows = obj[key] as unknown[];
        break;
      }
    }
  }

  /** Recursively collect string values stored under `key`. */
  const collectByKey = (node: unknown, key: string, out: Set<string>): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => collectByKey(n, key, out));
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key && typeof v === "string" && v.trim()) out.add(v.trim());
      else collectByKey(v, key, out);
    }
  };

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

      // processingRoutes is a list of routes; each carries a
      // transactionDescription. Collect them wherever they appear.
      const found = new Set<string>();
      collectByKey(r["processingRoutes"], "transactionDescription", found);

      return { payerId, payerName, transactions: Array.from(found).sort() };
    })
    .filter((p): p is AvailityPayer => p !== null);
}

/** One token+request attempt against a specific environment. */
async function payerListAttempt(
  creds: AvailityCredentials,
  env: AvailityEnvironment,
  path: string,
  query: string
): Promise<AvailityPayer[]> {
  const token = await getToken(creds, env);
  return withTimeout(async (signal) => {
    const res = await fetch(`${baseFor(env)}${path}${query}`, {
      // Standard media type — see the note in serviceReviewHeaders about
      // Availity's "application.json" documentation typo.
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
  opts?: { transactionType?: string; limit?: number; offset?: number }
): Promise<AvailityPayer[]> {
  // Documented params: payerId, transactionType, submissionMode, availability,
  // enrollmentRequired, plus collection paging (offset/limit, limit max 50).
  // NOTE: there is NO name-search parameter — searching by name requires the
  // full directory locally (see syncPayerDirectory).
  const params = new URLSearchParams();
  if (opts?.transactionType) params.set("transactionType", opts.transactionType);
  params.set("limit", String(Math.min(opts?.limit ?? 50, 50)));
  params.set("offset", String(opts?.offset ?? 0));
  const query = `?${params.toString()}`;

  const primary: AvailityEnvironment =
    creds.environment ?? (creds.demo ? "test" : "production");
  const order: AvailityEnvironment[] =
    primary === "test" ? ["test", "production"] : ["production", "test"];

  const errors: string[] = [];
  const attempts = order.flatMap((env) =>
    PAYER_LIST_PATHS.map((path) => ({ env, path }))
  );

  for (const { env, path } of attempts) {
    try {
      return await payerListAttempt(creds, env, path, query);
    } catch (err) {
      errors.push(
        `${env}${path}: ${err instanceof Error ? err.message : "request failed"}`
      );
    }
  }
  throw new AvailityError(`Availity payer list failed — ${errors.join(" · ")}`, 502);
}

// ─── Configurations: which payers support the Service Reviews (278) API ────────

const CONFIG_PATHS = ["/v1/configurations", "/availity/v1/configurations"];

/** Pull the `configurations` array out of the collection response. */
function extractConfigs(json: unknown): Record<string, unknown>[] {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj["configurations"])) {
      return obj["configurations"] as Record<string, unknown>[];
    }
  }
  return [];
}

async function configAttempt(
  creds: AvailityCredentials,
  env: AvailityEnvironment,
  path: string,
  query: string
): Promise<{ payerId: string; payerName: string }[]> {
  const token = await getToken(creds, env);
  return withTimeout(async (signal) => {
    const res = await fetch(`${baseFor(env)}${path}${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal,
    });
    // Read as text first so a non-JSON error body is visible in the message.
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new AvailityError(
        `configurations ${res.status}: ${text.slice(0, 300)}`,
        res.status
      );
    }
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return extractConfigs(json)
      .map((c) => ({
        payerId: typeof c["payerId"] === "string" ? c["payerId"] : null,
        payerName: typeof c["payerName"] === "string" ? c["payerName"] : "",
      }))
      .filter((c): c is { payerId: string; payerName: string } => !!c.payerId);
  });
}

/**
 * The authoritative list of payers that accept a 278 prior-auth REQUEST through
 * Availity's Service Reviews API. Per Availity's docs, `type=service-reviews`
 * with no payerId returns "all payers that support the Service Reviews API".
 * subtype HS = outpatient authorization (PT/OT/ST).
 *
 * Returns a Set of Availity payer ids. Pages through the collection.
 */
export async function fetchServiceReviewPayerIds(
  creds: AvailityCredentials,
  opts?: { subtypeId?: string; maxPages?: number; spacingMs?: number }
): Promise<Set<string>> {
  const subtypeId = opts?.subtypeId ?? "HS";
  const maxPages = opts?.maxPages ?? 200;
  const spacing = opts?.spacingMs ?? 220;

  const primary: AvailityEnvironment =
    creds.environment ?? (creds.demo ? "test" : "production");
  const order: AvailityEnvironment[] =
    primary === "test" ? ["test", "production"] : ["production", "test"];

  // Availity's docs are explicit that "type without payerId" lists all payers
  // for Coverages, but ambiguous for service-reviews about subtypeId. Try the
  // subtyped form first, then without.
  const variants: Record<string, string>[] = [
    { type: "service-reviews", subtypeId },
    { type: "service-reviews" },
  ];

  const buildQuery = (base: Record<string, string>, offset: number): string =>
    `?${new URLSearchParams({ ...base, limit: "50", offset: String(offset) }).toString()}`;

  const found = new Set<string>();

  // Find a working variant + host + path using the first page.
  let working: { base: Record<string, string>; env: AvailityEnvironment; path: string } | null =
    null;
  const errors: string[] = [];

  for (const base of variants) {
    for (const env of order) {
      for (const path of CONFIG_PATHS) {
        try {
          const rows = await configAttempt(creds, env, path, buildQuery(base, 0));
          rows.forEach((r) => found.add(r.payerId));
          working = { base, env, path };
          if (rows.length < 50) return found; // single-page result
          break;
        } catch (err) {
          errors.push(
            `${JSON.stringify(base)} @ ${env}${path}: ${
              err instanceof Error ? err.message : "request failed"
            }`
          );
        }
      }
      if (working) break;
    }
    if (working) break;
  }

  if (!working) {
    throw new AvailityError(
      `Availity configurations failed — ${errors.join(" · ")}`,
      502
    );
  }

  // Page the rest with the variant that worked.
  let offset = 50;
  for (let page = 1; page < maxPages; page++) {
    await new Promise((res) => setTimeout(res, spacing));
    const rows = await configAttempt(
      creds,
      working.env,
      working.path,
      buildQuery(working.base, offset)
    );
    rows.forEach((r) => found.add(r.payerId));
    if (rows.length < 50) break;
    offset += 50;
  }

  return found;
}

// ─── Service Reviews (278 prior authorization) ─────────────────────────────────

const SERVICE_REVIEW_PATHS = [
  "/v2/service-reviews",
  "/availity/v2/service-reviews",
];

/** Working Service Reviews path per environment, learned on first success. */
const serviceReviewPathCache = new Map<AvailityEnvironment, string>();

export interface ServiceReviewResult {
  httpStatus: number;
  /** Availity's service review id (used to poll for the decision). */
  id: string | null;
  /** Location header to poll when Availity returns 202. */
  location: string | null;
  /** e.g. "In Progress", "Certified in Total". */
  status: string | null;
  /** e.g. "0" (in progress), "A1" (certified), "A3" (denied), "A4" (pended). */
  statusCode: string | null;
  /** Availity/health-plan validation errors, if the request was rejected. */
  validationMessages: string[];
  raw: unknown;
}

function serviceReviewHeaders(
  token: string,
  creds: AvailityCredentials,
  scenarioId?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    // Availity's docs say "application.json" (dot), but that isn't a valid media
    // type — their gateway then fails to parse the body and reports "Body cannot
    // be empty ... content-type is set to 'application/json'". Their own docs are
    // inconsistent ("application.json" vs "application/xml"), so use the standard.
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (creds.demo) {
    headers["X-Api-Mock-Response"] = "true";
    if (scenarioId) headers["X-Api-Mock-Scenario-ID"] = scenarioId;
  }
  return headers;
}

function parseServiceReview(
  httpStatus: number,
  location: string | null,
  json: unknown
): ServiceReviewResult {
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;

  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

  // validationMessages is an array of objects; surface their text.
  const messages: string[] = [];
  const vm = obj["validationMessages"];
  if (Array.isArray(vm)) {
    for (const m of vm) {
      if (typeof m === "string") messages.push(m);
      else if (m && typeof m === "object") {
        const mo = m as Record<string, unknown>;
        const text = str(mo["message"]) ?? str(mo["description"]) ?? null;
        const field = str(mo["field"]);
        if (text) messages.push(field ? `${field}: ${text}` : text);
      }
    }
  }

  return {
    httpStatus,
    id: str(obj["id"]),
    location,
    status: str(obj["status"]),
    statusCode: str(obj["statusCode"]),
    validationMessages: messages,
    raw: json,
  };
}

/** One POST/GET attempt against a specific environment + path. */
async function serviceReviewAttempt(
  creds: AvailityCredentials,
  env: AvailityEnvironment,
  path: string,
  init: { method: "POST" | "GET"; body?: string; idSuffix?: string },
  scenarioId?: string
): Promise<ServiceReviewResult> {
  const token = await getToken(creds, env);
  return withTimeout(async (signal) => {
    const url = `${baseFor(env)}${path}${init.idSuffix ?? ""}`;
    const headers = serviceReviewHeaders(token, creds, scenarioId);

    const debug: AvailityRequestDebug = {
      url,
      method: init.method,
      contentType: headers["Content-Type"] ?? "(none)",
      bodySent: init.body !== undefined,
      bodyLength: init.body?.length ?? 0,
      bodyPreview: (init.body ?? "").slice(0, 200),
      mockHeaders: !!creds.demo,
    };

    const res = await fetch(url, {
      method: init.method,
      headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal,
    });

    // Read as text first — Availity's errors aren't always JSON.
    const text = await res.text().catch(() => "");
    debug.responseStatus = res.status;
    debug.responseBody = text.slice(0, 500);

    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const result = parseServiceReview(res.status, res.headers.get("location"), json);

    // 200 = complete, 202 = accepted/in-progress. Anything else is an error we
    // still want the parsed validation messages from.
    if (res.status !== 200 && res.status !== 202) {
      const detail =
        result.validationMessages.length > 0
          ? result.validationMessages.join(" | ")
          : text || `HTTP ${res.status}`;
      throw new AvailityError(
        `Availity service review failed: ${detail}`,
        res.status,
        debug
      );
    }
    return result;
  });
}

async function serviceReviewRequest(
  creds: AvailityCredentials,
  init: { method: "POST" | "GET"; body?: string; idSuffix?: string },
  scenarioId?: string
): Promise<ServiceReviewResult> {
  const primary: AvailityEnvironment =
    creds.environment ?? (creds.demo ? "test" : "production");
  const order: AvailityEnvironment[] =
    primary === "test" ? ["test", "production"] : ["production", "test"];

  const errors: string[] = [];
  let firstClientError: AvailityError | null = null;

  // Once a path works for an environment, go straight to it next time — the
  // fallback sweep is for discovery, not for every call.
  const pathsFor = (env: AvailityEnvironment): string[] => {
    const hit = serviceReviewPathCache.get(env);
    return hit
      ? [hit, ...SERVICE_REVIEW_PATHS.filter((p) => p !== hit)]
      : [...SERVICE_REVIEW_PATHS];
  };

  /**
   * POST safety: a POST may have been ACCEPTED server-side even when the client
   * sees an error (timeout while reading the response, 5xx after commit). For
   * POSTs we only fall through to the next host/path when the failure proves
   * the request never reached the API: a 404 (wrong route at the gateway) or a
   * pre-response network error. Anything else throws immediately — retrying
   * could file the same prior authorization twice.
   */
  const safeToTryNext = (err: unknown): boolean => {
    if (init.method !== "POST") return true;
    if (err instanceof AvailityError && err.statusCode === 404) return true;
    if (!(err instanceof AvailityError) && err instanceof TypeError) return true; // fetch failed pre-send
    return false;
  };

  outer: for (const env of order) {
    for (const path of pathsFor(env)) {
      try {
        const result = await serviceReviewAttempt(creds, env, path, init, scenarioId);
        serviceReviewPathCache.set(env, path);
        return result;
      } catch (err) {
        if (
          err instanceof AvailityError &&
          err.statusCode >= 400 &&
          err.statusCode < 500 &&
          !firstClientError
        ) {
          firstClientError = err;
        }
        errors.push(
          `${env}${path}: ${err instanceof Error ? err.message : "request failed"}`
        );
        if (!safeToTryNext(err)) break outer;
        // Space fallback attempts so discovery never bursts the rate limit.
        await new Promise((r) => setTimeout(r, 220));
      }
    }
  }

  // Prefer a real 4xx (the API talking) over a generic transport failure.
  if (firstClientError) throw firstClientError;
  throw new AvailityError(`Availity service review failed — ${errors.join(" · ")}`, 502);
}

/**
 * Submit a prior authorization (278) as an Availity Service Review.
 * Availity accepts structured JSON and builds the X12 itself.
 *
 * In demo mode Availity ignores the body and returns a canned response, so we
 * send `{}` per their docs and pass the requested scenario id.
 */
export async function submitServiceReview(
  creds: AvailityCredentials,
  serviceReview: Record<string, unknown>,
  opts?: { scenarioId?: string }
): Promise<ServiceReviewResult> {
  const scenarioId = creds.demo
    ? (opts?.scenarioId ?? "SR-CreateRequestAccepted-i")
    : undefined;
  // Per Availity's demo-scenario docs: "For POST methods, send an empty JSON
  // body: {}". The mock scenario header decides the response, so the payload is
  // ignored in demo. (Earlier attempts at this failed only because we were
  // sending their documented — but invalid — "application.json" content type.)
  const body = creds.demo ? "{}" : JSON.stringify(serviceReview);
  return serviceReviewRequest(creds, { method: "POST", body }, scenarioId);
}

/**
 * Retrieve a service review by id to check whether the health plan has decided.
 * 200 = complete, 202 = still processing.
 */
export async function getServiceReview(
  creds: AvailityCredentials,
  id: string,
  opts?: { scenarioId?: string }
): Promise<ServiceReviewResult> {
  const scenarioId = creds.demo
    ? (opts?.scenarioId ?? "SR-GetComplete-i")
    : undefined;
  // Demo scenarios that return a body require the documented id 12345678.
  const effectiveId = creds.demo ? "12345678" : id;
  return serviceReviewRequest(
    creds,
    { method: "GET", idSuffix: `/${encodeURIComponent(effectiveId)}` },
    scenarioId
  );
}

export { PROD_BASE, TEST_BASE };
