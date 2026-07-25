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
  practice: { name: string; npi: string; phone?: string };
  diagnoses: string[];
  cptCodes: string[];
  requestedVisits?: number;
  startDate?: string;
  endDate?: string;
  clinicalNotes?: string;
}

export type RecipeStep =
  | { action: "navigate"; url: string; note?: string }
  | { action: "waitFor"; selector: string; timeoutMs?: number; note?: string }
  | { action: "click"; selector: string; note?: string }
  | { action: "type"; selector: string; value?: string; binding?: string; note?: string }
  | { action: "select"; selector: string; value?: string; binding?: string; note?: string }
  | { action: "check"; selector: string; note?: string }
  | { action: "captureText"; selector: string; store: "confirmationNumber"; note?: string }
  | { action: "pauseForHuman"; reason: string; note?: string }
  | { action: "submit"; selector: string; note?: string };

export type PortalOutcome =
  | { kind: "submitted"; confirmationNumber: string | null }
  /** screenshot: base64 JPEG of the page at the moment of the pause/failure. */
  | { kind: "needs_mfa"; reason: string; screenshot?: string }
  | { kind: "needs_human"; reason: string; screenshot?: string }
  | { kind: "failed"; error: string; screenshot?: string };
