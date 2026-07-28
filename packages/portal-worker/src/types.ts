/**
 * Shapes shared with the Pria API (see backend portal-adapter.types.ts and
 * portal-recipe.types.ts). Kept in sync manually for now; a shared package is
 * the eventual home.
 */

export interface PortalCredentials {
  username: string;
  password: string;
  totpSeed?: string;
}

export interface PortalSubmissionPayload {
  payerName: string;
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
  provider: { firstName?: string; lastName: string; npi: string; taxonomyCode?: string };
  /** Referring physician (usually the PCP) — the portal's "Requesting Provider". */
  referringProvider?: { firstName?: string; lastName?: string; npi?: string };
  practice: {
    name: string;
    npi: string;
    contactName?: string;
    phone?: string;
    fax?: string;
    address?: { street: string; city: string; state: string; zip: string };
  };
  serviceType?: { code?: string; label?: string };
  placeOfService?: { code?: string; label?: string };
  /** Portal urgency: "E" Elective or "U" Urgent (not the X12 UM06 code). */
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
  /** Local temp-file paths of downloaded attachments, set by the worker. */
  documentPaths?: string[];
  /** Portal attachment-type codes, parallel to documentPaths (X12 PWK01). */
  documentTypes?: string[];
  /** Human labels for those codes — Select2 widgets are driven by text. */
  documentTypeLabels?: string[];
  requestedVisits?: number;
  startDate?: string;
  endDate?: string;
  clinicalNotes?: string;
}

export type RecipeTransform = "dateMMDDYYYY" | "digits";

export type RecipeStep =
  | { action: "navigate"; url: string; note?: string }
  | { action: "useFrame"; urlIncludes?: string; timeoutMs?: number; note?: string }
  | { action: "waitFor"; selector: string; timeoutMs?: number; note?: string }
  | { action: "click"; selector: string; note?: string }
  | { action: "clickIfPresent"; selector: string; timeoutMs?: number; note?: string }
  | { action: "clickByText"; text?: string; binding?: string; within?: string; note?: string }
  | { action: "clickInRow"; selector: string; text?: string; binding?: string; note?: string }
  | { action: "type"; selector: string; value?: string; binding?: string; transform?: RecipeTransform; note?: string }
  | { action: "typeIfPresent"; selector: string; value?: string; binding?: string; transform?: RecipeTransform; timeoutMs?: number; note?: string }
  | { action: "typeActive"; value?: string; binding?: string; transform?: RecipeTransform; note?: string }
  | { action: "press"; key: string; note?: string }
  | { action: "wait"; ms: number; note?: string }
  | { action: "uploadFile"; selector: string; binding?: string; value?: string; note?: string }
  | { action: "select"; selector: string; value?: string; binding?: string; note?: string }
  | { action: "check"; selector: string; note?: string }
  | { action: "captureText"; selector: string; store: "confirmationNumber"; note?: string }
  | { action: "forEach"; list: string; startIndex?: number; steps: RecipeStep[]; note?: string }
  | { action: "pauseForHuman"; reason: string; note?: string }
  | { action: "submit"; selector: string; note?: string };

/** A parked hosted-browser session a human can take over. */
export interface TakeoverSession {
  sessionId: string;
  liveViewUrl: string | null;
}

export type PortalOutcome =
  | { kind: "submitted"; confirmationNumber: string | null }
  /** screenshot: base64 JPEG of the page at the moment of the pause/failure. */
  | { kind: "needs_mfa"; reason: string; screenshot?: string; takeover?: TakeoverSession }
  | { kind: "needs_human"; reason: string; screenshot?: string; takeover?: TakeoverSession }
  | { kind: "failed"; error: string; screenshot?: string };
