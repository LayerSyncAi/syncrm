"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
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
}

export function Sidebar({ isAdmin }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[var(--sidebar-width)] flex-col bg-[linear-gradient(180deg,#0B1220_0%,#0A1020_100%)] px-3 py-4 text-text">
      <div className="mb-6 px-2">
        <div className="rounded-[12px] border border-border-strong bg-card-bg/40 px-3 py-3 text-sm font-semibold">
          SynCRM
        </div>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition duration-150",
                active
                  ? "border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.16)] text-white"
                  : "text-text-muted hover:bg-[rgba(148,163,184,0.08)]"
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {isAdmin ? (
        <div className="mt-4 space-y-1 border-t border-border pt-4">
          <p className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-dim">
            Admin
          </p>
          {adminItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition duration-150",
                  active
                    ? "border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.16)] text-white"
                    : "text-text-muted hover:bg-[rgba(148,163,184,0.08)]"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
