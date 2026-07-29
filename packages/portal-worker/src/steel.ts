import { config } from "./config.js";

/**
 * Steel hosted-browser sessions.
 *
 * Why: a run that pauses (MFA, a clinical questionnaire, an unexpected screen)
 * holds a browser that is most of the way through an auth. With a local
 * Chromium that context dies with the process and the human starts over. A
 * Steel session can be LEFT RUNNING and handed to a person through its live
 * view — they finish the last mile in the very session the agent prepared.
 *
 * PHI renders in these browsers, so this is only enabled when STEEL_API_KEY is
 * set (and it should only be set once a BAA with Steel is in place).
 */

export interface SteelSession {
  id: string;
  /** CDP websocket Playwright connects to. */
  websocketUrl: string;
  /** Human-facing live view (embeddable / openable in a tab). */
  liveViewUrl: string | null;
}

export function steelEnabled(): boolean {
  return !!config.steelApiKey;
}

async function steelFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.steelBaseUrl}${path}`, {
    ...init,
    headers: {
      "steel-api-key": config.steelApiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function postSession(ttlMinutes: number): Promise<Response> {
  return steelFetch("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({
      timeout: ttlMinutes * 60 * 1000,
      solveCaptcha: false,
    }),
  });
}

/** Start a session. Throws so callers can fall back to a local browser. */
export async function createSession(): Promise<SteelSession> {
  let res = await postSession(config.steelSessionTtlMinutes);

  // Steel caps session length per plan. Rather than fail the takeover outright,
  // take the cap it names in the 400 and retry once at that ceiling.
  if (res.status === 400) {
    const text = await res.text();
    const cap = text.match(/maximum for your plan \((\d+)\s*min/i)?.[1];
    if (cap) {
      console.warn(`[steel] plan caps sessions at ${cap} min, retrying at that`);
      res = await postSession(parseInt(cap, 10));
    } else {
      throw new Error(`Steel session create failed (400): ${text.slice(0, 300)}`);
    }
  }

  if (!res.ok) {
    throw new Error(
      `Steel session create failed (${res.status}): ${(await res.text()).slice(0, 300)}`
    );
  }
  const body = (await res.json()) as {
    id: string;
    websocketUrl?: string;
    debugUrl?: string;
    sessionViewerUrl?: string;
  };
  const websocketUrl =
    body.websocketUrl ??
    `wss://connect.steel.dev?apiKey=${config.steelApiKey}&sessionId=${body.id}`;
  return {
    id: body.id,
    websocketUrl,
    liveViewUrl: body.sessionViewerUrl ?? body.debugUrl ?? null,
  };
}

/** End a session (frees the browser and stops billing). Never throws. */
export async function releaseSession(sessionId: string): Promise<void> {
  try {
    await steelFetch(`/v1/sessions/${sessionId}/release`, { method: "POST" });
  } catch (err) {
    console.warn(
      `[steel] couldn't release session ${sessionId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
