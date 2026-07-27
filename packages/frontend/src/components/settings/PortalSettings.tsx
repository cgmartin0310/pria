import { useState, useEffect, useCallback } from "react";
import { Check, X, RefreshCw, Globe, ShieldCheck, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAuth } from "@/hooks/useAuth.js";
import {
  portalApi,
  payersApi,
  type PortalConnection,
  type PortalRecipeSummary,
} from "@/lib/api.js";

function formatDate(d: string | null): string {
  if (!d) return "never";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function ConnectedPortal({
  conn,
  isAdmin,
  onChanged,
}: {
  conn: PortalConnection;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [totp, setTotp] = useState<{ code: string; secondsRemaining: number } | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await portalApi.disconnect(conn.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleCheckTotp = async () => {
    setTotpError(null);
    setTotp(null);
    try {
      const res = await portalApi.totpCheck(conn.id);
      setTotp(res.data);
    } catch (e) {
      setTotpError((e as { message?: string })?.message ?? "Couldn't generate code");
    }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400">Username</p>
          <p className="font-mono text-slate-700">{conn.usernameMasked ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Authenticator (MFA)</p>
          <p className="text-slate-700">
            {conn.hasTotp ? (
              <span className="inline-flex items-center gap-1 text-green-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Seed stored
              </span>
            ) : (
              <span className="text-amber-600">No seed — logins need a human</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Warm session</p>
          <p className="text-slate-700">
            {conn.hasSession ? formatDate(conn.sessionValidUntil) : "none yet"}
          </p>
        </div>
      </div>

      {/* Verify the stored TOTP matches the authenticator app */}
      {conn.hasTotp && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Confirm the stored seed matches your authenticator app.
            </p>
            <Button variant="outline" size="sm" onClick={handleCheckTotp}>
              <KeyRound className="h-3.5 w-3.5" />
              Check MFA code
            </Button>
          </div>
          {totp && (
            <p className="mt-2 text-sm text-slate-800">
              Current code:{" "}
              <span className="font-mono text-lg font-semibold tracking-widest">
                {totp.code}
              </span>{" "}
              <span className="text-xs text-slate-400">
                (rolls over in {totp.secondsRemaining}s — should match your app)
              </span>
            </p>
          )}
          {totpError && <p className="mt-2 text-sm text-amber-600">{totpError}</p>}
        </div>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Credentials are stored encrypted. Automated submission runs once the
        Portal Worker is deployed — this screen sets up the login it will use.
      </div>

      {isAdmin && (
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={busy}
            className="text-red-600 hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
      )}
    </>
  );
}

function ConnectForm({
  isAdmin,
  onChanged,
}: {
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSeed, setTotpSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!username.trim() || !password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await portalApi.connect({
        portalKey: "availity_essentials",
        username: username.trim(),
        password,
        totpSeed: totpSeed.trim() || undefined,
      });
      setUsername("");
      setPassword("");
      setTotpSeed("");
      onChanged();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't save the login.");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <p className="text-xs text-slate-400">
        Only practice admins can connect a portal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Store your Availity Essentials login so agents can submit prior auths to
        portal-only payers. Set up your Availity MFA as an{" "}
        <strong>authenticator app</strong> and paste the setup key below for
        fully-unattended logins.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Username
          </label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Authenticator seed (optional)
        </label>
        <Input
          className="font-mono"
          placeholder="Base32 key from Availity's authenticator setup (the 'can't scan?' code)"
          value={totpSeed}
          onChange={(e) => setTotpSeed(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400">
          When Availity shows the QR code, choose “enter code manually” — that
          key is the seed. Leave blank if you use SMS (a human enters codes).
        </p>
      </div>
      <Button onClick={handleConnect} disabled={busy || !username.trim() || !password.trim()}>
        {busy ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          "Save login"
        )}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Recipe manager — the learned portal workflows the worker replays. Writing
 * requires PLATFORM admin (PLATFORM_ADMIN_EMAILS); others see the list only.
 */
function RecipeManager() {
  const [recipes, setRecipes] = useState<PortalRecipeSummary[]>([]);
  const [payers, setPayers] = useState<{ id: string; name: string }[]>([]);
  const [payerId, setPayerId] = useState("");
  const [name, setName] = useState("");
  const [stepsJson, setStepsJson] = useState("");
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    portalApi
      .recipes()
      .then((res) => setRecipes(res.data ?? []))
      .catch(() => setRecipes([]));
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    payersApi
      .list()
      .then((res) => setPayers((res.data ?? []).map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setPayers([]));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    // Accept either a bare steps array or a full recipe object
    // ({ name, portalKey, steps, ... }) — people paste whole recipe files.
    let steps: unknown[];
    let pastedName: string | undefined;
    let pastedPortalKey: string | undefined;
    try {
      const parsed = JSON.parse(stepsJson) as unknown;
      if (Array.isArray(parsed)) {
        steps = parsed;
      } else if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { steps?: unknown }).steps)
      ) {
        const obj = parsed as { steps: unknown[]; name?: string; portalKey?: string };
        steps = obj.steps;
        pastedName = typeof obj.name === "string" ? obj.name : undefined;
        pastedPortalKey = typeof obj.portalKey === "string" ? obj.portalKey : undefined;
      } else {
        throw new Error("not an array");
      }
      if (steps.length === 0) throw new Error("empty");
    } catch {
      setError(
        "Paste a JSON array of recipe steps, or a full recipe object with a \"steps\" array."
      );
      return;
    }

    setSaving(true);
    try {
      await portalApi.createRecipe({
        portalKey: pastedPortalKey ?? "availity_essentials",
        payerId: payerId || undefined,
        name: name.trim() || pastedName || "Availity Essentials auth",
        steps,
        activate,
      });
      setStepsJson("");
      setName("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      load();
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Couldn't save (platform admin access required)."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await portalApi.activateRecipe(id);
      load();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't activate.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium text-slate-900">Portal Recipes</h3>
        <p className="text-sm text-slate-500">
          The learned steps the agent replays to file an auth. Managed by
          platform administrators.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {recipes.length > 0 ? (
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {recipes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-800">
                    {r.name}{" "}
                    <span className="font-mono text-xs text-slate-400">
                      v{r.version} · {r.stepCount} steps · {r.portalKey}
                    </span>
                  </p>
                </div>
                {r.isActive ? (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleActivate(r.id)}
                  >
                    Activate
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No recipes yet — the agent can't file until one is recorded and
            activated.
          </p>
        )}

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Applies to payer (blank = generic recipe for the whole portal;
              payer-specific recipes win over generic)
            </label>
            <select
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
            >
              <option value="">All payers (portal generic)</option>
              {payers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            placeholder="Recipe name (e.g. Availity auth form v1)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="min-h-[140px] w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder='Paste recipe steps JSON, e.g. [{"action":"navigate","url":"https://apps.availity.com/..."}, {"action":"type","selector":"#memberId","binding":"patient.memberId"}]'
            value={stepsJson}
            onChange={(e) => setStepsJson(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              Activate on save
            </label>
            <Button onClick={handleSave} disabled={saving || !stepsJson.trim()}>
              {saving ? "Saving…" : "Save recipe"}
            </Button>
          </div>
          {saved && (
            <p className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> Recipe saved
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function PortalSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [connections, setConnections] = useState<PortalConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    portalApi
      .connections()
      .then((res) => setConnections(res.data ?? []))
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;
  }

  const availity = connections.find((c) => c.portalKey === "availity_essentials");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        For payers that only accept prior auth through a web portal, Pria's agents
        submit on your behalf using the login you store here.
      </div>

      <RecipeManager />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-500" />
              <h3 className="font-medium text-slate-900">Availity Essentials</h3>
            </div>
            {availity ? (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                <Check className="h-3 w-3" /> Login stored
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                Not connected
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {availity ? (
            <ConnectedPortal conn={availity} isAdmin={isAdmin} onChanged={load} />
          ) : (
            <ConnectForm isAdmin={isAdmin} onChanged={load} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
