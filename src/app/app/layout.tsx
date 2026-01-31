"use client";

import { ReactNode, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRedirected = useRef(false);

  // Debug logging for auth state
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[AppLayout] Auth state:", {
        isLoading,
        isAuthenticated,
        hasUser: !!user,
        userEmail: user?.email || null,
        isRedirecting,
        hasRedirected: hasRedirected.current,
      });
    }
  }, [isLoading, isAuthenticated, user, isRedirecting]);

  // Redirect to login if not authenticated - must be in useEffect to avoid setState during render
  useEffect(() => {
    // Only redirect if:
    // 1. Not currently loading
    // 2. Not authenticated
    // 3. Haven't already initiated a redirect
    if (!isLoading && !isAuthenticated && !hasRedirected.current) {
      if (process.env.NODE_ENV === "development") {
        console.log("[AppLayout] Redirecting to login - not authenticated");
      }
      hasRedirected.current = true;
      setIsRedirecting(true);
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Reset redirect state if user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && hasRedirected.current) {
      hasRedirected.current = false;
      setIsRedirecting(false);
    }
  }, [isAuthenticated]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show loading while redirect is in progress
  if (!isAuthenticated || !user || isRedirecting) {
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const userName = user.fullName || user.name || user.email || "User";
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen bg-content-bg">
      <Sidebar
        isAdmin={isAdmin}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />
      <div
        className="transition-[margin] duration-200"
        style={{
          marginLeft: collapsed
            ? "var(--sidebar-width-collapsed)"
            : "var(--sidebar-width)",
        }}
      >
        <Topbar userName={userName} userEmail={user.email || undefined} />
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
