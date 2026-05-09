import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import type { DashboardStats } from "@pria/shared";

const MOCK_STATS: DashboardStats = {
  pendingCount: 14,
  approvedThisMonth: 47,
  deniedThisMonth: 8,
  expiringSoon: 6,
  approvalRate: 85,
  avgDecisionDays: 4.2,
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.FC<{ className?: string }>;
  iconClass?: string;
  trend?: { value: string; positive: boolean };
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClass = "text-slate-600",
  trend,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
            {trend && (
              <p
                className={`mt-1 text-xs font-medium ${
                  trend.positive ? "text-green-600" : "text-red-600"
                }`}
              >
                {trend.positive ? "↑" : "↓"} {trend.value}
              </p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 ${iconClass}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DashboardOverviewProps {
  stats?: DashboardStats;
}

export function DashboardOverview({ stats = MOCK_STATS }: DashboardOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div className="xl:col-span-1">
        <StatCard
          title="Pending Review"
          value={stats.pendingCount}
          subtitle="Awaiting payer decision"
          icon={Clock}
          iconClass="text-yellow-600 bg-yellow-50"
        />
      </div>
      <div className="xl:col-span-1">
        <StatCard
          title="Approved (Month)"
          value={stats.approvedThisMonth}
          subtitle="This calendar month"
          icon={CheckCircle2}
          iconClass="text-green-600 bg-green-50"
          trend={{ value: "+12% vs last month", positive: true }}
        />
      </div>
      <div className="xl:col-span-1">
        <StatCard
          title="Denied (Month)"
          value={stats.deniedThisMonth}
          subtitle="This calendar month"
          icon={XCircle}
          iconClass="text-red-600 bg-red-50"
        />
      </div>
      <div className="xl:col-span-1">
        <StatCard
          title="Expiring Soon"
          value={stats.expiringSoon}
          subtitle="Within 14 days or 5 visits"
          icon={AlertTriangle}
          iconClass="text-orange-600 bg-orange-50"
        />
      </div>
      <div className="xl:col-span-1">
        <StatCard
          title="Approval Rate"
          value={`${stats.approvalRate}%`}
          subtitle="Last 90 days"
          icon={TrendingUp}
          iconClass="text-blue-600 bg-blue-50"
          trend={{ value: "+3% vs prior period", positive: true }}
        />
      </div>
      <div className="xl:col-span-1">
        <StatCard
          title="Avg Decision"
          value={`${stats.avgDecisionDays}d`}
          subtitle="Average calendar days"
          icon={Calendar}
          iconClass="text-purple-600 bg-purple-50"
        />
      </div>
    </div>
  );
}
