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

// ─── Payer directory search + import ────────────────────────────────────────────

function PayerDirectory({
  connectionId,
  isAdmin,
  onChanged,
}: {
  connectionId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    setError(null);
    const handle = setTimeout(() => {
      clearinghouseApi
        .searchPayers(connectionId, q)
        .then((res) => setResults(res.data ?? []))
        .catch((e: { message?: string }) => {
          setResults([]);
          setError(e?.message ?? "Search failed");
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, connectionId]);

  const handleAdd = async (p: DirectoryPayer) => {
    setAdding(p.clearinghousePayerId);
    try {
      await clearinghouseApi.addPayer(connectionId, {
        clearinghousePayerId: p.clearinghousePayerId,
        name: p.name,
        capabilities: p.capabilities,
      });
      setAddedIds((prev) => new Set(prev).add(p.clearinghousePayerId));
      onChanged();
    } catch {
      /* surfaced via disabled state; user can retry */
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">Add payers</p>
        <p className="text-xs text-slate-500">
          Search this clearinghouse's directory and add the payers your practice
          works with. Added payers appear in patient &amp; authorization forms.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search payers by name (e.g. Aetna, UnitedHealthcare)…"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-amber-600">{error}</p>}

      {query.trim().length >= 2 && (
        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
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
                      {p.capabilities?.["eligibility"] === "yes" && " · eligibility"}
                      {p.capabilities?.["era"] === "yes" && " · era"}
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
                      onClick={() => handleAdd(p)}
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
      {!isAdmin && (
        <p className="text-xs text-slate-400">
          Only practice admins can add payers.
        </p>
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
  const [accountKey, setAccountKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!accountKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await clearinghouseApi.connect({
        clearinghouseKey: clearinghouse.key,
        accountKey: accountKey.trim(),
      });
      setAccountKey("");
      onChanged();
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "Couldn't connect — check your Account Key and try again."
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
                <p className="text-xs text-slate-400">Account Key</p>
                <p className="font-mono text-slate-700">
                  {connection.accountKeyMasked ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Payers added</p>
                <p className="text-slate-700">{connection.payerCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Last updated</p>
                <p className="text-slate-700">{formatDate(connection.lastSyncedAt)}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <PayerDirectory
                connectionId={connection.id}
                isAdmin={isAdmin}
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
            <p className="text-sm text-slate-500">
              Connect your {clearinghouse.name} account to send 278 prior-auth
              requests. Generate an Account Key in {clearinghouse.name} → Settings →
              Account Settings.
            </p>
            {isAdmin ? (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Account Key
                  </label>
                  <Input
                    type="password"
                    placeholder="Paste your Account Key"
                    className="font-mono"
                    value={accountKey}
                    onChange={(e) => setAccountKey(e.target.value)}
                  />
                </div>
                <Button onClick={handleConnect} disabled={busy || !accountKey.trim()}>
                  {busy ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Connecting…
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              </div>
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
