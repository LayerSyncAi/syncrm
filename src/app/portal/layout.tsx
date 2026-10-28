"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardCheck,
  FileText,
  Home,
  Loader2,
  LogOut,
  Receipt,
  Wrench,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { ForceChangePasswordCard } from "@/components/auth/force-change-password-card";

type Tab = { label: string; href: string; icon: LucideIcon };

const TENANT_TABS: Tab[] = [
  { label: "Home", href: "/portal", icon: Home },
  { label: "Lease", href: "/portal/lease", icon: FileText },
  { label: "Payments", href: "/portal/payments", icon: Receipt },
  { label: "Repairs", href: "/portal/maintenance", icon: Wrench },
];

const LANDLORD_TABS: Tab[] = [
  { label: "Home", href: "/portal", icon: Home },
  { label: "Properties", href: "/portal/properties", icon: Building2 },
  { label: "Repairs", href: "/portal/maintenance", icon: Wrench },
  { label: "Inspections", href: "/portal/inspections", icon: ClipboardCheck },
  { label: "Statements", href: "/portal/statements", icon: FileText },
];

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-content-bg flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );
}

/**
 * Landlord and tenant portal shell. Deliberately light: most tenants use a
 * basic phone, so it is a header and a bottom tab bar, nothing else.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isSessionAuthenticated, signOut } = useAuth();
  const portal = useQuery(api.portal.context.get, user?.portalKind ? {} : "skip");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isSessionAuthenticated) router.replace("/login");
    // Staff accounts belong in the main app.
    else if (user && !user.portalKind) router.replace("/app/hub");
  }, [isLoading, isSessionAuthenticated, user, router]);

  if (isLoading || !user || !user.portalKind) return <FullScreenLoader />;

  if (user.resetPasswordOnNextLogin) {
    return <ForceChangePasswordCard onChanged={() => router.replace("/portal")} />;
  }

  if (portal === undefined) return <FullScreenLoader />;

  const tabs = user.portalKind === "tenant" ? TENANT_TABS : LANDLORD_TABS;
  const isActive = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-content-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-card-bg">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {portal?.orgName ?? "Portal"}
            </p>
            <p className="truncate text-xs text-text-muted">
              {user.portalKind === "tenant" ? "Tenant portal" : "Landlord portal"}
              {portal?.name ? ` · ${portal.name}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-row-hover"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
        <nav className="mx-auto hidden max-w-4xl gap-1 px-4 pb-2 md:flex">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                isActive(t.href) ? "bg-primary-600/10 text-primary-600" : "text-text-muted hover:bg-row-hover"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-4 pb-24 md:pb-8">
        <ErrorBoundary sectionName="Portal">{children}</ErrorBoundary>
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card-bg md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive(t.href) ? "text-primary-600" : "text-text-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
