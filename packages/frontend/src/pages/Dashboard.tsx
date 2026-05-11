import { useState, useEffect } from "react";
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
import { authorizationsApi } from "@/lib/api.js";
import type { PAStatus, DashboardStats, AuthorizationWithRelations } from "@pria/shared";

const EMPTY_STATS: DashboardStats = {
  pendingCount: 0,
  approvedThisMonth: 0,
  deniedThisMonth: 0,
  expiringSoon: 0,
  approvalRate: 0,
  avgDecisionDays: 0,
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentAuths, setRecentAuths] = useState<AuthorizationWithRelations[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [authsLoading, setAuthsLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    authorizationsApi
      .stats()
      .then((res) => {
        if (res.data) setStats(res.data);
      })
      .catch(() => {
        setSetupNeeded(true);
      })
      .finally(() => setStatsLoading(false));

    authorizationsApi
      .list({ pageSize: "5" })
      .then((res) => {
        if (res.data) setRecentAuths(res.data);
      })
      .catch(() => {
        // show empty state
      })
      .finally(() => setAuthsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {setupNeeded && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <strong>Welcome to Pria!</strong> To get started,{" "}
          <Link to="/settings" className="underline font-medium">
            set up your practice
          </Link>{" "}
          and add your first providers and patients.
        </div>
      )}

      {/* Stats */}
      <DashboardOverview stats={statsLoading ? EMPTY_STATS : stats} />

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
            {authsLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">
                Loading...
              </div>
            ) : recentAuths.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No authorizations yet.{" "}
                <Link to="/authorizations/new" className="text-blue-600 underline">
                  Create one
                </Link>
                .
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentAuths.map((auth) => (
                  <div
                    key={auth.id}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {auth.patient
                          ? `${auth.patient.lastName}, ${auth.patient.firstName}`
                          : auth.patientId}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {auth.payer?.name ?? auth.payerId} ·{" "}
                        {auth.cptCodes.join(", ")}
                      </p>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                      <Badge variant={auth.status as PAStatus}>
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
            )}
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
            <div className="py-8 text-center text-sm text-slate-400">
              {stats.expiringSoon > 0 ? (
                <div className="px-6">
                  <p className="font-medium text-orange-600 text-base">
                    {stats.expiringSoon} auth{stats.expiringSoon !== 1 ? "s" : ""} expiring soon
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Within 14 days or 5 visits remaining
                  </p>
                </div>
              ) : (
                "No authorizations expiring soon."
              )}
            </div>
            <div className="border-t border-slate-100 p-4">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to="/authorizations/new">Start Renewal Requests</Link>
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
              <Link to="/patients/new">Add Patient</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/authorizations?status=pending">
                <Clock className="mr-1 h-4 w-4" />
                Pending ({stats.pendingCount})
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
