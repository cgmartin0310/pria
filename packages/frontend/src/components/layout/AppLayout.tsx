import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar.js";
import { Header } from "./Header.js";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/authorizations": "Authorizations",
  "/authorizations/new": "New Authorization",
  "/patients": "Patients",
  "/settings": "Settings",
};

export function AppLayout() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname];

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
