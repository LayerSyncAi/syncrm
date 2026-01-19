"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  userName: string;
}

const titleMap: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/leads": "Leads",
  "/app/contacts": "Contacts",
  "/app/properties": "Properties",
  "/app/tasks": "Tasks",
  "/app/admin/users": "Users",
  "/app/admin/stages": "Stages",
};

export function Topbar({ userName }: TopbarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = useMemo(() => {
    const match = Object.keys(titleMap).find((key) => pathname.startsWith(key));
    return match ? titleMap[match] : "SynCRM";
  }, [pathname]);

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
            <div className="h-8 w-8 rounded-full bg-primary-600/30" />
            <span>{userName}</span>
            <ChevronDown className="h-4 w-4 text-text-muted" />
          </button>
          {open ? (
            <div className="absolute right-0 mt-2 w-40 rounded-[12px] border border-border-strong bg-card-bg p-2 shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover"
                )}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
