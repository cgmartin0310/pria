import { useState } from "react";
import { Plus, Search, User } from "lucide-react";
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

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_PATIENTS = [
  {
    id: "P001",
    firstName: "Margaret",
    lastName: "Thompson",
    dob: "1958-03-12",
    memberId: "UHC-884721",
    payer: "UnitedHealthcare",
    diagnosisCodes: ["M54.5", "M62.81"],
    activeAuths: 1,
    lastVisit: "2025-05-07",
  },
  {
    id: "P002",
    firstName: "Robert",
    lastName: "Chen",
    dob: "1972-07-24",
    memberId: "AET-331092",
    payer: "Aetna",
    diagnosisCodes: ["M25.511", "M79.3"],
    activeAuths: 1,
    lastVisit: "2025-05-06",
  },
  {
    id: "P003",
    firstName: "Linda",
    lastName: "Okafor",
    dob: "1965-11-08",
    memberId: "ANT-772019",
    payer: "Anthem BCBS",
    diagnosisCodes: ["R47.1"],
    activeAuths: 0,
    lastVisit: "2025-05-05",
  },
  {
    id: "P004",
    firstName: "James",
    lastName: "Rivera",
    dob: "1980-01-30",
    memberId: "CIG-449201",
    payer: "Cigna",
    diagnosisCodes: ["S83.511A", "M23.41"],
    activeAuths: 1,
    lastVisit: "2025-05-07",
  },
  {
    id: "P005",
    firstName: "Susan",
    lastName: "Park",
    dob: "1948-09-15",
    memberId: "HUM-201847",
    payer: "Humana",
    diagnosisCodes: ["M48.06", "G89.29"],
    activeAuths: 1,
    lastVisit: "2025-05-06",
  },
  {
    id: "P006",
    firstName: "David",
    lastName: "Williams",
    dob: "1955-06-20",
    memberId: "UHC-992103",
    payer: "UnitedHealthcare",
    diagnosisCodes: ["M75.110"],
    activeAuths: 1,
    lastVisit: "2025-05-03",
  },
  {
    id: "P007",
    firstName: "Patricia",
    lastName: "Moore",
    dob: "1960-12-01",
    memberId: "MCR-8812044",
    payer: "Medicare",
    diagnosisCodes: ["M17.11", "M79.604"],
    activeAuths: 0,
    lastVisit: "2025-05-01",
  },
  {
    id: "P008",
    firstName: "Michael",
    lastName: "Nguyen",
    dob: "1988-04-17",
    memberId: "AET-559201",
    payer: "Aetna",
    diagnosisCodes: ["S93.401A"],
    activeAuths: 0,
    lastVisit: "2025-04-28",
  },
];

export default function Patients() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_PATIENTS.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.memberId.toLowerCase().includes(q) ||
      p.payer.toLowerCase().includes(q) ||
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
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Patient
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>Diagnosis Codes</TableHead>
                <TableHead>Active Auths</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                    <User className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    No patients found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-slate-900">
                          {p.lastName}, {p.firstName}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">{p.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{p.dob}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {p.memberId}
                    </TableCell>
                    <TableCell className="text-slate-600">{p.payer}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.diagnosisCodes.map((code) => (
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
                      {p.activeAuths > 0 ? (
                        <Badge variant="approved">{p.activeAuths} active</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{p.lastVisit}</TableCell>
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
        Showing {filtered.length} of {MOCK_PATIENTS.length} patients
      </p>
    </div>
  );
}
