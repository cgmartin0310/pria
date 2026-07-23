/**
 * Contract between Pria and a Portal Worker (the OpenClaw/agent fleet).
 *
 * The backend enqueues PortalSubmitJobData; a worker pulls it, drives a browser
 * against the portal, and reports back by updating the portal_submissions row.
 * This file is the shared shape both sides code against, so the worker (a
 * separate service) can be built independently and swapped.
 */

/** Queue payload — intentionally minimal; the worker loads details by id. */
export interface PortalSubmitJobData {
  portalSubmissionId: string;
  practiceId: string;
}

/** Credentials handed to an adapter after decryption (never persisted plain). */
export interface PortalCredentials {
  username: string;
  password: string;
  /** Base32 TOTP seed, when the portal uses an authenticator-app second factor. */
  totpSeed?: string;
}

/**
 * The structured values an agent enters into the portal's auth form. Produced
 * from the assembled 278 request, so it mirrors what a 278 carries.
 */
export interface PortalSubmissionPayload {
  payerName: string;
  /** Portal-specific payer selection (name/id as the portal knows it). */
  payerId?: string;
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    memberId: string;
    gender?: string;
  };
  provider: {
    firstName?: string;
    lastName: string;
    npi: string;
    taxonomyCode?: string;
  };
  practice: {
    name: string;
    npi: string;
    phone?: string;
  };
  diagnoses: string[];
  cptCodes: string[];
  requestedVisits?: number;
  startDate?: string;
  endDate?: string;
  clinicalNotes?: string;
}

/** Terminal + paused outcomes an adapter can report. */
export type PortalOutcome =
  | { kind: "submitted"; confirmationNumber: string | null }
  | { kind: "needs_mfa"; reason: string }
  | { kind: "needs_human"; reason: string }
  | { kind: "failed"; error: string };

/**
 * What a Portal Worker implements per portal. Session handling is the adapter's
 * job: hydrate from encryptedSession if present, log in (using TOTP when
 * available) otherwise, and persist the refreshed session back.
 */
export interface PortalAdapter {
  readonly portalKey: string;
  submit(input: {
    credentials: PortalCredentials;
    /** Prior browser storage-state (cookies) to resume a warm session, if any. */
    sessionState?: string;
    payload: PortalSubmissionPayload;
    /** Called with a fresh session to persist (encrypted) for reuse. */
    onSession?: (sessionState: string, validUntil?: Date) => Promise<void>;
  }): Promise<PortalOutcome>;
}
