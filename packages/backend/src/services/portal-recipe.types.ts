/**
 * A portal "recipe" — the learned, replayable steps for driving one portal's
 * prior-auth workflow. Produced by recording a human demonstration once, then
 * replayed by the Portal Worker for every submission.
 *
 * Recipes are GLOBAL (per portal, not per practice): learn Availity Essentials
 * once and every clinic benefits. Credentials/sessions stay per-practice.
 *
 * The format is intentionally simple and browser-oriented. The worker's replay
 * engine executes these deterministically and falls back to the agent when a
 * step's selector no longer matches (portal redesign) — and the agent's
 * recovery can be captured as an updated recipe.
 */

/**
 * A binding resolves a value from the submission payload at replay time, using
 * a dotted path, e.g. "patient.memberId", "provider.npi", "diagnoses.0".
 */
export type RecipeBinding = string;

export type RecipeStep =
  | { action: "navigate"; url: string; note?: string }
  | { action: "waitFor"; selector: string; timeoutMs?: number; note?: string }
  | { action: "click"; selector: string; note?: string }
  | {
      action: "type";
      selector: string;
      /** Literal text, or a binding to a payload value (one of the two). */
      value?: string;
      binding?: RecipeBinding;
      note?: string;
    }
  | {
      action: "select";
      selector: string;
      value?: string;
      binding?: RecipeBinding;
      note?: string;
    }
  | { action: "check"; selector: string; note?: string }
  | {
      /** Capture text (e.g. the confirmation number) into the submission. */
      action: "captureText";
      selector: string;
      store: "confirmationNumber";
      note?: string;
    }
  | {
      /** Pause and hand off to a human (e.g. final review, or an MFA screen). */
      action: "pauseForHuman";
      reason: string;
      note?: string;
    }
  | { action: "submit"; selector: string; note?: string };

export interface PortalRecipe {
  portalKey: string;
  name: string;
  version: number;
  steps: RecipeStep[];
}

/**
 * Hosts a recipe's `navigate` steps may target, per portal. Recipes execute in
 * an authenticated browser with live PHI bound into their steps, so navigation
 * anywhere else is an exfiltration vector — validated at save AND at replay.
 * A hostname matches if it equals an entry or is a subdomain of one.
 */
export const PORTAL_ALLOWED_HOSTS: Record<string, string[]> = {
  availity_essentials: ["availity.com"],
};

/** True when `url` is https and its host is allowed for this portal. */
export function isAllowedRecipeUrl(portalKey: string, url: string): boolean {
  const hosts = PORTAL_ALLOWED_HOSTS[portalKey];
  if (!hosts || hosts.length === 0) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return hosts.some(
      (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}
