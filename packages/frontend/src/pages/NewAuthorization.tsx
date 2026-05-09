import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Sparkles, Send, Save } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Badge } from "@/components/ui/badge.js";
import { THERAPY_CPT_CODES, COMMON_THERAPY_DIAGNOSES } from "@pria/shared";

// ─── Mock Patients ─────────────────────────────────────────────────────────────

const MOCK_PATIENTS = [
  { id: "P001", name: "Margaret Thompson", dob: "1958-03-12", memberId: "UHC-884721", payer: "UnitedHealthcare" },
  { id: "P002", name: "Robert Chen", dob: "1972-07-24", memberId: "AET-331092", payer: "Aetna" },
  { id: "P003", name: "Linda Okafor", dob: "1965-11-08", memberId: "ANT-772019", payer: "Anthem BCBS" },
  { id: "P004", name: "James Rivera", dob: "1980-01-30", memberId: "CIG-449201", payer: "Cigna" },
  { id: "P005", name: "Susan Park", dob: "1948-09-15", memberId: "HUM-201847", payer: "Humana" },
];

export default function NewAuthorization() {
  const navigate = useNavigate();
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [selectedCpts, setSelectedCpts] = useState<string[]>([]);
  const [requestedVisits, setRequestedVisits] = useState("12");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const patient = MOCK_PATIENTS.find((p) => p.id === selectedPatient);

  const toggleCpt = (code: string) => {
    setSelectedCpts((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAiGenerate = () => {
    setGenerating(true);
    // Simulate AI generation
    setTimeout(() => {
      setAiSummary(
        `Patient presents with reduced functional mobility and chronic low back pain (M54.5). ` +
        `Initial evaluation reveals significant limitations in ADLs including difficulty with sit-to-stand transfers, ` +
        `ambulation >200ft, and stair navigation. Pain rated 7/10 on VAS. ` +
        `Lumbar ROM restricted to 40% flexion, 30% extension. ` +
        `Treatment plan includes therapeutic exercises (97110) and manual therapy (97140) ` +
        `targeting core stabilization, flexibility restoration, and functional mobility training. ` +
        `${requestedVisits} visits over 8 weeks recommended to achieve functional goals. ` +
        `Patient demonstrates good rehabilitation potential based on motivation and prior functional level.`
      );
      setGenerating(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/authorizations">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">New Prior Authorization</h2>
          <p className="text-sm text-slate-500">AI-assisted PA request generation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column — Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Patient Selection */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Patient Information</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Select Patient
                </label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedPatient}
                  onChange={(e) => setSelectedPatient(e.target.value)}
                >
                  <option value="">Choose a patient...</option>
                  {MOCK_PATIENTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.payer} ({p.memberId})
                    </option>
                  ))}
                </select>
              </div>
              {patient && (
                <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <span className="text-slate-500">DOB:</span>{" "}
                    <span className="font-medium">{patient.dob}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Member ID:</span>{" "}
                    <span className="font-mono font-medium">{patient.memberId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Payer:</span>{" "}
                    <span className="font-medium">{patient.payer}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Service Details */}
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Service Details</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  CPT Codes
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(THERAPY_CPT_CODES).slice(0, 12).map(([code, desc]) => (
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Requested Visits
                  </label>
                  <Input
                    type="number"
                    value={requestedVisits}
                    onChange={(e) => setRequestedVisits(e.target.value)}
                    min={1}
                    max={60}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Frequency
                  </label>
                  <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option>2x per week</option>
                    <option>3x per week</option>
                    <option>1x per week</option>
                    <option>Daily</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Notes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Clinical Documentation</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={generating || !selectedPatient || selectedCpts.length === 0}
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {generating ? "Generating..." : "AI Generate Summary"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Clinical Notes (paste from EMR or type)
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Paste evaluation notes, functional limitations, treatment goals..."
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                />
              </div>
              {aiSummary && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      AI-Generated Medical Necessity Summary
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-blue-800">{aiSummary}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — Summary & Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-medium text-slate-900">Request Summary</h3>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient</span>
                <span className="font-medium">{patient?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payer</span>
                <span className="font-medium">{patient?.payer ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CPT Codes</span>
                <span className="font-mono font-medium">
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
                <span className="text-slate-500">Est. Auth Required</span>
                <Badge variant="pending">Checking...</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={!selectedPatient || selectedCpts.length === 0 || !aiSummary}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit Authorization
            </Button>
            <Button variant="outline" className="w-full">
              <Save className="mr-2 h-4 w-4" />
              Save as Draft
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Payer Rules
              </h4>
              <p className="text-xs text-slate-500">
                {patient
                  ? `${patient.payer} typically requires prior authorization for therapy services exceeding 12 visits. Average turnaround: 3-5 business days.`
                  : "Select a patient to see payer-specific rules."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
