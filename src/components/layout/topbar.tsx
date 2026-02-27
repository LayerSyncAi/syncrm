"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown, Globe, LogOut, MessageCircle, Search } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { TIMEZONES, detectBrowserTimezone } from "@/lib/timezones";

interface TopbarProps {
  userName: string;
  userEmail?: string;
  orgName?: string;
  userTimezone?: string;
  userWhatsappNumber?: string;
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

export function Topbar({ userName, userEmail, orgName, userTimezone, userWhatsappNumber }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const updateTimezone = useMutation(api.users.updateMyTimezone);
  const updateWhatsappNumber = useMutation(api.users.updateMyWhatsappNumber);
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showTimezone, setShowTimezone] = useState(false);
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const title = useMemo(() => {
    const match = Object.keys(titleMap).find((key) => pathname.startsWith(key));
    return match ? titleMap[match] : "SynCRM";
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

  const handleWhatsappSave = async () => {
    const trimmed = whatsappInput.trim();
    if (trimmed && !/^\+\d{7,15}$/.test(trimmed)) {
      setWhatsappError("Use E.164 format e.g. +263771234567");
      return;
    }
    setIsSavingWhatsapp(true);
    setWhatsappError("");
    try {
      await updateWhatsappNumber({ whatsappNumber: trimmed });
      setShowWhatsapp(false);
    } catch (error) {
      setWhatsappError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSavingWhatsapp(false);
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
    <header
      className={cn(
        "sticky top-0 z-30 flex h-[var(--topbar-height)] items-center justify-between border-b px-6 transition-all duration-300",
        scrolled
          ? "border-border-strong/60 bg-card-bg/80 shadow-[0_1px_12px_rgba(0,0,0,0.08)] backdrop-blur-md"
          : "border-border bg-card-bg"
      )}
    >
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
              <button
                onClick={() => {
                  setShowWhatsapp((v) => !v);
                  setWhatsappInput(userWhatsappNumber || "");
                  setWhatsappError("");
                }}
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-text-muted hover:bg-row-hover"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="truncate">
                  {userWhatsappNumber || "Set WhatsApp number"}
                </span>
              </button>
              {showWhatsapp && (
                <div className="border-t border-border px-3 py-2 space-y-2">
                  <input
                    type="tel"
                    placeholder="+263771234567"
                    value={whatsappInput}
                    onChange={(e) => { setWhatsappInput(e.target.value); setWhatsappError(""); }}
                    className="w-full rounded-[8px] border border-border-strong bg-transparent px-2 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:ring-1 focus:ring-primary-600"
                  />
                  {whatsappError && (
                    <p className="text-xs text-red-500">{whatsappError}</p>
                  )}
                  <p className="text-[10px] text-text-dim">E.164 format with country code</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleWhatsappSave}
                      disabled={isSavingWhatsapp}
                      className="flex-1 rounded-[8px] bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-600/90 disabled:opacity-50"
                    >
                      {isSavingWhatsapp ? "Saving..." : "Save"}
                    </button>
                    {userWhatsappNumber && (
                      <button
                        onClick={() => { setWhatsappInput(""); handleWhatsappSave(); }}
                        disabled={isSavingWhatsapp}
                        className="rounded-[8px] border border-border-strong px-2 py-1 text-xs text-text-muted hover:bg-row-hover disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
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
