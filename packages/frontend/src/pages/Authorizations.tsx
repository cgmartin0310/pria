import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { Plus, Search, FileText, FileCode, Copy, Check, AlertTriangle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import { Input } from "@/components/ui/input.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { formatDate } from "@/lib/utils.js";
import { authDocsApi, authorizationsApi, type Preview278 } from "@/lib/api.js";
import type { PAStatus, AuthorizationWithRelations } from "@pria/shared";

// ─── 278 Preview Dialog ─────────────────────────────────────────────────────────

function Preview278Dialog({
  authId,
  patientName,
  onClose,
}: {
  authId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Preview278 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authorizationsApi
      .preview(authId)
      .then((res) => {
        if (!cancelled) setResult(res.data);
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authId]);

  const copyEdi = () => {
    if (!result?.edi) return;
    navigator.clipboard?.writeText(result.edi).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <FileCode className="h-5 w-5 text-blue-600" />
              X12 278 Preview
            </h2>
            <p className="text-sm text-slate-500">{patientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Assembling and validating…
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : result ? (
            <div className="space-y-4">
              {/* Status */}
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                  result.valid
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {result.valid ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Ready to submit — the 278 generated successfully.</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      Not ready — fix the errors below before this can be submitted.
                    </span>
                  </>
                )}
              </div>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-red-700">
                    Errors ({result.errors.length})
                  </p>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li
                        key={i}
                        className="flex gap-2 rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-700"
                      >
                        <span className="text-red-400">•</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-amber-700">
                    Warnings ({result.warnings.length})
                  </p>
                  <ul className="space-y-1">
                    {result.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-700"
                      >
                        <span className="text-amber-400">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Generated EDI */}
              {result.edi && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      Generated X12 278
                    </p>
                    <Button variant="outline" size="sm" onClick={copyEdi}>
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
                    {result.edi}
                  </pre>
                  <p className="mt-1 text-xs text-slate-400">
                    Each segment ends with <span className="font-mono">~</span>. This
                    is the exact transaction that will be sent to the clearinghouse.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  patientName: string;
  payerName: string;
  cptCodes: string[];
  status: PAStatus;
  requestedVisits: number;
  approvedVisits: number | null;
  submittedAt: string | null;
  authNumber: string | null;
  clearinghouseSubmissionId: string | null;
  decisionCode: string | null;
}

function toRow(a: AuthorizationWithRelations): Row {
  return {
    id: a.id,
    patientName: a.patient
      ? `${a.patient.firstName} ${a.patient.lastName}`
      : a.patientId,
    payerName: a.payer?.name ?? a.payerId,
    cptCodes: a.cptCodes ?? [],
    status: a.status,
    requestedVisits: a.requestedVisits,
    approvedVisits: a.approvedVisits ?? null,
    submittedAt: a.submittedAt ? String(a.submittedAt) : null,
    authNumber: a.authNumber,
    clearinghouseSubmissionId: a.clearinghouseSubmissionId ?? null,
    decisionCode: a.decisionCode ?? null,
  };
}

export default function Authorizations() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFor, setPreviewFor] = useState<Row | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);

  // Attach a document (e.g. the Plan of Care) — portals like Carolina
  // Complete require one; the worker uploads it during filing.
  const handleAttach = (authId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.tif,.tiff,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        setSubmitError("File too large — 10 MB max.");
        return;
      }
      setAttaching(authId);
      setSubmitError(null);
      try {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        await authDocsApi.upload(authId, {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64,
        });
      } catch (e) {
        setSubmitError(
          (e as { message?: string })?.message ?? "Document upload failed."
        );
      } finally {
        setAttaching(null);
      }
    };
    input.click();
  };

  const load = useCallback(() => {
    setLoading(true);
    authorizationsApi
      .list({ pageSize: "100" })
      .then((res) => setRows((res.data ?? []).map(toRow)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  // Submission is queued and processed by a worker, so reload once immediately
  // and again shortly after to pick up the resulting decision.
  const handleSubmit = async (id: string) => {
    setSubmitting(id);
    setSubmitError(null);
    try {
      await authorizationsApi.submit(id);
      load();
      setTimeout(load, 2500);
    } catch (e) {
      setSubmitError(
        (e as { message?: string })?.message ??
          "Submission failed — try Preview 278 to see what's missing."
      );
    } finally {
      setSubmitting(null);
    }
  };

  const filtered = rows.filter((auth) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      auth.patientName.toLowerCase().includes(q) ||
      auth.id.toLowerCase().includes(q) ||
      auth.payerName.toLowerCase().includes(q);
    const matchTab = activeTab === "all" || auth.status === activeTab;
    return matchSearch && matchTab;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search authorizations..."
              className="w-64 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Button asChild>
          <Link to="/authorizations/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Authorization
          </Link>
        </Button>
      </div>

      {/* Status tabs */}
      <Tabs defaultValue="all" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="submitted">Submitted</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="denied">Denied</TabsTrigger>
          <TabsTrigger value="appeal">Appeal</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Auth ID</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>CPT Codes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Auth #</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-slate-500">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No authorizations found.{" "}
                    <Link to="/authorizations/new" className="text-blue-600 underline">
                      Create one
                    </Link>
                    .
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((auth) => (
                  <TableRow key={auth.id}>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {auth.id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {auth.patientName}
                    </TableCell>
                    <TableCell className="text-slate-600">{auth.payerName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {auth.cptCodes.map((code) => (
                          <span
                            key={code}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={auth.status}>
                        {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {auth.approvedVisits !== null ? (
                        <span className="font-medium text-green-700">
                          {auth.approvedVisits} approved
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          {auth.requestedVisits} req.
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatDate(auth.submittedAt) ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {auth.authNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewFor(auth)}
                        >
                          <FileCode className="h-3.5 w-3.5" />
                          Preview 278
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttach(auth.id)}
                          disabled={attaching === auth.id}
                        >
                          {attaching === auth.id ? "Uploading…" : "Attach doc"}
                        </Button>
                        {auth.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSubmit(auth.id)}
                            disabled={submitting === auth.id}
                          >
                            {submitting === auth.id ? "Submitting…" : "Submit"}
                          </Button>
                        )}
                        {/* A submitted auth with no clearinghouse id and no
                            decision is stuck — its submit job died. Offer a
                            re-queue. */}
                        {auth.status === "submitted" &&
                          !auth.clearinghouseSubmissionId &&
                          !auth.decisionCode && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSubmit(auth.id)}
                              disabled={submitting === auth.id}
                            >
                              {submitting === auth.id ? "Retrying…" : "Retry submit"}
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {submitError && (
        <p className="text-sm text-red-600">{submitError}</p>
      )}

      <p className="text-xs text-slate-400">
        Showing {filtered.length} authorization{filtered.length !== 1 ? "s" : ""}
      </p>

      {previewFor && (
        <Preview278Dialog
          authId={previewFor.id}
          patientName={previewFor.patientName}
          onClose={() => setPreviewFor(null)}
        />
      )}
    </div>
  );
}
