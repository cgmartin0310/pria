import { Link } from "react-router";
import { ArrowRight, Clock, AlertTriangle } from "lucide-react";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { formatDate } from "@/lib/utils.js";
import type { PAStatus } from "@pria/shared";

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const RECENT_AUTHS = [
  {
    id: "auth_001",
    patient: "Margaret Thompson",
    payer: "UnitedHealthcare",
    cptCodes: ["97110", "97140"],
    status: "pending" as PAStatus,
    requestedVisits: 24,
    submittedAt: "2025-05-06",
  },
  {
    id: "auth_002",
    patient: "Robert Chen",
    payer: "Aetna",
    cptCodes: ["97161", "97110"],
    status: "approved" as PAStatus,
    requestedVisits: 16,
    submittedAt: "2025-05-04",
  },
  {
    id: "auth_003",
    patient: "Linda Okafor",
    payer: "Anthem BCBS",
    cptCodes: ["92507"],
    status: "denied" as PAStatus,
    requestedVisits: 20,
    submittedAt: "2025-05-03",
  },
  {
    id: "auth_004",
    patient: "James Rivera",
    payer: "Cigna",
    cptCodes: ["97530", "97112"],
    status: "submitted" as PAStatus,
    requestedVisits: 12,
    submittedAt: "2025-05-07",
  },
  {
    id: "auth_005",
    patient: "Susan Park",
    payer: "Humana",
    cptCodes: ["97110", "97012"],
    status: "approved" as PAStatus,
    requestedVisits: 18,
    submittedAt: "2025-05-02",
  },
];

const EXPIRING_AUTHS = [
  {
    id: "auth_010",
    patient: "David Williams",
    payer: "UnitedHealthcare",
    visitsRemaining: 3,
    expiresAt: "2025-05-20",
  },
  {
    id: "auth_011",
    patient: "Maria Santos",
    payer: "Aetna",
    visitsRemaining: 5,
    expiresAt: "2025-05-18",
  },
  {
    id: "auth_012",
    patient: "Thomas Kim",
    payer: "Cigna",
    visitsRemaining: 2,
    expiresAt: "2025-05-16",
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <DashboardOverview />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Authorizations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Authorizations</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                Latest prior auth requests
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/authorizations" className="flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {RECENT_AUTHS.map((auth) => (
                <div
                  key={auth.id}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {auth.patient}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {auth.payer} · {auth.cptCodes.join(", ")}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-col items-end gap-1">
                    <Badge variant={auth.status}>
                      {auth.status.charAt(0).toUpperCase() +
                        auth.status.slice(1)}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {formatDate(auth.submittedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Expiring Soon</CardTitle>
              <p className="mt-0.5 text-sm text-slate-500">
                Auths requiring renewal
              </p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {EXPIRING_AUTHS.map((auth) => (
                <div
                  key={auth.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {auth.patient}
                    </p>
                    <p className="text-xs text-slate-500">{auth.payer}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-orange-600">
                      {auth.visitsRemaining} visits left
                    </p>
                    <p className="text-xs text-slate-500">
                      Expires {formatDate(auth.expiresAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 p-4">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to="/authorizations/new">
                  Start Renewal Requests
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/authorizations/new">New Authorization</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/authorizations?status=denied">Review Denials</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/patients">Add Patient</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/authorizations?status=pending">
                <Clock className="mr-1 h-4 w-4" />
                Pending ({6})
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
