"use client";

import { ReactNode, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: ReactNode }) {
  // Middleware handles auth redirects - if we get here, user is authenticated
  // We just need to wait for user data to load for the UI
  const { user, isLoading, isAuthenticated, isSessionAuthenticated, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const hasHandledInvalidSession = useRef(false);

  // Debug logging for auth state
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[AppLayout] Auth state:", {
        isLoading,
        isAuthenticated,
        isSessionAuthenticated,
        hasUser: !!user,
        userEmail: user?.email || null,
      });
    }
  }, [isLoading, isAuthenticated, isSessionAuthenticated, user]);

  // Handle invalid session state: session is authenticated but no user record exists
  // This can happen if user was deleted from DB but session token still exists
  // Sign out to clear the broken session and redirect to login
  useEffect(() => {
    if (
      !isLoading &&
      isSessionAuthenticated &&
      !user &&
      !hasHandledInvalidSession.current
    ) {
      hasHandledInvalidSession.current = true;
      console.log("[AppLayout] Invalid session state: session authenticated but no user record. Signing out.");
      signOut().then(() => {
        router.replace("/login");
      });
    }
  }, [isLoading, isSessionAuthenticated, user, signOut, router]);

  // Show loading state while auth session or user data is loading
  // Also show loading during invalid session cleanup
  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Loading...</p>
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
