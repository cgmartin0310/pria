import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { patientsApi } from "@/lib/api.js";
import type { Patient } from "@pria/shared";

// PatientWithPayer is Patient + optional payer object from backend join
type PatientRow = Patient & { payer?: { name: string } };

export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    patientsApi
      .list()
      .then((res) => {
        if (res.data) setPatients(res.data as PatientRow[]);
      })
      .catch(() => {
        // Show empty state on error
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const payerName = p.payer?.name ?? p.payerId ?? "";
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.memberId.toLowerCase().includes(q) ||
      payerName.toLowerCase().includes(q) ||
      p.diagnosisCodes.some((d) => d.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search patients..."
            className="w-64 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          className="flex items-center gap-2"
          onClick={() => navigate("/patients/new")}
        >
          <Plus className="h-4 w-4" />
          Add Patient
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading patients...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Diagnosis Codes</TableHead>
                  <TableHead>Last Updated</TableHead>
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
                      <User className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      {patients.length === 0 ? (
                        <div>
                          <p>No patients added yet.</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => navigate("/patients/new")}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add your first patient
                          </Button>
                        </div>
                      ) : (
                        <p>No patients match your search.</p>
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
                            {p.middleName && ` ${p.middleName[0]}.`}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            {p.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{p.dob}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {p.memberId}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {p.payer?.name ?? (
                          <span className="font-mono text-xs text-slate-400">
                            {p.payerId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.diagnosisCodes.length > 0 ? (
                            p.diagnosisCodes.map((code) => (
                              <span
                                key={code}
                                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {p.updatedAt
                          ? new Date(p.updatedAt).toLocaleDateString()
                          : "—"}
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
          )}
        </CardContent>
      </Card>

      {!loading && (
        <p className="text-xs text-slate-400">
          Showing {filtered.length} of {patients.length} patients
        </p>
      )}
    </div>
  );
}
