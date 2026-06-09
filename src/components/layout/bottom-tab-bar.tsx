"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Waypoints, Building2, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/app/leads", icon: Waypoints },
  { label: "Properties", href: "/app/properties", icon: Building2 },
  { label: "Tasks", href: "/app/tasks", icon: ClipboardList },
];

/**
 * Mobile-only bottom tab bar for the four primary destinations. Hidden at md+
 * where the sidebar is always visible. Respects the home-indicator safe area.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-card-bg/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {tabs.map((tab) => {
          const active =
            tab.href === "/app/leads"
              ? pathname === tab.href || pathname.startsWith("/app/leads/")
              : pathname === tab.href || pathname.startsWith(tab.href + "/");
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors duration-150",
                  active ? "text-primary" : "text-text-muted hover:text-text"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
