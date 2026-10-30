"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellOff, ChevronDown, Globe, LogOut, Menu, Search, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { TIMEZONES, detectBrowserTimezone } from "@/lib/timezones";
import { viewingToasts } from "@/lib/toast";
import { brand } from "@/config/brand";
import { NotificationBell } from "@/components/hub/notification-bell";

interface TopbarProps {
  userName: string;
  userEmail?: string;
  orgName?: string;
  userTimezone?: string;
  isRealAdmin?: boolean;
  agentMode?: boolean;
  onMobileMenuOpen?: () => void;
  /** False for platform staff with no organisation open (no notifications to read). */
  showNotifications?: boolean;
}

const titleMap: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/leads": "Leads",
  "/app/contacts/matching": "Property Matching",
  "/app/contacts/segments": "Contact Segmentation",
  "/app/contacts": "Contacts",
  "/app/properties": "Properties",
  "/app/viewings": "Viewings",
  "/app/tasks": "Tasks",
  "/app/admin/users": "Users",
  "/app/admin/roles": "User Roles",
  "/app/admin/stages": "Stages",
  "/app/platform": "Platform",
  "/app/hub/alerts": "Email alerts",
  "/app/hub": "SyncEstate",
  "/app/notify": "SyncNotify",
  "/app/finance": "SyncFinance",
  "/app/dev": "SyncDev",
  "/app/commission": "My commission",
  "/app/settings": "Agency settings",
};

export function Topbar({ userName, userEmail, orgName, userTimezone, isRealAdmin, agentMode, onMobileMenuOpen, showNotifications = true }: TopbarProps) {
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
        <h1 className="truncate text-[17px] font-medium tracking-[-0.02em]">{title}</h1>
        <span className="hidden rounded-full border border-border-strong px-3 py-1 text-xs text-text-muted sm:inline-block">
          Live
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-2.5">
        {/* Admin/Agent view toggle — only for users who are really admins. */}
        {isRealAdmin && (
          <div
            className="hidden items-center rounded-full border border-border-strong bg-card-bg p-0.5 sm:inline-flex"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              disabled={switchingMode}
              onClick={() => handleSetMode(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                !agentMode ? "bg-primary-600 text-primary-foreground" : "text-text-muted hover:text-text"
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
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                agentMode ? "bg-primary-600 text-primary-foreground" : "text-text-muted hover:text-text"
              )}
              title="Agent Mode — only your own work"
            >
              <UserRound className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Agent</span>
            </button>
          </div>
        )}
        {/* Search: a wide field on desktop, an icon on phones. Both open the
            command palette, which finds leads, properties and tenants. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          aria-label="Search"
          className="hidden h-10 w-[260px] items-center gap-2.5 rounded-full border border-border-strong bg-card-bg pl-4 pr-1.5 text-sm text-text-dim transition hover:bg-surface-2 lg:w-[320px] md:inline-flex"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Find a lead, property or tenant…</span>
          <kbd className="rounded-[8px] border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          aria-label="Search"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-card-bg text-text-muted transition hover:bg-surface-2 md:hidden"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        {/* The assistant needs an organisation, as notifications do. */}
        {showNotifications && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-assistant"))}
            aria-label="Ask AI"
            className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border-strong bg-card-bg text-sm font-medium text-text transition hover:bg-surface-2 lg:w-auto lg:px-4"
          >
            <Sparkles className="h-[18px] w-[18px] text-primary-ink" />
            <span className="hidden lg:inline">Ask AI</span>
          </button>
        )}
        {showNotifications && <NotificationBell />}
        <div className="relative" data-tour="user-profile">
          <button
            className="flex items-center gap-2 rounded-full border border-border-strong bg-card-bg py-1 pl-1 pr-1 text-sm text-text transition hover:bg-surface-2 sm:pr-3"
            onClick={() => setOpen((prev) => !prev)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </div>
            <span className="hidden max-w-[140px] truncate whitespace-nowrap sm:inline">{userName}</span>
            <ChevronDown className="hidden h-4 w-4 text-text-muted sm:block" />
          </button>
          {open ? (
            <div className="absolute right-0 mt-2 w-60 rounded-[16px] border border-border bg-card-bg p-2 shadow-[var(--shadow-pop)]">
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
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-xs text-primary-ink hover:bg-row-hover font-medium"
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
                        userTimezone === tz.value && "text-primary-ink font-medium"
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
                    <Bell className="h-4 w-4 text-primary-ink" />
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
