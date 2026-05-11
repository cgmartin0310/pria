import { Routes, Route, Navigate } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout.js";
import Dashboard from "@/pages/Dashboard.js";
import Authorizations from "@/pages/Authorizations.js";
import NewAuthorization from "@/pages/NewAuthorization.js";
import Patients from "@/pages/Patients.js";
import AddPatient from "@/pages/AddPatient.js";
import Settings from "@/pages/Settings.js";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/authorizations" element={<Authorizations />} />
        <Route path="/authorizations/new" element={<NewAuthorization />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/new" element={<AddPatient />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
