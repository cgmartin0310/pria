import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { RELATIONSHIP_CODES, COMMON_ICD10_CODES, US_STATES } from "@pria/shared";
import { patientsApi, payersApi, icd10Api, type Icd10Result } from "@/lib/api.js";
import type { Payer } from "@pria/shared";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AddressFields {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface FormState {
  // Demographics
  firstName: string;
  lastName: string;
  middleName: string;
  dob: string;
  gender: string;
  phone: string;
  // Address
  address: AddressFields;
  // Insurance
  payerId: string;
  memberId: string;
  groupNumber: string;
  relationshipToSubscriber: string;
  // Subscriber (conditional)
  subscriberFirstName: string;
  subscriberLastName: string;
  subscriberMiddleName: string;
  subscriberMemberId: string;
  subscriberDob: string;
  subscriberGender: string;
  subscriberAddress: AddressFields;
  subscriberSameAddress: boolean;
  // Diagnosis codes
  diagnosisCodes: string[];
}

const EMPTY_ADDRESS: AddressFields = { street: "", city: "", state: "", zip: "" };

const INITIAL_FORM: FormState = {
  firstName: "",
  lastName: "",
  middleName: "",
  dob: "",
  gender: "",
  phone: "",
  address: { ...EMPTY_ADDRESS },
  payerId: "",
  memberId: "",
  groupNumber: "",
  relationshipToSubscriber: "18",
  subscriberFirstName: "",
  subscriberLastName: "",
  subscriberMiddleName: "",
  subscriberMemberId: "",
  subscriberDob: "",
  subscriberGender: "",
  subscriberAddress: { ...EMPTY_ADDRESS },
  subscriberSameAddress: false,
  diagnosisCodes: [],
};

// ─── Helper: Labelled Field ────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
  error,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-500">This field is required</p>
      )}
    </div>
  );
}

// ─── Helper: Native Select ─────────────────────────────────────────────────────

