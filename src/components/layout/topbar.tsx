"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Search, User } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  userName: string;
  userEmail?: string;
  orgName?: string;
}

const titleMap: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/leads": "Leads",
  "/app/contacts": "Contacts",
  "/app/properties": "Properties",
  "/app/tasks": "Tasks",
  "/app/admin/users": "Users",
  "/app/admin/roles": "User Roles",
  "/app/admin/stages": "Stages",
};

export function Topbar({ userName, userEmail, orgName }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const title = useMemo(() => {
    const match = Object.keys(titleMap).find((key) => pathname.startsWith(key));
    return match ? titleMap[match] : "SynCRM";
  }, [pathname]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
      setOpen(false);
    }
  };

  // Get initials for avatar
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between border-b border-border bg-card-bg px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <span className="rounded-full border border-border-strong px-3 py-1 text-xs text-text-muted">
          Live
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-[10px] border border-border-strong bg-transparent px-3 py-2 text-text-muted md:flex">
          <Search className="h-4 w-4" />
          <span className="text-xs">Search...</span>
        </div>
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-[10px] border border-border-strong px-3 py-2 text-sm text-text"
            onClick={() => setOpen((prev) => !prev)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600/30 text-xs font-medium text-primary-600">
              {initials}
            </div>
            <span className="hidden sm:inline">{userName}</span>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </button>
          {open ? (
            <div className="absolute right-0 mt-2 w-56 rounded-[12px] border border-border-strong bg-card-bg p-2 shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
              <div className="border-b border-border px-3 py-2 mb-2">
                <p className="text-sm font-medium text-text">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-text-muted truncate">{userEmail}</p>
                )}
                {orgName && (
                  <p className="text-xs text-text-dim truncate mt-0.5">{orgName}</p>
                )}
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover",
                  isLoggingOut && "opacity-50 cursor-not-allowed"
                )}
              >
                <LogOut className="h-4 w-4" />
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
