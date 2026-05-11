import { useState } from "react";
import { Link } from "react-router";
import { Plus, Search, FileText } from "lucide-react";
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
import type { PAStatus } from "@pria/shared";

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_AUTHS = [
  {
    id: "AUTH-2025-001",
    patient: { name: "Margaret Thompson", id: "P001" },
    payer: "UnitedHealthcare",
    cptCodes: ["97110", "97140"],
    status: "pending" as PAStatus,
    requestedVisits: 24,
    approvedVisits: null,
    submittedAt: "2025-05-06",
    expiresAt: null,
    authNumber: null,
  },
  {
    id: "AUTH-2025-002",
    patient: { name: "Robert Chen", id: "P002" },
    payer: "Aetna",
    cptCodes: ["97161", "97110"],
    status: "approved" as PAStatus,
    requestedVisits: 16,
    approvedVisits: 16,
    submittedAt: "2025-05-04",
    expiresAt: "2025-08-04",
    authNumber: "AET-4892847",
  },
  {
    id: "AUTH-2025-003",
    patient: { name: "Linda Okafor", id: "P003" },
    payer: "Anthem BCBS",
    cptCodes: ["92507"],
    status: "denied" as PAStatus,
    requestedVisits: 20,
    approvedVisits: null,
    submittedAt: "2025-05-03",
    expiresAt: null,
    authNumber: null,
  },
  {
    id: "AUTH-2025-004",
    patient: { name: "James Rivera", id: "P004" },
    payer: "Cigna",
    cptCodes: ["97530", "97112"],
    status: "submitted" as PAStatus,
    requestedVisits: 12,
    approvedVisits: null,
    submittedAt: "2025-05-07",
    expiresAt: null,
    authNumber: null,
  },
  {
    id: "AUTH-2025-005",
    patient: { name: "Susan Park", id: "P005" },
    payer: "Humana",
    cptCodes: ["97110", "97012"],
    status: "approved" as PAStatus,
    requestedVisits: 18,
    approvedVisits: 18,
    submittedAt: "2025-05-02",
    expiresAt: "2025-08-02",
    authNumber: "HUM-7723901",
  },
  {
    id: "AUTH-2025-006",
    patient: { name: "David Williams", id: "P006" },
    payer: "UnitedHealthcare",
    cptCodes: ["97110"],
    status: "appeal" as PAStatus,
    requestedVisits: 30,
    approvedVisits: null,
    submittedAt: "2025-04-28",
    expiresAt: null,
    authNumber: null,
  },
  {
    id: "AUTH-2025-007",
    patient: { name: "Patricia Moore", id: "P007" },
    payer: "Medicare",
    cptCodes: ["97165", "97110", "97140"],
    status: "draft" as PAStatus,
    requestedVisits: 20,
    approvedVisits: null,
    submittedAt: null,
    expiresAt: null,
    authNumber: null,
  },
];

export default function Authorizations() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filtered = MOCK_AUTHS.filter((auth) => {
    const matchSearch =
      !search ||
      auth.patient.name.toLowerCase().includes(search.toLowerCase()) ||
      auth.id.toLowerCase().includes(search.toLowerCase()) ||
      auth.payer.toLowerCase().includes(search.toLowerCase());
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-slate-500"
                  >
                    <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No authorizations found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((auth) => (
                  <TableRow key={auth.id}>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {auth.id}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {auth.patient.name}
                    </TableCell>
                    <TableCell className="text-slate-600">{auth.payer}</TableCell>
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
                        {auth.status.charAt(0).toUpperCase() +
                          auth.status.slice(1)}
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
                    <TableCell className="text-slate-500 text-sm">
                      {formatDate(auth.submittedAt) ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {auth.authNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Showing {filtered.length} of {MOCK_AUTHS.length} authorizations
      </p>
    </div>
  );
}
