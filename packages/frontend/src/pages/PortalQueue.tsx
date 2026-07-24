import { useState, useEffect, useCallback } from "react";
import { RefreshCw, RotateCcw, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import {
  portalApi,
  type PortalSubmission,
  type PortalSubmissionDetail,
  type PortalSubmissionStatus,
} from "@/lib/api.js";
import { formatDate } from "@/lib/utils.js";

const STATUS_STYLE: Record<PortalSubmissionStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-slate-100 text-slate-600" },
  logging_in: { label: "Logging in", cls: "bg-blue-50 text-blue-700" },
  in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-700" },
  needs_mfa: { label: "Needs MFA", cls: "bg-amber-50 text-amber-700" },
  needs_human: { label: "Needs attention", cls: "bg-amber-50 text-amber-700" },
  submitted: { label: "Submitted", cls: "bg-green-50 text-green-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
};

const RETRYABLE: PortalSubmissionStatus[] = ["needs_mfa", "needs_human", "failed"];

function SubmissionRow({
  sub,
  onChanged,
}: {
  sub: PortalSubmission;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PortalSubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = STATUS_STYLE[sub.status] ?? STATUS_STYLE.queued;

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      setLoadingDetail(true);
      try {
        const res = await portalApi.submission(sub.id);
        setDetail(res.data);
      } catch {
        /* leave detail empty */
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    setError(null);
    try {
      await portalApi.retrySubmission(sub.id);
      onChanged();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}
              >
                {style.label}
              </span>
              <span className="font-mono text-xs text-slate-400">
                auth {sub.authorizationId.slice(0, 8)}…
              </span>
              {sub.claimedBy && (
                <span className="text-xs text-slate-400">· {sub.claimedBy}</span>
              )}
            </div>
            {sub.confirmationNumber && (
              <p className="mt-1 text-sm text-green-700">
                Confirmation:{" "}
                <span className="font-mono font-semibold">
                  {sub.confirmationNumber}
                </span>
              </p>
            )}
            {(sub.needsHumanReason || sub.lastError) && (
              <p className="mt-1 text-sm text-amber-700">
                {sub.needsHumanReason ?? sub.lastError}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Created {formatDate(sub.createdAt) ?? sub.createdAt} · attempts{" "}
              {sub.attempts}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {RETRYABLE.includes(sub.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RotateCcw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
                Retry
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={toggle}>
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {expanded && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {loadingDetail ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : detail?.pauseScreenshot ? (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">
                  The portal at the moment it paused:
                </p>
                <img
                  src={`data:image/jpeg;base64,${detail.pauseScreenshot}`}
                  alt="Portal state when paused"
                  className="max-h-96 w-full rounded-md border border-slate-200 object-contain"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No screenshot captured for this submission.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalQueue() {
  const [subs, setSubs] = useState<PortalSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    portalApi
      .submissions()
      .then((res) => setSubs(res.data ?? []))
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Light auto-refresh while the queue is visible.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Bot className="h-5 w-5 text-blue-600" />
            Portal Queue
          </h2>
          <p className="text-sm text-slate-500">
            Authorizations being filed by agents on payer portals
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            <Bot className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            No portal submissions yet. When an authorization's payer has no API
            route, Submit sends it here automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <SubmissionRow key={s.id} sub={s} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
