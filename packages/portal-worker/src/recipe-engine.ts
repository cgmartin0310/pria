import type { Frame, Page } from "playwright-core";
import type { PortalOutcome, PortalSubmissionPayload, RecipeStep, RecipeTransform } from "./types.js";

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

/** Resolve a dotted path like "patient.memberId" or "diagnoses.0" from the payload. */
function resolvePath(path: string, payload: PortalSubmissionPayload): unknown {
  let cur: unknown = payload;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function applyTransform(value: string, transform?: RecipeTransform): string {
  if (transform === "dateMMDDYYYY") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  }
  if (transform === "digits") return value.replace(/\D/g, "");
  return value;
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

/**
 * Select an option by exact value, then exact label, then normalized
 * contains-match on the label (case/punctuation-insensitive). Portal selects
 * use private option values Pria can't know ("602" for Healthy Blue), and
 * labels drift on punctuation ("Kidology Inc" vs "Kidology, Inc") — the
 * chain lets recipes bind human-known names. force: Select2-style widgets
 * hide the real <select>; the change event still updates their UI.
 */
async function selectWithFallback(target: Target, selector: string, value: string): Promise<void> {
  if (!value) throw new Error("select: value resolved to empty");
  try {
    await target.selectOption(selector, value, { force: true });
    return;
  } catch {
    /* fall through to label matching */
  }
  try {
    await target.selectOption(selector, { label: value }, { force: true });
    return;
  } catch {
    /* fall through to normalized matching */
  }
  const el = await target.$(selector);
  if (!el) throw new Error(`select: no element matches ${selector}`);
  const matched = await el.evaluate((node, wanted) => {
    const sel = node as HTMLSelectElement;
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const w = norm(wanted);
    if (!w) return false;
    for (const opt of Array.from(sel.options)) {
      const o = norm(opt.text);
      if (o && (o.includes(w) || w.includes(o))) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, value);
  if (!matched) {
    throw new Error(`select: no option matching "${value}" in ${selector}`);
  }
}

/** Best-effort JPEG snapshot so a paused submission shows WHAT the page looked like. */
export async function snap(page: Page): Promise<string | undefined> {
  try {
    // Bounded: a page stuck mid-navigation must not hang or void the capture.
    const buf = await page.screenshot({ type: "jpeg", quality: 50, timeout: 10_000 });
    return buf.toString("base64");
  } catch (err) {
    console.warn(
      `[snap] screenshot failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

/** Mutable replay state threaded through nested step execution. */
interface ReplayState {
  target: Target;
  confirmationNumber: string | null;
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
  const state: ReplayState = { target: page, confirmationNumber: null };
  const outcome = await execSteps(page, portalKey, steps, payload, state, undefined);
  return outcome ?? { kind: "submitted", confirmationNumber: state.confirmationNumber };
}

/** Runs steps in order; returns a terminal outcome, or null to keep going. */
async function execSteps(
  page: Page,
  portalKey: string,
  steps: RecipeStep[],
  payload: PortalSubmissionPayload,
  state: ReplayState,
  idx: number | undefined
): Promise<PortalOutcome | null> {
  // Inside a forEach, "{i}" in selectors and bindings becomes the index.
  const sub = (s: string): string => (idx === undefined ? s : s.replaceAll("{i}", String(idx)));
  const valueFor = (step: { value?: string; binding?: string; transform?: RecipeTransform }): string => {
    const raw = step.binding
      ? String(resolvePath(sub(step.binding), payload) ?? "")
      : (step.value ?? "");
    return applyTransform(raw, step.transform);
  };

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
          state.target = page;
          break;
        case "useFrame":
          state.target = step.urlIncludes
            ? await findFrame(page, step.urlIncludes, step.timeoutMs ?? 15_000)
            : page;
          break;
        case "waitFor":
          await state.target.waitForSelector(fixSelector(sub(step.selector)), {
            timeout: step.timeoutMs ?? 15_000,
          });
          break;
        case "click":
          await state.target.click(fixSelector(sub(step.selector)));
          break;
        case "clickIfPresent": {
          const el = await state.target
            .waitForSelector(fixSelector(sub(step.selector)), {
              timeout: step.timeoutMs ?? 3_000,
            })
            .catch(() => null);
          if (el) await el.click();
          break;
        }
        case "clickByText": {
          const text = valueFor(step) || step.text || "";
          if (!text) throw new Error("clickByText: no text or binding value");
          const scope = step.within
            ? state.target.locator(fixSelector(sub(step.within)))
            : state.target;
          await scope.getByText(sub(text), { exact: false }).first().click();
          break;
        }
        case "clickInRow":
          await clickInRow(
            state.target,
            fixSelector(sub(step.selector)),
            valueFor(step) || step.text || ""
          );
          break;
        case "type":
          await state.target.fill(fixSelector(sub(step.selector)), valueFor(step));
          break;
        case "typeIfPresent": {
          const el = await state.target
            .waitForSelector(fixSelector(sub(step.selector)), {
              timeout: step.timeoutMs ?? 4_000,
            })
            .catch(() => null);
          if (el) {
            await state.target.fill(fixSelector(sub(step.selector)), valueFor(step));
          }
          break;
        }
        case "typeActive":
          // Keyboard is page-level; it reaches the focused element in any frame.
          await page.keyboard.type(valueFor(step), { delay: 30 });
          break;
        case "press":
          await page.keyboard.press(step.key);
          break;
        case "wait":
          await page.waitForTimeout(step.ms);
          break;
        case "select": {
          const value = valueFor(step);
          // A BOUND select with an empty payload value is an optional field
          // (e.g. gender the portal prefills from eligibility) — skip it.
          // A literal empty value is a recipe bug and still throws.
          if (!value && step.binding) break;
          await selectWithFallback(state.target, fixSelector(sub(step.selector)), value);
          break;
        }
        case "check":
          await state.target.check(fixSelector(sub(step.selector)));
          break;
        case "captureText": {
          const text =
            (await state.target.textContent(fixSelector(sub(step.selector))))?.trim() ?? null;
          if (step.store === "confirmationNumber") state.confirmationNumber = text;
          break;
        }
        case "forEach": {
          const list = resolvePath(sub(step.list), payload);
          const length = Array.isArray(list) ? list.length : 0;
          for (let i = step.startIndex ?? 0; i < length; i++) {
            const outcome = await execSteps(page, portalKey, step.steps, payload, state, i);
            if (outcome) return outcome;
          }
          break;
        }
        case "pauseForHuman":
          return {
            kind: "needs_human",
            reason: step.reason,
            screenshot: await snap(page),
          };
        case "submit":
          await state.target.click(fixSelector(sub(step.selector)));
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

  return null;
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
