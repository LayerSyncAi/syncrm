"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  UserCog,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/app/leads", icon: Waypoints },
  { label: "Properties", href: "/app/properties", icon: Building2 },
  { label: "Tasks", href: "/app/tasks", icon: ClipboardList },
];

const adminItems = [
  { label: "Users", href: "/app/admin/users", icon: UserCog },
  { label: "Stages", href: "/app/admin/stages", icon: Waypoints },
];

interface SidebarProps {
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ isAdmin, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 flex h-screen flex-col bg-[#2a5925] px-3 py-4 text-[#fcfcfc] transition-[width] duration-200 relative",
        collapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#2a5925] text-[#fcfcfc] shadow-sm transition hover:bg-white/10"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      <div className="mb-6 flex items-center justify-between px-2">
        <div
          className={cn(
            "rounded-[12px] border border-white/20 bg-white/10 px-3 py-3 text-sm font-semibold transition-all duration-200",
            collapsed ? "w-full text-center" : "w-auto"
          )}
        >
          {collapsed ? "S" : "SynCRM"}
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const itemTextClass = active ? "text-[#eca400]" : "text-[#fcfcfc]";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition duration-150",
                collapsed ? "justify-center" : "justify-start",
                active ? "bg-white/10" : "hover:bg-white/10",
                itemTextClass
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", itemTextClass)} />
              {!collapsed ? <span className={itemTextClass}>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
      {isAdmin ? (
        <div className="mt-4 space-y-1 border-t border-white/20 pt-4">
          {!collapsed ? (
            <p className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              Admin
            </p>
          ) : null}
          {adminItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            const itemTextClass = active ? "text-[#eca400]" : "text-[#fcfcfc]";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition duration-150",
                  collapsed ? "justify-center" : "justify-start",
                  active ? "bg-white/10" : "hover:bg-white/10",
                  itemTextClass
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", itemTextClass)} />
                {!collapsed ? <span className={itemTextClass}>{item.label}</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
