import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Sparkles, Send, Save } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Badge } from "@/components/ui/badge.js";
import {
  THERAPY_CPT_CODES,
  CERTIFICATION_TYPES,
  LEVEL_OF_SERVICE_CODES,
  DISCIPLINE_TO_SERVICE_TYPE,
} from "@pria/shared";
import { patientsApi, providersApi, payersApi, authorizationsApi } from "@/lib/api.js";
import type { Patient, Payer, Provider } from "@pria/shared";

// PatientWithPayer includes payer object from backend join
type PatientRow = Patient & { payer?: { id: string; name: string } };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NewAuthorization() {
  const navigate = useNavigate();

  // Data
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [certificationTypeCode, setCertificationTypeCode] = useState("I");
  const [levelOfServiceCode, setLevelOfServiceCode] = useState("R");
  const [placeOfServiceCode, setPlaceOfServiceCode] = useState("11");
  const [selectedCpts, setSelectedCpts] = useState<string[]>([]);
  const [icdCodes] = useState<string[]>([]);
  const [requestedVisits, setRequestedVisits] = useState("12");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Visit pattern
  const [visitsPerPeriod, setVisitsPerPeriod] = useState("2");
  const [periodFrequency, setPeriodFrequency] = useState<"WK" | "MO" | "DA">("WK");
  const [periodCount, setPeriodCount] = useState("6");
  // Clinical
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [practicePayers, setPracticePayers] = useState<Payer[]>([]);

  useEffect(() => {
    Promise.all([patientsApi.list(), providersApi.list(), payersApi.list()])
      .then(([pRes, provRes, payRes]) => {
        if (pRes.data) setPatients(pRes.data as PatientRow[]);
        if (provRes.data) setProviders(provRes.data);
        if (payRes.data) setPracticePayers(payRes.data);
      })
      .catch(() => {
        // proceed with empty lists
      })
      .finally(() => setLoadingData(false));
  }, []);

  const patient = patients.find((p) => p.id === selectedPatientId);
  const provider = providers.find((p) => p.id === selectedProviderId);

  const patientPayer = practicePayers.find(
    (pp) => pp.id === (patient?.payerId ?? patient?.payer?.id)
  );
  const payerPolicy = patientPayer?.authPolicy ?? null;

  // Apply the payer's auth policy as defaults when a patient is picked:
  // visit count from the payer's cap, end date from its auth window.
  useEffect(() => {
    if (!payerPolicy) return;
    if (payerPolicy.maxVisitsPerAuth) {
      setRequestedVisits(String(payerPolicy.maxVisitsPerAuth));
    }
    if (payerPolicy.authPeriodMonths) {
      const start = startDate || new Date().toISOString().slice(0, 10);
      if (!startDate) setStartDate(start);
      const d = new Date(`${start}T00:00:00`);
      d.setMonth(d.getMonth() + payerPolicy.authPeriodMonths);
      d.setDate(d.getDate() - 1);
      setEndDate(d.toISOString().slice(0, 10));
    }
    // Re-run only when the selected patient (→ payer) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, patientPayer?.id]);

  // Auto-derive service type from provider discipline
  const serviceTypeCode = provider
    ? DISCIPLINE_TO_SERVICE_TYPE[provider.discipline]
    : undefined;

  const toggleCpt = (code: string) =>
    setSelectedCpts((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const handleAiGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const patientName = patient
        ? `${patient.firstName} ${patient.lastName}`
        : "the patient";
      const icdList =
        patient?.diagnosisCodes?.length
          ? patient.diagnosisCodes.join(", ")
          : "M54.5";
      setAiSummary(
        `Patient ${patientName} presents with functional limitations requiring skilled therapy intervention. ` +
          `Diagnoses: ${icdList}. Initial evaluation reveals significant limitations in ADLs and functional mobility. ` +
          `Pain rated 7/10 on VAS. ROM restricted, limiting participation in daily activities. ` +
          `Treatment plan includes ${selectedCpts.map((c) => `${c} (${THERAPY_CPT_CODES[c] ?? c})`).join(", ")}. ` +
          `${requestedVisits} visits over ${periodCount} ${periodFrequency === "WK" ? "weeks" : periodFrequency === "MO" ? "months" : "days"} recommended. ` +
          `Patient demonstrates good rehabilitation potential based on motivation and prior functional level.`
      );
      setGenerating(false);
    }, 1500);
  };

  const buildPayload = (status: "draft" | "pending") => ({
    patientId: selectedPatientId,
    payerId: patient?.payerId ?? patient?.payer?.id,
    providerId: selectedProviderId || undefined,
    certificationTypeCode,
    serviceTypeCode,
    levelOfServiceCode,
    placeOfServiceCode,
    cptCodes: selectedCpts,
    icdCodes: patient?.diagnosisCodes ?? icdCodes,
    requestedVisits: parseInt(requestedVisits, 10),
    startDate: startDate || null,
    endDate: endDate || null,
    visitPattern:
      visitsPerPeriod && periodCount
        ? {
            visitsPerPeriod: parseInt(visitsPerPeriod, 10),
            periodFrequency,
            periodCount: parseInt(periodCount, 10),
          }
        : undefined,
    clinicalNotes: clinicalNotes || aiSummary || undefined,
    status,
  });

  const handleSubmit = async () => {
    if (!selectedPatientId || selectedCpts.length === 0) return;
    setSubmitting(true);
    setApiError(null);
    try {
      await authorizationsApi.create(buildPayload("pending"));
      navigate("/authorizations");
    } catch {
      setApiError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedPatientId) return;
    setSavingDraft(true);
    setApiError(null);
    try {
      await authorizationsApi.create(buildPayload("draft"));
      navigate("/authorizations");
    } catch {
      setApiError("Failed to save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const canSubmit =
    !loadingData && selectedPatientId && selectedCpts.length > 0 && aiSummary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/authorizations")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            New Prior Authorization
          </h2>
          <p className="text-sm text-slate-500">
            AI-assisted PA request generation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column — Form ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Patient Selection */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Patient Information</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Select Patient">
                <NativeSelect
                  value={selectedPatientId}
                  onChange={setSelectedPatientId}
                  disabled={loadingData}
                >
                  <option value="">
                    {loadingData ? "Loading patients..." : "Choose a patient..."}
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName}, {p.firstName} —{" "}
                      {p.payer?.name ?? p.payerId} ({p.memberId})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {patient && (
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <span className="text-slate-500">DOB:</span>{" "}
                    <span className="font-medium">{patient.dob}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Member ID:</span>{" "}
                    <span className="font-mono font-medium">
                      {patient.memberId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Payer:</span>{" "}
                    <span className="font-medium">
                      {patient.payer?.name ?? patient.payerId}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Selection */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Treating Provider</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Select Provider">
                <NativeSelect
                  value={selectedProviderId}
                  onChange={setSelectedProviderId}
                  disabled={loadingData}
                >
                  <option value="">
                    {loadingData ? "Loading providers..." : "Choose a provider..."}
                  </option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.lastName}, {p.firstName}{p.suffix ? ` ${p.suffix}` : ""} — {p.discipline} · NPI {p.npi}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {provider && (
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <span className="text-slate-500">Discipline:</span>{" "}
                    <span className="font-medium">{provider.discipline}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">NPI:</span>{" "}
                    <span className="font-mono font-medium">{provider.npi}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Service Type:</span>{" "}
                    <span className="font-medium">{serviceTypeCode}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Authorization Type */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Authorization Details</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {payerPolicy && (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-medium">{patientPayer?.name} policy:</span>{" "}
                  {[
                    payerPolicy.unmanagedVisits != null &&
                      `${payerPolicy.unmanagedVisits} unmanaged visit${payerPolicy.unmanagedVisits === 1 ? "" : "s"} before auth`,
                    payerPolicy.authPeriodMonths != null &&
                      `auths run ${payerPolicy.authPeriodMonths} months`,
                    payerPolicy.maxVisitsPerAuth != null &&
                      `up to ${payerPolicy.maxVisitsPerAuth} visits per auth`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {payerPolicy.notes ? ` — ${payerPolicy.notes}` : ""}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Certification Type">
                  <NativeSelect
                    value={certificationTypeCode}
                    onChange={setCertificationTypeCode}
                  >
                    {Object.entries(CERTIFICATION_TYPES).map(([code, label]) => (
                      <option key={code} value={code}>
                        {code} — {label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Level of Service">
                  <NativeSelect
                    value={levelOfServiceCode}
                    onChange={setLevelOfServiceCode}
                  >
                    {Object.entries(LEVEL_OF_SERVICE_CODES).map(
                      ([code, label]) => (
                        <option key={code} value={code}>
                          {code} — {label}
                        </option>
                      )
                    )}
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Place of Service">
                  <NativeSelect
                    value={placeOfServiceCode}
                    onChange={setPlaceOfServiceCode}
                  >
                    <option value="11">11 — Office</option>
                    <option value="12">12 — Home</option>
                  </NativeSelect>
                </Field>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start Date">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Field>
                <Field label="End Date">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Service Details */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Service Details</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="CPT Codes">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(THERAPY_CPT_CODES)
                    .slice(0, 14)
                    .map(([code, desc]) => (
                      <button
                        key={code}
                        onClick={() => toggleCpt(code)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selectedCpts.includes(code)
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {code} — {desc}
                      </button>
                    ))}
                </div>
              </Field>

              {/* Visit totals */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total Visits Requested">
                  <Input
                    type="number"
                    value={requestedVisits}
                    onChange={(e) => setRequestedVisits(e.target.value)}
                    min={1}
                    max={60}
                  />
                </Field>
              </div>

              {/* Visit Pattern (HSD segment) */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Visit Pattern{" "}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    (HSD segment)
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Visits per period">
                    <Input
                      type="number"
                      value={visitsPerPeriod}
                      onChange={(e) => setVisitsPerPeriod(e.target.value)}
                      min={1}
                    />
                  </Field>
                  <Field label="Period">
                    <NativeSelect
                      value={periodFrequency}
                      onChange={(v) =>
                        setPeriodFrequency(v as "WK" | "MO" | "DA")
                      }
                    >
                      <option value="WK">Per Week</option>
                      <option value="MO">Per Month</option>
                      <option value="DA">Per Day</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Number of periods">
                    <Input
                      type="number"
                      value={periodCount}
                      onChange={(e) => setPeriodCount(e.target.value)}
                      min={1}
                    />
                  </Field>
                </div>
                {visitsPerPeriod && periodCount && (
                  <p className="mt-1 text-xs text-slate-400">
                    Summary: {visitsPerPeriod}x/
                    {periodFrequency === "WK"
                      ? "week"
                      : periodFrequency === "MO"
                      ? "month"
                      : "day"}{" "}
                    × {periodCount}{" "}
                    {periodFrequency === "WK"
                      ? "weeks"
                      : periodFrequency === "MO"
                      ? "months"
                      : "days"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Clinical Notes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">
                  Clinical Documentation
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={
                    generating ||
                    !selectedPatientId ||
                    selectedCpts.length === 0
                  }
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {generating ? "Generating..." : "AI Generate Summary"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Clinical Notes (paste from EMR or type)">
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Paste evaluation notes, functional limitations, treatment goals..."
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                />
              </Field>
              {aiSummary && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      AI-Generated Medical Necessity Summary
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-blue-800">
                    {aiSummary}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column — Summary & Actions ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Request Summary</h3>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient</span>
                <span className="font-medium">
                  {patient
                    ? `${patient.lastName}, ${patient.firstName}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payer</span>
                <span className="font-medium">
                  {patient?.payer?.name ?? patient?.payerId ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Provider</span>
                <span className="font-medium">
                  {provider
                    ? `${provider.lastName}, ${provider.firstName}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cert Type</span>
                <span className="font-medium">
                  {CERTIFICATION_TYPES[certificationTypeCode as keyof typeof CERTIFICATION_TYPES] ?? certificationTypeCode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CPT Codes</span>
                <span className="font-mono font-medium text-xs">
                  {selectedCpts.length > 0 ? selectedCpts.join(", ") : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Visits</span>
                <span className="font-medium">{requestedVisits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">AI Summary</span>
                <Badge variant={aiSummary ? "approved" : "draft"}>
                  {aiSummary ? "Ready" : "Not generated"}
                </Badge>
              </div>
              <hr className="my-2 border-slate-200" />
              <div className="flex justify-between">
                <span className="text-slate-500">Level of Service</span>
                <span className="font-medium">
                  {LEVEL_OF_SERVICE_CODES[levelOfServiceCode as keyof typeof LEVEL_OF_SERVICE_CODES] ?? levelOfServiceCode}
                </span>
              </div>
            </CardContent>
          </Card>

          {apiError && (
            <p className="text-sm text-red-600 rounded-md bg-red-50 border border-red-200 px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={!canSubmit || submitting || savingDraft}
              onClick={handleSubmit}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Authorization"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={!selectedPatientId || submitting || savingDraft}
              onClick={handleSaveDraft}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingDraft ? "Saving..." : "Save as Draft"}
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Payer Rules
              </h4>
              <p className="text-xs text-slate-500">
                {patient
                  ? `${patient.payer?.name ?? "Selected payer"} typically requires prior authorization for therapy services exceeding 12 visits. Average turnaround: 3-5 business days.`
                  : "Select a patient to see payer-specific rules."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
