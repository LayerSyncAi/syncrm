"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { LayoutGrid, LayoutDashboard, Waypoints, Building2, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { MODULES, moduleForPath } from "@/config/modules";

type Tab = { label: string; href: string; icon: LucideIcon; exact?: boolean };

const crmTabs: Tab[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/app/leads", icon: Waypoints },
  { label: "Properties", href: "/app/properties", icon: Building2 },
  { label: "Tasks", href: "/app/tasks", icon: ClipboardList },
];

const hubTab: Tab = { label: "Hub", href: "/app/hub", icon: LayoutGrid, exact: true };

/**
 * Mobile-only bottom tab bar: the current module's first four destinations
 * plus a Hub tab. Hidden at md+ where the sidebar is always visible. Respects
 * the home-indicator safe area.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const current = moduleForPath(pathname);
  const hub = useQuery(api.hub.getContext);

  let tabs: Tab[];
  if (current === "crm") {
    tabs = [...crmTabs, hubTab];
  } else if (current === "hub") {
    // "SynCRM" -> "CRM", "Sync Stay" -> "Stay": short enough for a tab.
    const mods = (hub?.myModules ?? []).map((k) => ({
      label: MODULES[k].name.replace(/^Sync ?/, ""),
      href: MODULES[k].homeHref,
      icon: MODULES[k].icon,
    }));
    tabs = [hubTab, ...mods.slice(0, 4)];
  } else {
    const home = MODULES[current].homeHref;
    tabs = [
      ...MODULES[current].nav.slice(0, 4).map((n) => ({ ...n, exact: n.href === home })),
      hubTab,
    ];
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-card-bg/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
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
