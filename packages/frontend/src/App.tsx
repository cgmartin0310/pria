import { Routes, Route, Navigate } from "react-router";
import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  ClerkLoading,
  ClerkLoaded,
} from "@clerk/clerk-react";
import { AppLayout } from "@/components/layout/AppLayout.js";
import Dashboard from "@/pages/Dashboard.js";
import Authorizations from "@/pages/Authorizations.js";
import NewAuthorization from "@/pages/NewAuthorization.js";
import Patients from "@/pages/Patients.js";
import AddPatient from "@/pages/AddPatient.js";
import Providers from "@/pages/Providers.js";
import AddProvider from "@/pages/AddProvider.js";
import Settings from "@/pages/Settings.js";
import PortalQueue from "@/pages/PortalQueue.js";
import SignInPage from "@/pages/SignInPage.js";
import SignUpPage from "@/pages/SignUpPage.js";

/** Wraps the authenticated app; unauthenticated users are sent to sign-in. */
function ProtectedLayout() {
  return (
    <>
      <SignedIn>
        <AppLayout />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <>
      <ClerkLoading>
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <Routes>
          {/* Public auth routes (Clerk-hosted UI, path-based) */}
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />

          {/* Protected app */}
          <Route element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/authorizations" element={<Authorizations />} />
            <Route path="/authorizations/new" element={<NewAuthorization />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/new" element={<AddPatient />} />
            <Route path="/patients/:id/edit" element={<AddPatient />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/providers/new" element={<AddProvider />} />
            <Route path="/portal-queue" element={<PortalQueue />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </ClerkLoaded>
    </>
  );
}