function NativeSelect({
  value,
  onChange,
  children,
  className = "",
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  error?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
        error ? "border-red-400" : "border-slate-300"
      } ${className}`}
    >
      {children}
    </select>
  );
}

// ─── Helper: Address Block ─────────────────────────────────────────────────────

function AddressBlock({
  prefix,
  values,
  onChange,
  errors,
}: {
  prefix: string;
  values: AddressFields;
  onChange: (field: keyof AddressFields, v: string) => void;
  errors: Partial<Record<keyof AddressFields, boolean>>;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Street Address" error={errors.street}>
        <Input
          placeholder="123 Main St"
          value={values.street}
          onChange={(e) => onChange("street", e.target.value)}
          className={errors.street ? "border-red-400" : ""}
          id={`${prefix}-street`}
        />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1">
          <Field label="City" error={errors.city}>
            <Input
              placeholder="Springfield"
              value={values.city}
              onChange={(e) => onChange("city", e.target.value)}
              className={errors.city ? "border-red-400" : ""}
              id={`${prefix}-city`}
            />
          </Field>
        </div>
        <div className="col-span-1">
          <Field label="State" error={errors.state}>
            <NativeSelect
              value={values.state}
              onChange={(v) => onChange("state", v)}
              error={errors.state}
            >
              <option value="">Select...</option>
              {Object.entries(US_STATES).map(([abbr, name]) => (
                <option key={abbr} value={abbr}>
                  {abbr} — {name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="col-span-1">
          <Field label="ZIP" error={errors.zip}>
            <Input
              placeholder="12345"
              value={values.zip}
              onChange={(e) => onChange("zip", e.target.value)}
              className={errors.zip ? "border-red-400" : ""}
              id={`${prefix}-zip`}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AddPatient() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [diagSearch, setDiagSearch] = useState("");

  // Load payers
  useEffect(() => {
    payersApi.list().then((res) => {
      if (res.data) setPayers(res.data);
    }).catch(() => {/* ignore — payers load best-effort */});
  }, []);

  const isSelf = form.relationshipToSubscriber === "18";

  // ── Field updaters ──

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setAddr = (
    which: "address" | "subscriberAddress",
    field: keyof AddressFields,
    value: string
  ) =>
    setForm((prev) => ({
      ...prev,
      [which]: { ...prev[which], [field]: value },
    }));

  // When subscriber address mirrors patient address
  const handleSameAddress = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      subscriberSameAddress: checked,
      subscriberAddress: checked ? { ...prev.address } : { ...EMPTY_ADDRESS },
    }));
  };

  // ── Diagnosis codes ──

  // Labels learned from the built-in list + live NIH results, so selected
  // badges (including codes found only via search) can show a description.
  const [diagLabels, setDiagLabels] = useState<Record<string, string>>({});
  const [apiResults, setApiResults] = useState<Icd10Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const normalizedDiag = diagSearch.trim().toUpperCase();

  // Debounced live search against the NIH/NLM ICD-10 proxy (all ~70k codes).
  useEffect(() => {
    const q = diagSearch.trim();
    if (q.length < 2) {
      setApiResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const handle = setTimeout(() => {
      icd10Api
        .search(q)
        .then((res) => setApiResults(res.data ?? []))
        .catch(() => {
          setApiResults([]);
          setSearchError(true);
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [diagSearch]);

  const toggleDiag = (code: string, label?: string) => {
    if (label) setDiagLabels((prev) => ({ ...prev, [code]: label }));
    setForm((prev) => ({
      ...prev,
      diagnosisCodes: prev.diagnosisCodes.includes(code)
        ? prev.diagnosisCodes.filter((c) => c !== code)
        : [...prev.diagnosisCodes, code],
    }));
  };

  const icdLabel = (code: string): string | undefined =>
    diagLabels[code] ?? COMMON_ICD10_CODES[code];

  // Which rows to show: live results while searching, else built-in quick picks.
  const displayEntries: Array<{ code: string; name: string }> =
    diagSearch.trim().length >= 2
      ? apiResults
      : Object.entries(COMMON_ICD10_CODES).map(([code, name]) => ({ code, name }));

  // Loose ICD-10-CM shape: a letter, then digits, optional "." + more chars.
  const looksLikeIcd = /^[A-TV-Z][0-9][0-9A-Z]?(\.[0-9A-Z]{1,4})?$/.test(normalizedDiag);
  const hasExactMatch =
    normalizedDiag in COMMON_ICD10_CODES ||
    apiResults.some((r) => r.code.toUpperCase() === normalizedDiag);
  const canAddCustom =
    !!normalizedDiag &&
    !hasExactMatch &&
    !form.diagnosisCodes.includes(normalizedDiag);

  const addCustomDiag = () => {
    if (!normalizedDiag || form.diagnosisCodes.includes(normalizedDiag)) return;
    toggleDiag(normalizedDiag);
    setDiagSearch("");
  };

  // ── Validation ──

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};

    if (!form.firstName.trim()) e["firstName"] = true;
    if (!form.lastName.trim()) e["lastName"] = true;
    if (!form.dob) e["dob"] = true;
    if (!form.memberId.trim()) e["memberId"] = true;
    if (!form.payerId) e["payerId"] = true;
    if (!form.relationshipToSubscriber) e["relationshipToSubscriber"] = true;

    if (!isSelf) {
      if (!form.subscriberFirstName.trim()) e["subscriberFirstName"] = true;
      if (!form.subscriberLastName.trim()) e["subscriberLastName"] = true;
      if (!form.subscriberMemberId.trim()) e["subscriberMemberId"] = true;
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ──

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dob: form.dob,
        memberId: form.memberId.trim(),
        payerId: form.payerId,
        relationshipToSubscriber: form.relationshipToSubscriber,
        diagnosisCodes: form.diagnosisCodes,
      };

      if (form.middleName.trim()) payload["middleName"] = form.middleName.trim();
      if (form.gender) payload["gender"] = form.gender;
      if (form.phone.trim()) payload["phone"] = form.phone.trim();
      if (form.groupNumber.trim()) payload["groupNumber"] = form.groupNumber.trim();

      // Address — only include if at least street is filled
      if (form.address.street.trim()) {
        payload["address"] = form.address;
      }

      // Subscriber fields
      if (!isSelf) {
        payload["subscriberFirstName"] = form.subscriberFirstName.trim();
        payload["subscriberLastName"] = form.subscriberLastName.trim();
        if (form.subscriberMiddleName.trim()) payload["subscriberMiddleName"] = form.subscriberMiddleName.trim();
        payload["subscriberMemberId"] = form.subscriberMemberId.trim();
        if (form.subscriberDob) payload["subscriberDob"] = form.subscriberDob;
        if (form.subscriberGender) payload["subscriberGender"] = form.subscriberGender;
        if (form.subscriberAddress.street.trim()) payload["subscriberAddress"] = form.subscriberAddress;
      }

      await patientsApi.create(payload);
      navigate("/patients");
    } catch (err) {
      console.error("Failed to save patient:", err);
      // Surface error without crashing — user can retry
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/patients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Add Patient</h2>
          <p className="text-sm text-slate-500">Enter patient and insurance information</p>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl">

        {/* ── Section 1: Demographics ── */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Demographics</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
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
              <Field label="Middle Name">
                <Input
                  placeholder="Optional"
                  value={form.middleName}
                  onChange={(e) => set("middleName", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Date of Birth" required error={errors["dob"]}>
                <Input
                  type="date"
                  value={form.dob}
                  onChange={(e) => set("dob", e.target.value)}
                  className={errors["dob"] ? "border-red-400" : ""}
                />
              </Field>
              <Field label="Gender">
                <NativeSelect value={form.gender} onChange={(v) => set("gender", v)}>
                  <option value="">Select...</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="U">Unknown</option>
                </NativeSelect>
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Address ── */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Address</h3>
          </CardHeader>
          <CardContent>
            <AddressBlock
              prefix="patient"
              values={form.address}
              onChange={(field, v) => setAddr("address", field, v)}
              errors={{}}
            />
          </CardContent>
        </Card>

        {/* ── Section 3: Insurance ── */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Insurance</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Payer" required error={errors["payerId"]}>
              <NativeSelect
                value={form.payerId}
                onChange={(v) => set("payerId", v)}
                error={errors["payerId"]}
              >
                <option value="">Select payer...</option>
                {payers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {/* Member ID — most critical field */}
            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <Field label="Member ID (Insurance Card)" required error={errors["memberId"]}>
                <Input
                  placeholder="e.g. UHC-884721"
                  value={form.memberId}
                  onChange={(e) => set("memberId", e.target.value)}
                  className={`text-base font-mono font-semibold ${errors["memberId"] ? "border-red-400" : "border-blue-300 focus:border-blue-500"}`}
                />
              </Field>
              <p className="mt-1 text-xs text-blue-600">
                Required for 278 prior authorization submission
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Group Number">
                <Input
                  placeholder="Optional"
                  value={form.groupNumber}
                  onChange={(e) => set("groupNumber", e.target.value)}
                />
              </Field>
              <Field label="Relationship to Subscriber" required error={errors["relationshipToSubscriber"]}>
                <NativeSelect
                  value={form.relationshipToSubscriber}
                  onChange={(v) => set("relationshipToSubscriber", v)}
                  error={errors["relationshipToSubscriber"]}
                >
                  {Object.entries(RELATIONSHIP_CODES).map(([code, label]) => (
                    <option key={code} value={code}>
                      {code} — {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 4: Subscriber Info (conditional) ── */}
        {!isSelf && (
          <Card>
            <CardHeader>
              <div>
                <h3 className="font-medium text-slate-900">Subscriber Information</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Required because patient is not the insurance subscriber
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Field label="Subscriber First Name" required error={errors["subscriberFirstName"]}>
                  <Input
                    placeholder="John"
                    value={form.subscriberFirstName}
                    onChange={(e) => set("subscriberFirstName", e.target.value)}
                    className={errors["subscriberFirstName"] ? "border-red-400" : ""}
                  />
                </Field>
                <Field label="Subscriber Last Name" required error={errors["subscriberLastName"]}>
                  <Input
                    placeholder="Smith"
                    value={form.subscriberLastName}
                    onChange={(e) => set("subscriberLastName", e.target.value)}
                    className={errors["subscriberLastName"] ? "border-red-400" : ""}
                  />
                </Field>
                <Field label="Middle Name">
                  <Input
                    placeholder="Optional"
                    value={form.subscriberMiddleName}
                    onChange={(e) => set("subscriberMiddleName", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Subscriber Member ID" required error={errors["subscriberMemberId"]}>
                  <Input
                    placeholder="Member ID"
                    value={form.subscriberMemberId}
                    onChange={(e) => set("subscriberMemberId", e.target.value)}
                    className={`font-mono ${errors["subscriberMemberId"] ? "border-red-400" : ""}`}
                  />
                </Field>
                <Field label="Date of Birth">
                  <Input
                    type="date"
                    value={form.subscriberDob}
                    onChange={(e) => set("subscriberDob", e.target.value)}
                  />
                </Field>
                <Field label="Gender">
                  <NativeSelect value={form.subscriberGender} onChange={(v) => set("subscriberGender", v)}>
                    <option value="">Select...</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="U">Unknown</option>
                  </NativeSelect>
                </Field>
              </div>

              {/* Subscriber Address */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Subscriber Address</span>
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.subscriberSameAddress}
                      onChange={(e) => handleSameAddress(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    Same as patient
                  </label>
                </div>
                {!form.subscriberSameAddress && (
                  <AddressBlock
                    prefix="subscriber"
                    values={form.subscriberAddress}
                    onChange={(field, v) => setAddr("subscriberAddress", field, v)}
                    errors={{}}
                  />
                )}
                {form.subscriberSameAddress && (
                  <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
                    Using patient address
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Section 5: Diagnosis Codes ── */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-slate-900">Diagnosis Codes</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Selected badges */}
            {form.diagnosisCodes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.diagnosisCodes.map((code) => (
                  <span
                    key={code}
                    className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800"
                  >
                    <span className="font-mono">{code}</span>
                    {icdLabel(code) ? (
                      <>
                        <span className="text-blue-500">—</span>
                        <span>{icdLabel(code)}</span>
                      </>
                    ) : (
                      <span className="text-blue-400 italic">custom</span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleDiag(code)}
                      className="ml-1 text-blue-400 hover:text-blue-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <Input
              placeholder="Search all ICD-10 codes by code or description..."
              value={diagSearch}
              onChange={(e) => setDiagSearch(e.target.value)}
            />
            {diagSearch.trim().length < 2 && (
              <p className="text-xs text-slate-400">
                Showing common therapy codes. Type at least 2 characters to search
                the full ICD-10 code set.
              </p>
            )}
            {searchError && (
              <p className="text-xs text-amber-600">
                Couldn't reach the code search service — you can still add a code
                manually below.
              </p>
            )}

            {/* Add a custom code not in the built-in list */}
            {canAddCustom && (
              <button
                type="button"
                onClick={addCustomDiag}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span>
                  Add custom code{" "}
                  <span className="font-mono font-semibold">{normalizedDiag}</span>
                  {!looksLikeIcd && (
                    <span className="ml-1 text-xs text-amber-600">
                      (doesn't look like a standard ICD-10 code — double-check)
                    </span>
                  )}
                </span>
              </button>
            )}

            {/* Code list */}
            <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200">
              {searching ? (
                <p className="p-3 text-sm text-slate-400">Searching…</p>
              ) : displayEntries.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">
                  No matching codes{normalizedDiag ? " — use “Add custom code” above" : ""}
                </p>
              ) : (
                displayEntries.map(({ code, name }) => {
                  const selected = form.diagnosisCodes.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleDiag(code, name)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-blue-50 text-blue-800"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`w-4 h-4 flex-shrink-0 rounded border ${selected ? "border-blue-500 bg-blue-500" : "border-slate-300"}`}>
                        {selected && (
                          <svg viewBox="0 0 16 16" className="w-4 h-4 text-white" fill="currentColor">
                            <path d="M13.707 5.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L6 11.586l6.293-6.293a1 1 0 011.414 0z" />
                          </svg>
                        )}
                      </span>
                      <span className="font-mono font-medium text-xs w-16 flex-shrink-0">{code}</span>
                      <span className="text-slate-600">{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Actions ── */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button variant="outline" asChild>
            <Link to="/patients">Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="min-w-32">
            {saving ? "Saving..." : "Save Patient"}
          </Button>
        </div>

      </div>
    </div>
  );
}
