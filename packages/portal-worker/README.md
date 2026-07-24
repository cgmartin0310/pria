# @pria/portal-worker

Agent fleet that submits prior auths to **portal-only** payers by replaying
learned recipes. Each worker pulls `portal-submit` jobs from Redis, logs into
the portal (resuming a warm session; answering authenticator-app MFA via the
stored TOTP seed), replays the portal's active **recipe**, and records the
outcome. Scale = run more workers; autoscale on the queue's waiting count.

## Status: scaffold

Runnable skeleton. The pieces marked **TODO** need the live portal:

- `src/adapters/availity-essentials.ts` — the login selectors (`SEL.*`) and
  `LOGIN_URL` are placeholders. Fill them against the real Essentials login.
- `src/recipe-engine.ts` — `agentFallback()` is stubbed to pause for a human;
  wire it to a BAA-covered LLM to recover from selector drift.
- The auth **recipe** itself is recorded in Pria (Settings → Portals) and stored
  in `portal_recipes`; the worker just replays the active one.

## Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Same Postgres as the Pria API |
| `REDIS_URL` | Same Redis the API enqueues on |
| `CREDENTIAL_ENCRYPTION_KEY` | **Must match the API's** — decrypts stored logins/sessions |
| `BROWSER_WS_ENDPOINT` | CDP/websocket of a Chromium (VM or hosted browser) |
| `WORKER_CONCURRENCY` | Auths per worker process (default 1) |
| `WORKER_ID` | Identifier recorded in `portal_submissions.claimed_by` |

`playwright-core` bundles **no** browser — point `BROWSER_WS_ENDPOINT` at one.

## Run

```
pnpm --filter @pria/portal-worker build && node dist/index.js
```

## Security note

The worker holds `CREDENTIAL_ENCRYPTION_KEY` to decrypt portal logins in memory
(needed to type them into the browser). Keep the fleet on trusted infra. A
future hardening is to have the API decrypt and hand credentials to the worker
over an authenticated internal channel, so the key never leaves the API.
