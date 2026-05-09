import { NavLink } from "react-router";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Users,
  Building2,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils.js";

interface NavItem {
  label: string;
  to: string;
  icon: React.FC<{ className?: string }>;
  end?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Authorizations", to: "/authorizations", icon: FileText },
  { label: "New Authorization", to: "/authorizations/new", icon: PlusCircle },
  { label: "Patients", to: "/patients", icon: Users },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="text-lg font-bold text-slate-900">Pria</span>
          <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
            Beta
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Navigation
        </p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Practice info */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
            <Building2 className="h-4 w-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              Apex Therapy Group
            </p>
            <p className="truncate text-xs text-slate-500">Practice Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
