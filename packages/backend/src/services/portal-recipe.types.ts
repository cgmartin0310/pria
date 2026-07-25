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

/**
 * Value transforms applied after binding resolution, before typing.
 * dateMMDDYYYY: "2026-07-24" → "07/24/2026" (portals rarely take ISO dates).
 * digits: strip non-digits — for masked phone/fax inputs that self-format.
 */
export type RecipeTransform = "dateMMDDYYYY" | "digits";

/**
 * Selector note: bare `#id` selectors containing dots (Availity uses ids like
 * `search.requestingProvider.npi`) are auto-rewritten by the replay engine to
 * `[id="..."]` attribute form. Write compound id+class selectors as
 * `[id="x"].cls` explicitly if ever needed.
 */
export type RecipeStep =
  | { action: "navigate"; url: string; note?: string }
  | {
      /**
       * Target subsequent steps at the iframe whose URL contains `urlIncludes`
       * (Availity apps render inside a clip-ui iframe). Omit to return to the
       * top-level page. Waits up to timeoutMs for the frame to appear.
       */
      action: "useFrame";
      urlIncludes?: string;
      timeoutMs?: number;
      note?: string;
    }
  | { action: "waitFor"; selector: string; timeoutMs?: number; note?: string }
  | { action: "click"; selector: string; note?: string }
  | {
      /**
       * Click if the selector appears within timeoutMs; continue silently if it
       * doesn't. For conditional interstitials (e.g. Anthem ICR routing page).
       */
      action: "clickIfPresent";
      selector: string;
      timeoutMs?: number;
      note?: string;
    }
  | {
      /**
       * Click the first visible element containing the text (literal or bound).
       * The way to drive Select2 dropdowns, whose generated ids are unstable:
       * click the closed control (by its stable container/text), then
       * clickByText the option.
       */
      action: "clickByText";
      text?: string;
      binding?: RecipeBinding;
      /** Optional selector to scope the text search. */
      within?: string;
      note?: string;
    }
  | {
      /**
       * Among elements matching `selector`, click the one whose enclosing row
       * contains the text (e.g. pick the practice location out of a
       * multi-address NPI result list by street address). Fails — pausing for a
       * human — if no row matches.
       */
      action: "clickInRow";
      selector: string;
      text?: string;
      binding?: RecipeBinding;
      note?: string;
    }
  | {
      action: "type";
      selector: string;
      /** Literal text, or a binding to a payload value (one of the two). */
      value?: string;
      binding?: RecipeBinding;
      transform?: RecipeTransform;
      note?: string;
    }
  | {
      /**
       * Type into whatever element currently has focus — for inputs whose ids
       * are generated per-render (Select2 search boxes).
       */
      action: "typeActive";
      value?: string;
      binding?: RecipeBinding;
      transform?: RecipeTransform;
      note?: string;
    }
  | {
      /** Press a keyboard key (e.g. "Enter", "Tab", "Escape"). */
      action: "press";
      key: string;
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
