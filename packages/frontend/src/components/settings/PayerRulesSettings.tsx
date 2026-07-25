import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAuth } from "@/hooks/useAuth.js";
import { payersApi } from "@/lib/api.js";
import type { Payer, PayerAuthPolicy } from "@pria/shared";

/** One editable policy row per payer the practice has added. */
function PayerRow({ payer, isAdmin }: { payer: Payer; isAdmin: boolean }) {
  const [unmanaged, setUnmanaged] = useState(
    payer.authPolicy?.unmanagedVisits?.toString() ?? ""
  );
  const [months, setMonths] = useState(
    payer.authPolicy?.authPeriodMonths?.toString() ?? ""
  );
  const [maxVisits, setMaxVisits] = useState(
    payer.authPolicy?.maxVisitsPerAuth?.toString() ?? ""
  );
  const [portalName, setPortalName] = useState(payer.authPolicy?.portalPayerName ?? "");
  const [portalKey, setPortalKey] = useState(payer.authPolicy?.portalKey ?? "");
  const [notes, setNotes] = useState(payer.authPolicy?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const policy: PayerAuthPolicy = {};
      if (unmanaged.trim() !== "") policy.unmanagedVisits = parseInt(unmanaged, 10);
      if (months.trim() !== "") policy.authPeriodMonths = parseInt(months, 10);
      if (maxVisits.trim() !== "") policy.maxVisitsPerAuth = parseInt(maxVisits, 10);
      if (portalName.trim()) policy.portalPayerName = portalName.trim();
      if (portalKey) policy.portalKey = portalKey as PayerAuthPolicy["portalKey"];
      if (notes.trim()) policy.notes = notes.trim();
      await payersApi.updatePolicy(payer.id, policy);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't save policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{payer.name}</p>
          <p className="font-mono text-xs text-slate-400">{payer.payerId}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button size="sm" variant="outline" disabled={!isAdmin || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-slate-500">Unmanaged visits</label>
          <Input
            type="number"
            min={0}
            placeholder="e.g. 0"
            value={unmanaged}
            onChange={(e) => setUnmanaged(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Auth length (months)</label>
          <Input
            type="number"
            min={1}
            placeholder="e.g. 6"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Max visits / auth</label>
          <Input
            type="number"
            min={1}
            placeholder="e.g. 30"
            value={maxVisits}
            onChange={(e) => setMaxVisits(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500">Auth portal</label>
        <select
          className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          value={portalKey}
          onChange={(e) => setPortalKey(e.target.value)}
          disabled={!isAdmin}
        >
          <option value="">Availity Essentials (default)</option>
          <option value="carelon_mbm">Carelon MBM — no recipe yet, routes to manual</option>
          <option value="manual">Manual only — Pria won't auto-file this payer</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">
          Name in portal dropdown (if different — copy it exactly from Availity)
        </label>
        <Input
          placeholder={`e.g. CAROLINA COMPLETE HEALTH (directory says "${payer.name}")`}
          value={portalName}
          onChange={(e) => setPortalName(e.target.value)}
          disabled={!isAdmin}
        />
      </div>
      <Input
        placeholder="Notes (e.g. routes through Carelon; eval doesn't need auth)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={!isAdmin}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function PayerRulesSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    payersApi
      .list()
      .then((res) => setPayers(res.data ?? []))
      .catch(() => setPayers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="font-medium text-slate-900">Payer Rules</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Each payer's auth policy: visits allowed before an auth is required,
            how long an auth runs, and its visit cap. New authorizations use
            these as defaults.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-400">Loading payers…</p>
        ) : payers.length === 0 ? (
          <p className="text-sm text-slate-400">
            No payers yet — add them under the Clearinghouses tab first.
          </p>
        ) : (
          payers.map((p) => <PayerRow key={p.id} payer={p} isAdmin={isAdmin} />)
        )}
        {!isAdmin && payers.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Only practice admins can edit payer rules.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
