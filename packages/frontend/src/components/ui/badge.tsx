import * as React from "react";
import { cn } from "@/lib/utils.js";
import type { PAStatus } from "@pria/shared";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | PAStatus;
}

const variantClasses: Record<string, string> = {
  default: "bg-blue-100 text-blue-800 border-blue-200",
  secondary: "bg-slate-100 text-slate-700 border-slate-200",
  destructive: "bg-red-100 text-red-800 border-red-200",
  outline: "border border-slate-200 text-slate-700",
  // PA Statuses
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  denied: "bg-red-100 text-red-800 border-red-200",
  expired: "bg-orange-100 text-orange-800 border-orange-200",
  appeal: "bg-purple-100 text-purple-800 border-purple-200",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantClasses[variant] ?? variantClasses["default"],
        className
      )}
      {...props}
    />
  );
}
