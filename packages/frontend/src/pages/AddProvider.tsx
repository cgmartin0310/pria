import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { DISCIPLINE_TAXONOMY_DEFAULTS, PROVIDER_TAXONOMY_CODES } from "@pria/shared";
import { providersApi } from "@/lib/api.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
  hint,
  error,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-500">This field is required</p>
      )}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
        error ? "border-red-400" : "border-slate-300"
      }`}
    >
      {children}
    </select>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ProviderForm {
  firstName: string;
  lastName: string;
  suffix: string;
  credentials: string;
  npi: string;
  stateLicenseNumber: string;
  discipline: "PT" | "OT" | "ST" | "";
  taxonomyCode: string;
}

const INITIAL_FORM: ProviderForm = {
  firstName: "",
  lastName: "",
  suffix: "",
  credentials: "",
  npi: "",
  stateLicenseNumber: "",
  discipline: "",
  taxonomyCode: "",
};

const DISCIPLINE_LABELS: Record<"PT" | "OT" | "ST", string> = {
  PT: "Physical Therapy (PT)",
  OT: "Occupational Therapy (OT)",
  ST: "Speech Therapy (ST)",
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AddProvider() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ProviderForm>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleDisciplineChange = (v: string) => {
    const discipline = v as "PT" | "OT" | "ST" | "";
    setForm((prev) => ({
      ...prev,
      discipline,
      taxonomyCode:
        discipline ? DISCIPLINE_TAXONOMY_DEFAULTS[discipline] : "",
    }));
  };

  const taxonomyName =
    (PROVIDER_TAXONOMY_CODES as Record<string, string>)[form.taxonomyCode] ?? null;

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};
    if (!form.firstName.trim()) e["firstName"] = true;
    if (!form.lastName.trim()) e["lastName"] = true;
    if (!form.npi.trim() || form.npi.length !== 10) e["npi"] = true;
    if (!form.discipline) e["discipline"] = true;
    if (!form.taxonomyCode.trim()) e["taxonomyCode"] = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setApiError(null);
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        npi: form.npi.trim(),
        discipline: form.discipline,
        taxonomyCode: form.taxonomyCode.trim(),
      };
      if (form.suffix.trim()) payload["suffix"] = form.suffix.trim();
      if (form.credentials.trim()) payload["credentials"] = form.credentials.trim();
      if (form.stateLicenseNumber.trim())
        payload["stateLicenseNumber"] = form.stateLicenseNumber.trim();

      await providersApi.create(payload);
      navigate("/providers");
    } catch (err) {
      setApiError("Failed to save provider. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/providers")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Add Provider</h2>
          <p className="text-sm text-slate-500">Add a therapist or treating provider</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Personal Information</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required error={errors["firstName"]}>
                <Input
                  placeholder="Jane"
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  className={errors["firstName"] ? "border-red-400" : ""}
                />
              </Field>
              <Field label="Last Name" required error={errors["lastName"]}>
                <Input
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  className={errors["lastName"] ? "border-red-400" : ""}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Suffix"
                hint="e.g. DPT, OTR/L, CCC-SLP, PT, OT"
              >
                <Input
                  placeholder="DPT"
                  value={form.suffix}
                  onChange={(e) => set("suffix", e.target.value)}
                />
              </Field>
              <Field label="Credentials" hint="Display credentials (not transmitted in 278)">
                <Input
                  placeholder="e.g. Board Certified in Orthopaedic PT"
                  value={form.credentials}
                  onChange={(e) => set("credentials", e.target.value)}
                />
              </Field>
            </div>

            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <Field
                label="Individual NPI (Type 1)"
                required
                error={errors["npi"]}
                hint="10-digit NPI — maps to 2010EA NM109 in 278 submission"
              >
                <Input
                  placeholder="1234567890"
                  maxLength={10}
                  className={`font-mono font-semibold text-base ${
                    errors["npi"] ? "border-red-400" : "border-blue-300 focus:border-blue-500"
                  }`}
                  value={form.npi}
                  onChange={(e) => set("npi", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>

            <Field label="State License Number" hint="Optional — required by some payers (REF*0B)">
              <Input
                placeholder="e.g. PT-12345"
                className="font-mono"
                value={form.stateLicenseNumber}
                onChange={(e) => set("stateLicenseNumber", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Clinical */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Clinical Information</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Discipline" required error={errors["discipline"]}>
              <NativeSelect
                value={form.discipline}
                onChange={handleDisciplineChange}
                error={errors["discipline"]}
              >
                <option value="">Select discipline...</option>
                {(Object.entries(DISCIPLINE_LABELS) as [string, string][]).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Taxonomy Code"
              required
              error={errors["taxonomyCode"]}
              hint="Auto-populated from discipline · maps to PRV03 in 2010EA"
            >
              <Input
                placeholder="225100000X"
                className={`font-mono ${errors["taxonomyCode"] ? "border-red-400" : ""}`}
                value={form.taxonomyCode}
                onChange={(e) => set("taxonomyCode", e.target.value.trim())}
              />
              {taxonomyName && (
                <p className="mt-1 text-xs text-blue-600">
                  ✓ {taxonomyName}
                </p>
              )}
            </Field>
          </CardContent>
        </Card>

        {apiError && <p className="text-sm text-red-600">{apiError}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/providers")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="min-w-32">
            {saving ? "Saving..." : "Add Provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}
