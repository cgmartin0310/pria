/**
 * Claim.MD clearinghouse adapter.
 *
 * Talks to the Claim.MD HTTP API (https://svc.claim.md/services/) using a
 * practice-supplied AccountKey. Only three endpoints are needed here:
 *   POST /services/payerlist/  — the payer directory (drives available payers)
 *   POST /services/upload/     — submit an X12 file (our generated 278)
 *   POST /services/response/   — poll for payer responses
 *
 * Docs: https://api.claim.md/  ·  Auth: AccountKey (Settings → Account Settings)
 * Rate limit: 100 requests/minute. All endpoints support JSON via Accept header.
 *
 * NOTE: Claim.MD's payer list does NOT expose a per-payer 278 flag, so 278
 * capability is assumed on sync and can be overridden by an admin.
 */

const BASE_URL = "https://svc.claim.md/services";
const TIMEOUT_MS = 15_000;

export interface ClaimMdPayer {
  payerid: string;
  payer_name: string;
  /** Raw capability flags (professional/institutional claims, eligibility, era…). */
  capabilities: Record<string, string>;
}

export interface ClaimMdUploadResult {
  ok: boolean;
  /** Best-effort submission identifier extracted from the response. */
  submissionId: string | null;
  /** Any human-readable messages returned by Claim.MD. */
  messages: string[];
  raw: unknown;
}

export class ClaimMdError extends Error {
  constructor(
    message: string,
    public statusCode = 502
  ) {
    super(message);
    this.name = "ClaimMdError";
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ClaimMdError("Claim.MD request timed out", 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(
  path: string,
  fields: Record<string, string>
): Promise<unknown> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(fields).toString(),
      signal,
    });
    if (!res.ok) {
      throw new ClaimMdError(`Claim.MD ${path} returned ${res.status}`, 502);
    }
    return res.json();
  });
}

// ─── Capability extraction ──────────────────────────────────────────────────

const CAPABILITY_KEYS = [
  "1500_claims",
  "ub_claims",
  "dent_claims",
  "eligibility",
  "era",
  "attachment",
  "workers_comp",
  "secondary_support",
  "payer_type",
  "payer_state",
] as const;

function toPayer(row: Record<string, unknown>): ClaimMdPayer | null {
  const payerid = typeof row["payerid"] === "string" ? row["payerid"] : null;
  const payer_name =
    typeof row["payer_name"] === "string" ? row["payer_name"] : null;
  if (!payerid || !payer_name) return null;

  const capabilities: Record<string, string> = {};
  for (const key of CAPABILITY_KEYS) {
    const val = row[key];
    if (typeof val === "string" && val) capabilities[key] = val;
  }
  return { payerid, payer_name, capabilities };
}

/** Pull the payer array out of Claim.MD's response regardless of wrapper shape. */
function extractRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["results", "payer", "payers", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the Claim.MD payer directory. Optionally narrow with a name/id search.
 */
export async function fetchPayerList(
  accountKey: string,
  search?: string
): Promise<ClaimMdPayer[]> {
  const fields: Record<string, string> = { AccountKey: accountKey };
  if (search) fields["payer_name"] = search;
  const json = await postForm("/payerlist/", fields);
  return extractRows(json)
    .map(toPayer)
    .filter((p): p is ClaimMdPayer => p !== null);
}

/**
 * Validate an AccountKey by making a cheap payer-list call.
 * Returns true if the key is accepted.
 */
export async function testConnection(accountKey: string): Promise<boolean> {
  try {
    await postForm("/payerlist/", { AccountKey: accountKey, payer_name: "aetna" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a raw X12 EDI document (our generated 278) to Claim.MD.
 */
export async function uploadEdi(
  accountKey: string,
  ediContent: string,
  filename: string
): Promise<ClaimMdUploadResult> {
  return withTimeout(async (signal) => {
    const form = new FormData();
    form.append("AccountKey", accountKey);
    form.append("Filename", filename);
    form.append("File", new Blob([ediContent], { type: "application/edi-x12" }), filename);

    const res = await fetch(`${BASE_URL}/upload/`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      signal,
    });
    const raw: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      throw new ClaimMdError(`Claim.MD upload returned ${res.status}`, 502);
    }

    // Extract a submission id + any messages, defensively across shapes.
    let submissionId: string | null = null;
    const messages: string[] = [];
    const scan = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      for (const idKey of ["fileid", "claimid", "batchid", "claimmd_id"]) {
        if (!submissionId && typeof obj[idKey] === "string") {
          submissionId = obj[idKey] as string;
        }
      }
      if (typeof obj["message"] === "string") messages.push(obj["message"] as string);
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) v.forEach(scan);
        else if (v && typeof v === "object") scan(v);
      }
    };
    scan(raw);

    return { ok: true, submissionId, messages, raw };
  });
}

/**
 * Poll Claim.MD for responses newer than `sinceResponseId` ("0" for the first).
 */
export async function fetchResponses(
  accountKey: string,
  sinceResponseId = "0"
): Promise<{ lastResponseId: string | null; raw: unknown }> {
  const json = await postForm("/response/", {
    AccountKey: accountKey,
    ResponseID: sinceResponseId,
  });
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const lastResponseId =
    typeof obj["last_responseid"] === "string"
      ? (obj["last_responseid"] as string)
      : null;
  return { lastResponseId, raw: json };
}
