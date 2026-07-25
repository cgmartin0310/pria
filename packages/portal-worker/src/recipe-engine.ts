import type { Frame, Page } from "playwright-core";
import type { PortalOutcome, PortalSubmissionPayload, RecipeStep } from "./types.js";

/**
 * Hosts a recipe may navigate to, per portal — defense-in-depth mirror of the
 * backend's save-time validation. Recipes execute in an authenticated session
 * with PHI bound in, so navigation anywhere else is treated as exfiltration
 * and pauses for a human instead of executing.
 */
const PORTAL_ALLOWED_HOSTS: Record<string, string[]> = {
  availity_essentials: ["availity.com"],
};

function isAllowedUrl(portalKey: string, url: string): boolean {
  const hosts = PORTAL_ALLOWED_HOSTS[portalKey];
  if (!hosts || hosts.length === 0) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

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

function applyTransform(value: string, transform?: "dateMMDDYYYY" | "digits"): string {
  if (transform === "dateMMDDYYYY") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  }
  if (transform === "digits") return value.replace(/\D/g, "");
  return value;
}

function valueFor(
  step: { value?: string; binding?: string; transform?: "dateMMDDYYYY" | "digits" },
  payload: PortalSubmissionPayload
): string {
  const raw = step.binding ? resolveBinding(step.binding, payload) : (step.value ?? "");
  return applyTransform(raw, step.transform);
}

/**
 * Availity uses element ids containing dots (`search.requestingProvider.npi`),
 * which break `#id` CSS selectors (the dot reads as a class). Rewrite bare
 * `#id` selectors containing a dot to attribute form. Compound id+class
 * selectors must be written explicitly as `[id="x"].cls`.
 */
function fixSelector(selector: string): string {
  if (/^#[^\s>+~[\]():,]+$/.test(selector) && selector.includes(".")) {
    return `[id="${selector.slice(1)}"]`;
  }
  return selector;
}

/**
 * The element steps act on: the page itself, or — after a `useFrame` step — an
 * iframe within it (Availity apps render inside a clip-ui iframe).
 */
type Target = Page | Frame;

/** Wait for a frame whose URL contains the substring (frames can attach late). */
async function findFrame(page: Page, urlIncludes: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const frame = page
      .frames()
      .find((f) => f !== page.mainFrame() && f.url().includes(urlIncludes));
    if (frame) return frame;
    if (Date.now() > deadline) {
      throw new Error(`useFrame: no iframe with URL containing "${urlIncludes}"`);
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Among elements matching `selector`, click the one whose enclosing row
 * contains `text`. The "row" is found per candidate by walking up from the
 * element until the parent would contain more than one candidate — i.e. the
 * largest ancestor that is still unambiguously this candidate's own.
 */
async function clickInRow(target: Target, selector: string, text: string): Promise<void> {
  const needle = text.trim().toUpperCase();
  if (!needle) throw new Error("clickInRow: match text resolved to empty");
  const handles = await target.$$(selector);
  if (handles.length === 0) throw new Error(`clickInRow: no elements match ${selector}`);
  for (const handle of handles) {
    const matches = await handle.evaluate(
      (el, args) => {
        let node: Element = el;
        while (node.parentElement) {
          if (node.parentElement.querySelectorAll(args.selector).length > 1) break;
          node = node.parentElement;
        }
        return (node.textContent ?? "").toUpperCase().includes(args.needle);
      },
      { selector, needle }
    );
    if (matches) {
      await handle.click();
      return;
    }
  }
  throw new Error(
    `clickInRow: no row containing "${text}" among ${handles.length} candidates (${selector})`
  );
}

/** Best-effort JPEG snapshot so a paused submission shows WHAT the page looked like. */
export async function snap(page: Page): Promise<string | undefined> {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 50 });
    return buf.toString("base64");
  } catch {
    return undefined;
  }
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
  portalKey: string,
  steps: RecipeStep[],
  payload: PortalSubmissionPayload
): Promise<PortalOutcome> {
  let confirmationNumber: string | null = null;
  let target: Target = page;

  for (const step of steps) {
    try {
      switch (step.action) {
        case "navigate":
          if (!isAllowedUrl(portalKey, step.url)) {
            return {
              kind: "needs_human",
              reason: `Recipe navigate blocked (host not allowed for ${portalKey}): ${step.url}`,
            };
          }
          await page.goto(step.url, { waitUntil: "domcontentloaded" });
          // Navigation detaches frames — never leave target on a dead frame.
          target = page;
          break;
        case "useFrame":
          target = step.urlIncludes
            ? await findFrame(page, step.urlIncludes, step.timeoutMs ?? 15_000)
            : page;
          break;
        case "waitFor":
          await target.waitForSelector(fixSelector(step.selector), {
            timeout: step.timeoutMs ?? 15_000,
          });
          break;
        case "click":
          await target.click(fixSelector(step.selector));
          break;
        case "clickIfPresent": {
          const el = await target
            .waitForSelector(fixSelector(step.selector), {
              timeout: step.timeoutMs ?? 3_000,
            })
            .catch(() => null);
          if (el) await el.click();
          break;
        }
        case "clickByText": {
          const text = valueFor(step, payload) || step.text || "";
          if (!text) throw new Error("clickByText: no text or binding value");
          const scope = step.within ? target.locator(fixSelector(step.within)) : target;
          await scope.getByText(text, { exact: false }).first().click();
          break;
        }
        case "clickInRow":
          await clickInRow(
            target,
            fixSelector(step.selector),
            valueFor(step, payload) || step.text || ""
          );
          break;
        case "type":
          await target.fill(fixSelector(step.selector), valueFor(step, payload));
          break;
        case "typeActive":
          // Keyboard is page-level; it reaches the focused element in any frame.
          await page.keyboard.type(valueFor(step, payload), { delay: 30 });
          break;
        case "press":
          await page.keyboard.press(step.key);
          break;
        case "select":
          await target.selectOption(fixSelector(step.selector), valueFor(step, payload));
          break;
        case "check":
          await target.check(fixSelector(step.selector));
          break;
        case "captureText": {
          const text = (await target.textContent(fixSelector(step.selector)))?.trim() ?? null;
          if (step.store === "confirmationNumber") confirmationNumber = text;
          break;
        }
        case "pauseForHuman":
          return {
            kind: "needs_human",
            reason: step.reason,
            screenshot: await snap(page),
          };
        case "submit":
          await target.click(fixSelector(step.selector));
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
          screenshot: await snap(page),
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
