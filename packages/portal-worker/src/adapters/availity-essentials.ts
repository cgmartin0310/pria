import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { config } from "../config.js";
import { totp, totpSecondsRemaining } from "../totp.js";
import { runRecipe, snap } from "../recipe-engine.js";
import type {
  PortalCredentials,
  PortalOutcome,
  PortalSubmissionPayload,
  RecipeStep,
} from "../types.js";

export interface SubmitInput {
  credentials: PortalCredentials;
  /** Prior browser storage-state (cookies) to resume a warm session. */
  sessionState?: string;
  recipeSteps: RecipeStep[];
  payload: PortalSubmissionPayload;
  /** Persist a refreshed session (encrypted upstream) for reuse. */
  onSession: (storageStateJson: string) => Promise<void>;
}

// ─── Availity Essentials selectors ──────────────────────────────────────────
// Captured from the LIVE portal 2026-07-24 (DevTools extraction session).
const LOGIN_URL =
  "https://essentials.availity.com/static/public/onb/onboarding-ui-apps/availity-fr-ui/#/login";
const SEL = {
  /** Top-nav logout button — present on every authenticated page. */
  loggedInMarker: "#logout-link",
  username: "#userId",
  password: "#password",
  /** The login form's only submit button ("Sign In"). */
  loginButton: 'button[type="submit"]',
  // 2-Step Authentication (captured incognito 2026-07-25). Fresh sessions see
  // a method-picker (radios name="choice": authenticator app / SMS / backup
  // code) → Continue → a code screen (#code) → Continue.
  mfaMethodRadios: 'input[name="choice"]',
  /** Label text of the authenticator-app radio — clicked by text, not position. */
  mfaAuthenticatorLabel: "Authenticator app",
  mfaCodeInput: "#code",
  /** Both MFA screens share a single submit button ("Continue"). */
  mfaSubmit: 'button[type="submit"]',
};

async function connectBrowser(): Promise<Browser> {
  if (config.browserWsEndpoint) {
    // Remote Chromium (hosted browser / separate VM) over CDP — e.g. Steel.
    return chromium.connectOverCDP(config.browserWsEndpoint);
  }
  // Default deploy: Chromium bundled in this container by the Playwright base
  // image (tag pinned to the playwright-core version so resolution works).
  return chromium.launch({ headless: true });
}

/** Is the current context already authenticated on Essentials? */
async function isLoggedIn(ctx: BrowserContext): Promise<boolean> {
  const page = await ctx.newPage();
  try {
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    if (SEL.loggedInMarker === "TODO") return false; // not wired yet
    return (await page.$(SEL.loggedInMarker)) !== null;
  } finally {
    await page.close();
  }
}

/**
 * Log in, handling authenticator-app MFA via the stored TOTP seed. Returns:
 *  - null on success (session is now warm)
 *  - a PortalOutcome (needs_mfa / needs_human) when a human is required
 */
async function login(
  ctx: BrowserContext,
  creds: PortalCredentials
): Promise<PortalOutcome | null> {
  if (SEL.username === "TODO") {
    // Selectors not yet recorded — pause rather than pretend.
    return { kind: "needs_human", reason: "Availity login flow not yet configured (record it)" };
  }

  const page = await ctx.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.fill(SEL.username, creds.username);
  await page.fill(SEL.password, creds.password);
  await page.click(SEL.loginButton);

  // Three possible next screens: already signed in (trusted session),
  // the 2-Step method picker, or the code screen directly.
  const landed = await page
    .waitForSelector(
      `${SEL.loggedInMarker}, ${SEL.mfaCodeInput}, ${SEL.mfaMethodRadios}`,
      { timeout: 30_000 }
    )
    .catch(() => null);
  if (!landed) {
    return {
      kind: "needs_human",
      reason: "Login did not reach a recognized screen (bad credentials? new flow?)",
      screenshot: await snap(page),
    };
  }

  // Method picker → choose the authenticator app, by label text.
  if (!(await page.$(SEL.loggedInMarker)) && (await page.$(SEL.mfaMethodRadios))) {
    if (!creds.totpSeed) {
      return {
        kind: "needs_mfa",
        reason: "MFA required and no authenticator seed is stored",
        screenshot: await snap(page),
      };
    }
    await page.getByText(SEL.mfaAuthenticatorLabel, { exact: false }).first().click();
    await page.click(SEL.mfaSubmit);
  }

  // Code screen → generate and enter the TOTP.
  if (!(await page.$(SEL.loggedInMarker))) {
    const codeInput = await page
      .waitForSelector(SEL.mfaCodeInput, { timeout: 15_000 })
      .catch(() => null);
    if (codeInput) {
      if (!creds.totpSeed) {
        return {
          kind: "needs_mfa",
          reason: "MFA required and no authenticator seed is stored",
          screenshot: await snap(page),
        };
      }
      // A code about to expire could be rejected mid-submit — wait out the
      // last seconds of the window and use a fresh one.
      if (totpSecondsRemaining() < 5) {
        await page.waitForTimeout((totpSecondsRemaining() + 1) * 1000);
      }
      await page.fill(SEL.mfaCodeInput, totp(creds.totpSeed));
      await page.click(SEL.mfaSubmit);
    }
  }

  try {
    await page.waitForSelector(SEL.loggedInMarker, { timeout: 30_000 });
  } catch {
    return {
      kind: "needs_human",
      reason:
        "Login did not reach the signed-in state after MFA (code rejected? seed out of sync?)",
      screenshot: await snap(page),
    };
  }
  return null;
}

/**
 * Full submission: connect a browser, resume/establish an authenticated
 * session, then replay the recipe to file the auth.
 */
export async function submit(input: SubmitInput): Promise<PortalOutcome> {
  const browser = await connectBrowser();
  try {
    const ctx = await browser.newContext(
      input.sessionState ? { storageState: JSON.parse(input.sessionState) } : {}
    );

    if (!(await isLoggedIn(ctx))) {
      const loginResult = await login(ctx, input.credentials);
      if (loginResult) return loginResult; // needs_mfa / needs_human
      // Persist the fresh session so future jobs skip login (and MFA).
      await input.onSession(JSON.stringify(await ctx.storageState()));
    }

    const page = await ctx.newPage();
    const outcome = await runRecipe(
      page,
      "availity_essentials",
      input.recipeSteps,
      input.payload
    );

    // Refresh the persisted session after a successful run.
    if (outcome.kind === "submitted") {
      await input.onSession(JSON.stringify(await ctx.storageState()));
    }
    return outcome;
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close();
  }
}
