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
    /** X12 relationship code: 18=Self, 01=Spouse, 19=Child, G8=Other. */
    relationshipCode?: string;
  };
  provider: {
    firstName?: string;
    lastName: string;
    npi: string;
    taxonomyCode?: string;
  };
  /** Referring physician (usually the PCP) — the portal's "Requesting Provider". */
  referringProvider?: {
    firstName?: string;
    lastName?: string;
    npi?: string;
  };
  practice: {
    name: string;
    npi: string;
    /** Contact person for portal forms that require one (falls back to name). */
    contactName?: string;
    phone?: string;
    /** Secure fax — payers send decision letters here when portals ask for it. */
    fax?: string;
    /**
     * Street line used to disambiguate multi-location NPI search results in
     * portals (e.g. Availity's provider-search rows differ only by address).
     */
    address?: { street: string; city: string; state: string; zip: string };
  };
  /**
   * Service discipline for portal dropdowns. `code` is the PORTAL's code
   * (Availity: PT/AD/AF — note PT, not X12's AE, for physical therapy);
   * `label` is the display text ("Physical Therapy") for text-driven selects.
   */
  serviceType?: { code?: string; label?: string };
  /** CMS POS — 11 "Office" or 12 "Home" for therapy practices. */
  placeOfService?: { code?: string; label?: string };
  /**
   * Portal urgency: "E" Elective or "U" Urgent. NOT the X12 UM06 code — the
   * portal's E means Elective while X12's E means Emergency; translated in
   * buildPayload.
   */
  serviceLevelCode?: "E" | "U";
  diagnoses: string[];
  cptCodes: string[];
  /**
   * Per-procedure entry for portal forms.
   *  units      — units per visit (PT/OT timed 15-min units, 60-min → 4;
   *               speech untimed → 1)
   *  totalUnits — units for the WHOLE auth period (visits × units/visit).
   *               Payers ask for this one: 1x/week for 6 months = 104.
   */
  procedures?: { code: string; units: number; totalUnits: number }[];
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
