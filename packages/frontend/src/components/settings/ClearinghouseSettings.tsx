import { useState, useEffect, useCallback } from "react";
import { Plus, X, Check, RefreshCw, Link2, Search } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAuth } from "@/hooks/useAuth.js";
import {
  clearinghouseApi,
  type Clearinghouse,
  type ClearinghouseConnection,
  type DirectoryPayer,
} from "@/lib/api.js";

function formatDate(d: string | null): string {
  if (!d) return "never";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

// ─── Manual payer add ───────────────────────────────────────────────────────────

function AddPayer({
  connectionId,
  isAdmin,
  supportsSearch,
  onChanged,
}: {
  connectionId: string;
  isAdmin: boolean;
  supportsSearch: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [payerId, setPayerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Directory search ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(!supportsSearch);

  useEffect(() => {
    if (!supportsSearch) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const handle = setTimeout(() => {
      clearinghouseApi
        .searchPayers(connectionId, q)
        .then((res) => setResults(res.data ?? []))
        .catch((e: { message?: string }) => {
          setResults([]);
          setSearchError(e?.message ?? "Payer search failed");
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, connectionId, supportsSearch]);

  const handleAddFromDirectory = async (p: DirectoryPayer) => {
    setAdding(p.clearinghousePayerId);
    try {
      await clearinghouseApi.addPayer(connectionId, {
        clearinghousePayerId: p.clearinghousePayerId,
        name: p.name,
        capabilities: p.capabilities,
      });
      setAddedIds((prev) => new Set(prev).add(p.clearinghousePayerId));
      onChanged();
    } catch (e) {
      setSearchError((e as { message?: string })?.message ?? "Couldn't add payer");
    } finally {
      setAdding(null);
    }
  };

  const handleAdd = async () => {
    if (!name.trim() || !payerId.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await clearinghouseApi.addPayer(connectionId, {
        clearinghousePayerId: payerId.trim(),
        name: name.trim(),
      });
      setName("");
      setPayerId("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onChanged();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't add payer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Add payers</p>
        <p className="text-xs text-slate-500">
          Add the payers your practice works with. Added payers appear in patient
          &amp; authorization forms.
        </p>
      </div>

      {/* Directory search */}
      {supportsSearch && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search the clearinghouse payer directory…"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!isAdmin}
            />
          </div>

          {searchError && <p className="text-xs text-amber-600">{searchError}</p>}

          {query.trim().length >= 2 && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
              {searching ? (
                <p className="p-3 text-sm text-slate-400">Searching…</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">No matching payers</p>
              ) : (
                results.map((p) => {
                  const added = p.added || addedIds.has(p.clearinghousePayerId);
                  return (
                    <div
                      key={p.clearinghousePayerId}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-800">{p.name}</p>
                        <p className="font-mono text-xs text-slate-400">
                          {p.clearinghousePayerId}
                        </p>
                      </div>
                      {added ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                          <Check className="h-3.5 w-3.5" /> Added
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!isAdmin || adding === p.clearinghousePayerId}
                          onClick={() => handleAddFromDirectory(p)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {adding === p.clearinghousePayerId ? "Adding…" : "Add"}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowManual((s) => !s)}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            {showManual ? "Hide manual entry" : "Can't find it? Add manually"}
          </button>
        </div>
      )}

      {/* Manual entry (fallback / Test Mode) */}
      {showManual && (
      <div className="grid grid-cols-[1fr,180px,auto] gap-2">
        <Input
          placeholder="Payer name (e.g. Aetna)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isAdmin}
        />
        <Input
          placeholder="Payer ID"
          className="font-mono"
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          disabled={!isAdmin}
        />
        <Button
          onClick={handleAdd}
          disabled={!isAdmin || saving || !name.trim() || !payerId.trim()}
        >
          <Plus className="h-4 w-4" />
          {saving ? "Adding…" : "Add"}
        </Button>
      </div>
      )}
      {saved && (
        <p className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" /> Payer added
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!isAdmin && (
        <p className="text-xs text-slate-400">Only practice admins can add payers.</p>
      )}
    </div>
  );
}

// ─── One clearinghouse card (connect or manage) ────────────────────────────────

function ClearinghouseCard({
  clearinghouse,
  connection,
  isAdmin,
  onChanged,
}: {
  clearinghouse: Clearinghouse;
  connection: ClearinghouseConnection | undefined;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const isSimulated = clearinghouse.key === "simulated";
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState("");
  const [demo, setDemo] = useState(true);
  const [simulatedDecision, setSimulatedDecision] = useState<"A1" | "A3" | "A4">("A1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!isSimulated && (!clientId.trim() || !clientSecret.trim())) return;
    setBusy(true);
    setError(null);
    try {
      await clearinghouseApi.connect({
        clearinghouseKey: clearinghouse.key,
        ...(isSimulated
          ? { simulatedDecision }
          : {
              clientId: clientId.trim(),
              clientSecret: clientSecret.trim(),
              scope: scope.trim() || undefined,
              demo,
            }),
      });
      setClientId("");
      setClientSecret("");
      setScope("");
      onChanged();
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Couldn't connect — check your credentials and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      await clearinghouseApi.disconnect(connection.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            <h3 className="font-medium text-slate-900">{clearinghouse.name}</h3>
            {connection?.demo && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Demo
              </span>
            )}
          </div>
          {connection ? (
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Not connected
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Client ID</p>
                <p className="font-mono text-slate-700">
                  {connection.accountKeyMasked ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Payers added</p>
                <p className="text-slate-700">{connection.payerCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">
                  {connection.environment ? "Environment" : "Last updated"}
                </p>
                <p className="text-slate-700">
                  {connection.environment
                    ? connection.environment === "test"
                      ? "Test (tst.api)"
                      : "Production (api)"
                    : formatDate(connection.lastSyncedAt)}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <AddPayer
                connectionId={connection.id}
                isAdmin={isAdmin}
                supportsSearch={!isSimulated}
                onChanged={onChanged}
              />
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
        ) : (
          <>
            {isSimulated ? (
              <p className="text-sm text-slate-500">
                Runs the complete pipeline without a live clearinghouse: generates
                your real X12 278, returns a canned payer response, parses it, and
                applies the decision. Every result is clearly marked as simulated.
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Connect your {clearinghouse.name} account to send 278 prior-auth
                requests. Create an app in the {clearinghouse.name} developer
                portal, subscribe it to an API product, then paste its OAuth
                Client ID and Client Secret here.
              </p>
            )}
            {isAdmin ? (
              isSimulated ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Simulated decision
                    </label>
                    <select
                      value={simulatedDecision}
                      onChange={(e) =>
                        setSimulatedDecision(e.target.value as "A1" | "A3" | "A4")
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="A1">Approved (certified)</option>
                      <option value="A3">Denied (not certified)</option>
                      <option value="A4">Pended (more info required)</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      What the simulated payer returns for each submission.
                      Reconnect to change it.
                    </p>
                  </div>
                  <Button onClick={handleConnect} disabled={busy}>
                    {busy ? "Enabling…" : "Enable Test Mode"}
                  </Button>
                </div>
              ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Client ID
                  </label>
                  <Input
                    placeholder="Your app's Client ID"
                    className="font-mono"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Client Secret
                  </label>
                  <Input
                    type="password"
                    placeholder="Your app's Client Secret"
                    className="font-mono"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Scope
                  </label>
                  <Input
                    placeholder="Two scopes, space-separated (from the product details page)"
                    className="font-mono"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Availity requires the scope(s) shown on the Service Reviews
                    product details page in the developer portal.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={demo}
                    onChange={(e) => setDemo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  Demo / sandbox mode (canned responses, no PHI)
                </label>
                <div>
                  <Button
                    onClick={handleConnect}
                    disabled={busy || !clientId.trim() || !clientSecret.trim()}
                  >
                    {busy ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Connecting…
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </div>
              )
            ) : (
              <p className="text-xs text-slate-400">
                Only practice admins can connect a clearinghouse.
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tab ───────────────────────────────────────────────────────────────────────

export function ClearinghouseSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [clearinghouses, setClearinghouses] = useState<Clearinghouse[]>([]);
  const [connections, setConnections] = useState<ClearinghouseConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([clearinghouseApi.list(), clearinghouseApi.connections()])
      .then(([chRes, connRes]) => {
        setClearinghouses(chRes.data ?? []);
        setConnections(connRes.data ?? []);
      })
      .catch(() => {
        /* leave empty on error */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  const connByKey = new Map(connections.map((c) => [c.clearinghouseKey, c]));

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Your <strong>connected clearinghouse drives which payers are available</strong>{" "}
        for prior auth. Connect one, then add the payers you work with.
      </div>

      {clearinghouses.length === 0 ? (
        <p className="text-sm text-slate-500">No clearinghouses are available yet.</p>
      ) : (
        clearinghouses.map((ch) => (
          <ClearinghouseCard
            key={ch.id}
            clearinghouse={ch}
            connection={connByKey.get(ch.key)}
            isAdmin={isAdmin}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
}
