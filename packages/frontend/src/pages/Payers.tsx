import { useState, useEffect, useCallback } from "react";
import { Check, ChevronDown, ChevronRight, Bot, Zap, FileUp, Hand } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAuth } from "@/hooks/useAuth.js";
import { payersApi, portalApi, type PortalRecipeSummary } from "@/lib/api.js";
import type { Payer, PayerAuthPolicy } from "@pria/shared";

type Transport = NonNullable<PayerAuthPolicy["transport"]>;

const TRANSPORTS: { value: Transport; label: string; hint: string; icon: typeof Zap }[] = [
  { value: "api", label: "API", hint: "Real-time 278 through the clearinghouse", icon: Zap },
  { value: "edi_sftp", label: "EDI (SFTP)", hint: "Batch X12 mailbox — not wired up yet", icon: FileUp },
  { value: "portal", label: "Portal", hint: "Pria's agent files it on the payer's website", icon: Bot },
  { value: "manual", label: "Manual", hint: "Your team files this one by hand", icon: Hand },
];

/** Everything about one payer: how it's filed, its rules, and its automation. */
function PayerCard({
  payer,
  recipes,
  isAdmin,
  isPlatformAdmin,
  onRecipeChange,
}: {
  payer: Payer;
  recipes: PortalRecipeSummary[];
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  onRecipeChange: () => void;
}) {
  const policy = payer.authPolicy ?? {};
  const [open, setOpen] = useState(false);
  const [transport, setTransport] = useState<Transport | "">(policy.transport ?? "");
  const [displayName, setDisplayName] = useState(policy.displayName ?? "");
  const [portalKey, setPortalKey] = useState(policy.portalKey ?? "");
  const [portalPayerName, setPortalPayerName] = useState(policy.portalPayerName ?? "");
  const [unmanaged, setUnmanaged] = useState(policy.unmanagedVisits?.toString() ?? "");
  const [months, setMonths] = useState(policy.authPeriodMonths?.toString() ?? "");
  const [maxVisits, setMaxVisits] = useState(policy.maxVisitsPerAuth?.toString() ?? "");
  const [notes, setNotes] = useState(policy.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recipes for THIS payer, newest first; the active one drives the badge.
  const payerRecipes = recipes
    .filter((r) => r.payerId === payer.id)
    .sort((a, b) => b.version - a.version);
  const activeRecipe = payerRecipes.find((r) => r.isActive);
  const genericActive = recipes.find((r) => !r.payerId && r.isActive);
  const effectiveRecipe = activeRecipe ?? genericActive;

  const effectiveTransport: Transport =
    (transport as Transport) || (payer.supports278 ? "api" : "portal");

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next: PayerAuthPolicy = {};
      if (displayName.trim()) next.displayName = displayName.trim();
      if (transport) next.transport = transport as Transport;
      if (portalKey) next.portalKey = portalKey as PayerAuthPolicy["portalKey"];
      if (portalPayerName.trim()) next.portalPayerName = portalPayerName.trim();
      if (unmanaged.trim() !== "") next.unmanagedVisits = parseInt(unmanaged, 10);
      if (months.trim() !== "") next.authPeriodMonths = parseInt(months, 10);
      if (maxVisits.trim() !== "") next.maxVisitsPerAuth = parseInt(maxVisits, 10);
      if (notes.trim()) next.notes = notes.trim();
      await payersApi.updatePolicy(payer.id, next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const TransportIcon =
    TRANSPORTS.find((t) => t.value === effectiveTransport)?.icon ?? Zap;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header — always visible summary */}
        <button
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900">
              {displayName || payer.name}
            </p>
            <p className="font-mono text-xs text-slate-400">{payer.payerId}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
            <TransportIcon className="h-3.5 w-3.5" />
            {TRANSPORTS.find((t) => t.value === effectiveTransport)?.label}
          </span>
          {effectiveTransport === "portal" && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                effectiveRecipe
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {effectiveRecipe
                ? `Automated · v${effectiveRecipe.version}${activeRecipe ? "" : " (generic)"}`
                : "No recipe yet"}
            </span>
          )}
        </button>

        {open && (
          <div className="space-y-4 border-t border-slate-100 p-4">
            {/* How it's filed */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                How auths are filed
              </p>
              <div className="grid grid-cols-4 gap-2">
                {TRANSPORTS.map((t) => (
                  <button
                    key={t.value}
                    disabled={!isAdmin}
                    onClick={() => setTransport(t.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      effectiveTransport === t.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
              {!transport && (
                <p className="mt-1 text-xs text-slate-400">
                  Not set — Pria is using {effectiveTransport} based on what the
                  clearinghouse reports. Pick one to make it explicit.
                </p>
              )}
            </div>

            {/* Portal specifics */}
            {effectiveTransport === "portal" && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Which portal</label>
                    <select
                      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={portalKey}
                      onChange={(e) => setPortalKey(e.target.value)}
                      disabled={!isAdmin}
                    >
                      <option value="">Availity Essentials (default)</option>
                      <option value="carelon_mbm">Carelon MBM</option>
                      <option value="manual">No portal — manual only</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">
                      Name in the portal's payer dropdown
                    </label>
                    <Input
                      placeholder={`e.g. CAROLINA COMPLETE HEALTH (directory: ${payer.name})`}
                      value={portalPayerName}
                      onChange={(e) => setPortalPayerName(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                </div>

                {/* Recipe status — the automation itself */}
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">
                      {activeRecipe ? (
                        <>
                          <Check className="mr-1 inline h-3.5 w-3.5 text-green-600" />
                          Automated for this payer —{" "}
                          <span className="font-medium">{activeRecipe.name}</span>
                        </>
                      ) : genericActive ? (
                        <>Using the portal's generic recipe ({genericActive.name})</>
                      ) : (
                        <>No recipe yet — the agent can't file this payer.</>
                      )}
                    </p>
                    {payerRecipes.length > 0 && (
                      <p className="text-xs text-slate-400">
                        {payerRecipes.length} version
                        {payerRecipes.length === 1 ? "" : "s"} on file
                      </p>
                    )}
                  </div>
                  {isPlatformAdmin && (
                    <RecipeUpload
                      payerId={payer.id}
                      payerName={displayName || payer.name}
                      onDone={onRecipeChange}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Auth policy */}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Auth rules (used as defaults on new authorizations)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Unmanaged visits</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
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
                    placeholder="6"
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
                    placeholder="30"
                    value={maxVisits}
                    onChange={(e) => setMaxVisits(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>

            {/* Name + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">
                  Display name (what your team calls this payer)
                </label>
                <Input
                  placeholder={payer.name}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Notes</label>
                <Input
                  placeholder="e.g. therapy auths route through Carelon"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              <Button size="sm" disabled={!isAdmin || saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Paste-a-recipe control, scoped to one payer. Platform admins only. */
function RecipeUpload({
  payerId,
  payerName,
  onDone,
}: {
  payerId: string;
  payerName: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    let steps: unknown[];
    try {
      const parsed = JSON.parse(json) as unknown;
      steps = Array.isArray(parsed)
        ? parsed
        : ((parsed as { steps?: unknown[] })?.steps ?? []);
      if (!Array.isArray(steps) || steps.length === 0) throw new Error("empty");
    } catch {
      setError("Paste a steps array, or a recipe object containing one.");
      return;
    }
    setBusy(true);
    try {
      await portalApi.createRecipe({
        portalKey: "availity_essentials",
        payerId,
        name: name.trim() || `${payerName} recipe`,
        steps,
        activate: true,
      });
      setJson("");
      setName("");
      setOpen(false);
      onDone();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Couldn't save the recipe");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add recipe
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <Input
        placeholder={`Recipe name (e.g. ${payerName} v1)`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        placeholder="Paste the recipe steps JSON (the array from the .json file)"
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save & activate"}
        </Button>
      </div>
    </div>
  );
}

export default function Payers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Platform admins are the only ones who can write recipes; the API enforces
  // it, so a failed save here just surfaces the error.
  const isPlatformAdmin = isAdmin;

  const [payers, setPayers] = useState<Payer[]>([]);
  const [recipes, setRecipes] = useState<PortalRecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([payersApi.list(), portalApi.recipes()])
      .then(([p, r]) => {
        setPayers(p.data ?? []);
        setRecipes(r.data ?? []);
      })
      .catch(() => {
        setPayers([]);
        setRecipes([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Payers</h2>
        <p className="text-sm text-slate-500">
          How each payer's authorizations are filed, the rules they follow, and
          which ones Pria can file automatically.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading payers…</p>
      ) : payers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            No payers yet — add them from Settings → Clearinghouses, then set how
            each one files here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {payers.map((p) => (
            <PayerCard
              key={p.id}
              payer={p}
              recipes={recipes}
              isAdmin={isAdmin}
              isPlatformAdmin={isPlatformAdmin}
              onRecipeChange={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
