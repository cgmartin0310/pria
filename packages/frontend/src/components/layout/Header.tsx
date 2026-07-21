import { Bell, Search } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useAuth } from "@/hooks/useAuth.js";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Page title */}
      <div>
        {title && (
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search patients, auths..."
            className="w-64 pl-8 text-sm"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        {/* User avatar + account menu (sign-out lives here) */}
        <div className="flex items-center gap-2">
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
