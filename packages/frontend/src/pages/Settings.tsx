import { useState, useEffect } from "react";
import { Plus, X, Check } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.js";
import {
  US_STATES,
  FACILITY_TYPE_CODES,
  PROVIDER_TAXONOMY_CODES,
} from "@pria/shared";
import { practiceApi } from "@/lib/api.js";
import { ClearinghouseSettings } from "@/components/settings/ClearinghouseSettings.js";
import { PortalSettings } from "@/components/settings/PortalSettings.js";
import { PayerRulesSettings } from "@/components/settings/PayerRulesSettings.js";
import type { Practice, ClinicConfig } from "@pria/shared";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {children}
    </select>
  );
}

// ─── Practice Info Tab ─────────────────────────────────────────────────────────

interface PracticeForm {
  name: string;
  npi: string;
  phone: string;
  fax: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

function PracticeInfoTab({ practice }: { practice: Practice | null }) {
  const [form, setForm] = useState<PracticeForm>({
    name: "",
    npi: "",
    phone: "",
    fax: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (practice) {
      setForm({
        name: practice.name ?? "",
        npi: practice.npi ?? "",
        phone: practice.phone ?? "",
        fax: practice.fax ?? "",
        email: practice.email ?? "",
        street: practice.address?.street ?? "",
        city: practice.address?.city ?? "",
        state: practice.address?.state ?? "",
        zip: practice.address?.zip ?? "",
      });
    }
  }, [practice]);

  const set = (key: keyof PracticeForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await practiceApi.updateCurrent({
        name: form.name.trim(),
        npi: form.npi.trim(),
        phone: form.phone.trim(),
        fax: form.fax.trim() || undefined,
        email: form.email.trim() || undefined,
        address: {
          street: form.street.trim(),
          city: form.city.trim(),
          state: form.state,
          zip: form.zip.trim(),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium text-slate-900">Practice Information</h3>
        <p className="text-sm text-slate-500">
          Basic practice details used across all 278 submissions
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Practice Name" required>
            <Input
              placeholder="Summit Physical Therapy"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field
            label="Group NPI (Type 2)"
            required
            hint="10-digit National Provider Identifier for the practice"
          >
            <Input
              placeholder="1234567890"
              maxLength={10}
              className="font-mono"
              value={form.npi}
              onChange={(e) => set("npi", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Phone" required>
            <Input
              type="tel"
              placeholder="(555) 123-4567"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Fax">
            <Input
              type="tel"
              placeholder="(555) 123-4568"
              value={form.fax}
              onChange={(e) => set("fax", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              placeholder="billing@practice.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
        </div>

        {/* Address */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Address</p>
          <div className="space-y-3">
            <Input
              placeholder="Street Address"
              value={form.street}
              onChange={(e) => set("street", e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Input
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div className="col-span-1">
                <NativeSelect value={form.state} onChange={(v) => set("state", v)}>
                  <option value="">State...</option>
                  {Object.entries(US_STATES).map(([abbr, name]) => (
                    <option key={abbr} value={abbr}>
                      {abbr} — {name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="col-span-1">
                <Input
                  placeholder="ZIP"
                  maxLength={10}
                  value={form.zip}
                  onChange={(e) => set("zip", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="min-w-28">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Saved!
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── EDI / Billing Config Tab ─────────────────────────────────────────────────

interface EdiForm {
  taxonomyCodes: string[];
  facilityTypeCode: string;
  claimType: "B" | "A";
  ediSenderQualifier: string;
  ediSenderId: string;
  ediReceiverQualifier: string;
  ediReceiverId: string;
  gsApplicationSenderId: string;
  gsApplicationReceiverId: string;
  requestCategoryCode: string;
}

function TaxonomyCodeInput({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addCode = () => {
    const trimmed = draft.trim();
    if (trimmed && !codes.includes(trimmed)) {
      onChange([...codes, trimmed]);
      setDraft("");
    }
  };

  const removeCode = (code: string) => onChange(codes.filter((c) => c !== code));

  const taxonomyName = (code: string) =>
    (PROVIDER_TAXONOMY_CODES as Record<string, string>)[code] ?? null;

  return (
    <div className="space-y-2">
      {codes.map((code) => (
        <div
          key={code}
          className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div>
            <span className="font-mono text-sm font-medium text-slate-900">{code}</span>
            {taxonomyName(code) && (
              <span className="ml-2 text-xs text-slate-500">{taxonomyName(code)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeCode(code)}
            className="text-slate-400 hover:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="e.g. 225100000X"
          className="font-mono flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCode();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCode}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {draft && taxonomyName(draft.trim()) && (
        <p className="text-xs text-blue-600">
          Recognized: {taxonomyName(draft.trim())}
        </p>
      )}
    </div>
  );
}

function EdiConfigTab({ practice }: { practice: Practice | null }) {
  const config = practice?.clinicConfig;

  const [form, setForm] = useState<EdiForm>({
    taxonomyCodes: config?.taxonomyCodes ?? [],
    facilityTypeCode: config?.facilityTypeCode ?? "11",
    claimType: config?.claimType ?? "B",
    ediSenderQualifier: config?.ediSenderQualifier ?? "ZZ",
    ediSenderId: config?.ediSenderId ?? "",
    ediReceiverQualifier: config?.ediReceiverQualifier ?? "ZZ",
    ediReceiverId: config?.ediReceiverId ?? "",
    gsApplicationSenderId: config?.gsApplicationSenderId ?? "",
    gsApplicationReceiverId: config?.gsApplicationReceiverId ?? "",
    requestCategoryCode: config?.requestCategoryCode ?? "HS",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setForm({
        taxonomyCodes: config.taxonomyCodes ?? [],
        facilityTypeCode: config.facilityTypeCode ?? "11",
        claimType: config.claimType ?? "B",
        ediSenderQualifier: config.ediSenderQualifier ?? "ZZ",
        ediSenderId: config.ediSenderId ?? "",
        ediReceiverQualifier: config.ediReceiverQualifier ?? "ZZ",
        ediReceiverId: config.ediReceiverId ?? "",
        gsApplicationSenderId: config.gsApplicationSenderId ?? "",
        gsApplicationReceiverId: config.gsApplicationReceiverId ?? "",
        requestCategoryCode: config.requestCategoryCode ?? "HS",
      });
    }
  }, [config]);

  const set = <K extends keyof EdiForm>(key: K, value: EdiForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: ClinicConfig = {
        taxonomyCodes: form.taxonomyCodes,
        facilityTypeCode: form.facilityTypeCode,
        claimType: form.claimType,
        ediSenderQualifier: form.ediSenderQualifier,
        ediSenderId: form.ediSenderId.trim(),
        ediReceiverQualifier: form.ediReceiverQualifier,
        ediReceiverId: form.ediReceiverId.trim(),
        gsApplicationSenderId: form.gsApplicationSenderId.trim() || undefined,
        gsApplicationReceiverId: form.gsApplicationReceiverId.trim() || undefined,
        requestCategoryCode: form.requestCategoryCode || undefined,
      };
      await practiceApi.updateClinicConfig(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save EDI config. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Taxonomy Codes */}
      <Card>
        <CardHeader>
          <h3 className="font-medium text-slate-900">Taxonomy Codes</h3>
          <p className="text-sm text-slate-500">
            Provider taxonomy codes for this practice (maps to PRV03 in 2000B)
          </p>
        </CardHeader>
        <CardContent>
          <TaxonomyCodeInput
            codes={form.taxonomyCodes}
            onChange={(codes) => set("taxonomyCodes", codes)}
          />
        </CardContent>
      </Card>

      {/* Place of Service & Claim Type */}
      <Card>
        <CardHeader>
          <h3 className="font-medium text-slate-900">Service Configuration</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Facility Type Code" hint="Maps to UM04-1 in the UM segment">
              <NativeSelect
                value={form.facilityTypeCode}
                onChange={(v) => set("facilityTypeCode", v)}
              >
                {Object.entries(FACILITY_TYPE_CODES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Claim Type" hint="Maps to UM04-2 · B = Professional, A = Institutional">
              <NativeSelect
                value={form.claimType}
                onChange={(v) => set("claimType", v as "B" | "A")}
              >
                <option value="B">B — Professional (most PT/OT/ST outpatient)</option>
                <option value="A">A — Institutional</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Default Request Category Code" hint="UM01 — HS = Health Services Review (standard for PT/OT/ST)">
            <NativeSelect
              value={form.requestCategoryCode}
              onChange={(v) => set("requestCategoryCode", v)}
            >
              <option value="HS">HS — Health Services Review</option>
              <option value="SC">SC — Specialty Care Referral</option>
              <option value="AR">AR — Admission Review</option>
              <option value="RC">RC — Request for Certification</option>
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>

      {/* EDI Interchange Credentials */}
      <Card>
        <CardHeader>
          <h3 className="font-medium text-slate-900">EDI Interchange Credentials (ISA)</h3>
          <p className="text-sm text-slate-500">
            Assigned by your clearinghouse (Availity, Change Healthcare, etc.)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sender Qualifier (ISA05)" hint="Usually ZZ (Mutually Defined)">
              <Input
                className="font-mono"
                placeholder="ZZ"
                maxLength={2}
                value={form.ediSenderQualifier}
                onChange={(e) => set("ediSenderQualifier", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Sender ID (ISA06)">
              <Input
                className="font-mono"
                placeholder="Your clearinghouse sender ID"
                value={form.ediSenderId}
                onChange={(e) => set("ediSenderId", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Receiver Qualifier (ISA07)" hint="Usually ZZ (Mutually Defined)">
              <Input
                className="font-mono"
                placeholder="ZZ"
                maxLength={2}
                value={form.ediReceiverQualifier}
                onChange={(e) => set("ediReceiverQualifier", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Receiver ID (ISA08)">
              <Input
                className="font-mono"
                placeholder="Clearinghouse interchange ID"
                value={form.ediReceiverId}
                onChange={(e) => set("ediReceiverId", e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* GS Application IDs (optional) */}
      <Card>
        <CardHeader>
          <h3 className="font-medium text-slate-900">GS Application IDs (Optional)</h3>
          <p className="text-sm text-slate-500">
            GS02/GS03 — often same as ISA06/ISA08; leave blank to inherit
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="GS Application Sender ID (GS02)">
              <Input
                className="font-mono"
                placeholder="Same as sender ID"
                value={form.gsApplicationSenderId}
                onChange={(e) => set("gsApplicationSenderId", e.target.value)}
              />
            </Field>
            <Field label="GS Application Receiver ID (GS03)">
              <Input
                className="font-mono"
                placeholder="Same as receiver ID"
                value={form.gsApplicationReceiverId}
                onChange={(e) => set("gsApplicationReceiverId", e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="min-w-36">
          {saving ? "Saving..." : "Save EDI Config"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Settings() {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    practiceApi
      .getCurrent()
      .then((res) => {
        if (res.data) setPractice(res.data);
      })
      .catch((err: { statusCode?: number }) => {
        if (err?.statusCode === 404) {
          setNotConfigured(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Clinic Setup</h2>
        <p className="text-sm text-slate-500">
          Practice information and EDI configuration for 278 submissions
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          {notConfigured && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <strong>Set up your practice to get started.</strong> Complete the
              Practice Info and EDI Config tabs before submitting authorizations.
            </div>
          )}

          <Tabs defaultValue="practice">
            <TabsList>
              <TabsTrigger value="practice">Practice Info</TabsTrigger>
              <TabsTrigger value="clearinghouses">Clearinghouses</TabsTrigger>
              <TabsTrigger value="payers">Payer Rules</TabsTrigger>
              <TabsTrigger value="portals">Portals</TabsTrigger>
              <TabsTrigger value="edi">EDI / Billing Config</TabsTrigger>
            </TabsList>

            <TabsContent value="practice" className="mt-4">
              <PracticeInfoTab practice={practice} />
            </TabsContent>

            <TabsContent value="clearinghouses" className="mt-4">
              <ClearinghouseSettings />
            </TabsContent>

            <TabsContent value="payers" className="mt-4">
              <PayerRulesSettings />
            </TabsContent>

            <TabsContent value="portals" className="mt-4">
              <PortalSettings />
            </TabsContent>

            <TabsContent value="edi" className="mt-4">
              <EdiConfigTab practice={practice} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
