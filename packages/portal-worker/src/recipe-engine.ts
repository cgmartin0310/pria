import type { Page } from "playwright-core";
import type { PortalOutcome, PortalSubmissionPayload, RecipeStep } from "./types.js";

/** Resolve a value binding like "patient.memberId" or "diagnoses.0" from the payload. */
function resolveBinding(binding: string, payload: PortalSubmissionPayload): string {
  let cur: unknown = payload;
  for (const key of binding.split(".")) {
    if (cur == null) return "";
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  if (cur == null) return "";
  return String(cur);
}

function valueFor(
  step: { value?: string; binding?: string },
  payload: PortalSubmissionPayload
): string {
  if (step.binding) return resolveBinding(step.binding, payload);
  return step.value ?? "";
}

/**
 * Execute a learned recipe against an already-authenticated page.
 *
 * This is deterministic replay — the fast, cheap path. When a step's selector
 * no longer matches (portal redesign), we DON'T crash: we hand off to the agent
 * fallback (stubbed below) and, failing that, pause for a human.
 */
export async function runRecipe(
  page: Page,
  steps: RecipeStep[],
  payload: PortalSubmissionPayload
): Promise<PortalOutcome> {
  let confirmationNumber: string | null = null;

  for (const step of steps) {
    try {
      switch (step.action) {
        case "navigate":
          await page.goto(step.url, { waitUntil: "domcontentloaded" });
          break;
        case "waitFor":
          await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 15_000 });
          break;
        case "click":
          await page.click(step.selector);
          break;
        case "type":
          await page.fill(step.selector, valueFor(step, payload));
          break;
        case "select":
          await page.selectOption(step.selector, valueFor(step, payload));
          break;
        case "check":
          await page.check(step.selector);
          break;
        case "captureText": {
          const text = (await page.textContent(step.selector))?.trim() ?? null;
          if (step.store === "confirmationNumber") confirmationNumber = text;
          break;
        }
        case "pauseForHuman":
          return { kind: "needs_human", reason: step.reason };
        case "submit":
          await page.click(step.selector);
          break;
      }
    } catch (err) {
      const recovered = await agentFallback(page, step, payload, err);
      if (!recovered) {
        return {
          kind: "needs_human",
          reason:
            `Step '${step.action}' failed (selector may have changed): ` +
            (err instanceof Error ? err.message : String(err)),
        };
      }
    }
  }

  return { kind: "submitted", confirmationNumber };
}

/**
 * TODO: agent fallback. When a deterministic step fails, snapshot the page's
 * accessibility tree and ask an LLM (Anthropic, BAA-covered) to locate the
 * element matching this step's intent, perform it, and propose an updated
 * recipe step. Until implemented, we return false → the submission pauses for a
 * human, which is the safe behaviour.
 */
async function agentFallback(
  _page: Page,
  _step: RecipeStep,
  _payload: PortalSubmissionPayload,
  _err: unknown
): Promise<boolean> {
  return false;
}
