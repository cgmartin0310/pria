import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Badge } from "@/components/ui/badge.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { PROVIDER_TAXONOMY_CODES } from "@pria/shared";
import { providersApi } from "@/lib/api.js";
import type { Provider } from "@pria/shared";

const DISCIPLINE_LABELS: Record<string, string> = {
  PT: "Physical Therapy",
  OT: "Occupational Therapy",
  ST: "Speech Therapy",
};

const DISCIPLINE_COLORS: Record<string, string> = {
  PT: "bg-blue-100 text-blue-700",
  OT: "bg-purple-100 text-purple-700",
  ST: "bg-teal-100 text-teal-700",
};

export default function Providers() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");

  useEffect(() => {
    providersApi
      .list()
      .then((res) => {
        if (res.data) setProviders(res.data);
      })
      .catch(() => {
        // Show empty state on error
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    disciplineFilter === "all"
      ? providers
      : providers.filter((p) => p.discipline === disciplineFilter);

  const taxonomyName = (code: string) =>
    (PROVIDER_TAXONOMY_CODES as Record<string, string>)[code] ?? code;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Disciplines</option>
            <option value="PT">Physical Therapy (PT)</option>
            <option value="OT">Occupational Therapy (OT)</option>
            <option value="ST">Speech Therapy (ST)</option>
          </select>
        </div>
        <Button
          className="flex items-center gap-2"
          onClick={() => navigate("/providers/new")}
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading providers...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Discipline</TableHead>
                  <TableHead>Taxonomy</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-slate-500"
                    >
                      <Stethoscope className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {providers.length === 0 ? (
                        <div>
                          <p>No providers added yet.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => navigate("/providers/new")}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add your first provider
                          </Button>
                        </div>
                      ) : (
                        <p>No providers match the selected filter.</p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-slate-900">
                            {p.lastName}, {p.firstName}
                            {p.suffix && (
                              <span className="ml-1.5 text-sm text-slate-500">
                                {p.suffix}
                              </span>
                            )}
                          </span>
                          {p.credentials && (
                            <p className="text-xs text-slate-400">
                              {p.credentials}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {p.npi}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            DISCIPLINE_COLORS[p.discipline] ??
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {p.discipline} —{" "}
                          {DISCIPLINE_LABELS[p.discipline] ?? p.discipline}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-mono text-xs text-slate-700">
                            {p.taxonomyCode}
                          </span>
                          <p className="text-xs text-slate-400">
                            {taxonomyName(p.taxonomyCode)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {p.stateLicenseNumber ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "approved" : "draft"}>
                          {p.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && (
        <p className="text-xs text-slate-400">
          Showing {filtered.length} of {providers.length} providers
        </p>
      )}
    </div>
  );
}
