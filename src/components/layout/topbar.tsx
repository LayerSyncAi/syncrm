"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, BellOff, ChevronDown, Globe, LogOut, Menu, Search, ShieldCheck, UserRound } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { TIMEZONES, detectBrowserTimezone } from "@/lib/timezones";
import { viewingToasts } from "@/lib/toast";
import { brand } from "@/config/brand";

interface TopbarProps {
  userName: string;
  userEmail?: string;
  orgName?: string;
  userTimezone?: string;
  isRealAdmin?: boolean;
  agentMode?: boolean;
  onMobileMenuOpen?: () => void;
}

const titleMap: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/leads": "Leads",
  "/app/contacts/matching": "Property Matching",
  "/app/contacts/segments": "Contact Segmentation",
  "/app/contacts": "Contacts",
  "/app/properties": "Properties",
  "/app/tasks": "Tasks",
  "/app/admin/users": "Users",
  "/app/admin/roles": "User Roles",
  "/app/admin/stages": "Stages",
};

export function Topbar({ userName, userEmail, orgName, userTimezone, isRealAdmin, agentMode, onMobileMenuOpen }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const updateTimezone = useMutation(api.users.updateMyTimezone);
  const setViewMode = useMutation(api.users.setMyViewMode);
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showTimezone, setShowTimezone] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  const handleSetMode = async (toAgentMode: boolean) => {
    if (switchingMode || toAgentMode === !!agentMode) return;
    setSwitchingMode(true);
    try {
      await setViewMode({ agentMode: toAgentMode });
      viewingToasts.viewModeChanged(toAgentMode ? "agent" : "admin");
    } catch (error) {
      console.error("View mode update error:", error);
    } finally {
      setSwitchingMode(false);
    }
  };

  const title = useMemo(() => {
    const match = Object.keys(titleMap).find((key) => pathname.startsWith(key));
    return match ? titleMap[match] : brand.name;
  }, [pathname]);

  // Recommendation #4: Progressive scroll shadow + backdrop blur
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  const handleTimezoneChange = async (tz: string) => {
    try {
      await updateTimezone({ timezone: tz });
    } catch (error) {
      console.error("Timezone update error:", error);
    }
    setShowTimezone(false);
  };

  // Get initials for avatar
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between border-b px-3 sm:px-6 transition-all duration-300",
        scrolled
          ? "border-border-strong/60 bg-card-bg/80 shadow-[0_1px_12px_rgba(0,0,0,0.08)] backdrop-blur-md"
          : "border-border bg-card-bg"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Mobile hamburger menu */}
        <button
          type="button"
          onClick={onMobileMenuOpen}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-row-hover md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
        <span className="hidden rounded-full border border-border-strong px-3 py-1 text-xs text-text-muted sm:inline-block">
          Live
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        {/* Admin/Agent view toggle — only for users who are really admins. */}
        {isRealAdmin && (
          <div
            className="hidden items-center rounded-[10px] border border-border-strong p-0.5 sm:inline-flex"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              disabled={switchingMode}
              onClick={() => handleSetMode(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors",
                !agentMode ? "bg-primary-600 text-white" : "text-text-muted hover:text-text"
              )}
              title="Admin Mode — full organisation visibility"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Admin</span>
            </button>
            <button
              type="button"
              disabled={switchingMode}
              onClick={() => handleSetMode(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors",
                agentMode ? "bg-primary-600 text-white" : "text-text-muted hover:text-text"
              )}
              title="Agent Mode — only your own work"
            >
              <UserRound className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Agent</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          aria-label="Open command palette"
          className="hidden h-9 items-center gap-2 rounded-[10px] border border-border-strong px-3 text-sm text-text-muted transition hover:border-primary/60 hover:text-text md:inline-flex"
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
          <kbd className="rounded border border-border px-1.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        <div className="relative" data-tour="user-profile">
          <button
            className="flex items-center gap-2 rounded-[10px] border border-border-strong px-3 py-2 text-sm text-text"
            onClick={() => setOpen((prev) => !prev)}
          >
            {/* Recommendation #5: Avatar with breathing pulse ring */}
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary-600/30 text-xs font-medium text-primary-600">
              {initials}
              <motion.span
                className="absolute inset-[-2px] rounded-full border-2 border-green-500/50"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
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
              {isRealAdmin && (
                <button
                  onClick={() => handleSetMode(!agentMode)}
                  disabled={switchingMode}
                  className="mb-1 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover sm:hidden"
                >
                  {agentMode ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  <span>{agentMode ? "Switch to Admin Mode" : "Switch to Agent Mode"}</span>
                </button>
              )}
              <button
                onClick={() => setShowTimezone((v) => !v)}
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover"
              >
                <Globe className="h-4 w-4" />
                <span className="truncate">
                  {userTimezone || "Set timezone"}
                </span>
              </button>
              {showTimezone && (
                <div className="border-t border-border px-2 py-1 max-h-48 overflow-y-auto">
                  {!userTimezone && (
                    <button
                      onClick={() => handleTimezoneChange(detectBrowserTimezone())}
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs text-primary-600 hover:bg-row-hover font-medium"
                    >
                      Detect my timezone
                    </button>
                  )}
                  {TIMEZONES.map((tz) => (
                    <button
                      key={tz.value}
                      onClick={() => handleTimezoneChange(tz.value)}
                      className={cn(
                        "flex w-full items-center rounded-[10px] px-3 py-1.5 text-xs text-text-muted hover:bg-row-hover",
                        userTimezone === tz.value && "text-primary-600 font-medium"
                      )}
                    >
                      {tz.label}
                    </button>
                  ))}
                </div>
              )}
              {push.supported && (
                <button
                  onClick={() =>
                    push.isSubscribed ? push.unsubscribe() : push.subscribe()
                  }
                  disabled={push.busy || push.status === "denied"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover",
                    (push.busy || push.status === "denied") &&
                      "opacity-50 cursor-not-allowed"
                  )}
                >
                  {push.isSubscribed ? (
                    <Bell className="h-4 w-4 text-primary-600" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                  <span className="truncate">
                    {push.status === "denied"
                      ? "Notifications blocked"
                      : push.busy
                        ? "Working…"
                        : push.isSubscribed
                          ? "Notifications on"
                          : "Enable notifications"}
                  </span>
                </button>
              )}
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
