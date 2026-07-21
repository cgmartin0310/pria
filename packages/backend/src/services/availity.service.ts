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
const TIMEOUT_MS = 15_000;

function baseFor(demo?: boolean): string {
  return demo ? TEST_BASE : PROD_BASE;
}

export interface AvailityCredentials {
  clientId: string;
  clientSecret: string;
  /** Optional OAuth scope(s), space-separated. */
  scope?: string;
  /** When true, API calls request Availity's canned demo responses. */
  demo?: boolean;
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
export async function getToken(creds: AvailityCredentials): Promise<string> {
  const body: Record<string, string> = {
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  };
  if (creds.scope) body["scope"] = creds.scope;

  const tokenUrl = `${baseFor(creds.demo)}${TOKEN_PATH}`;

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
