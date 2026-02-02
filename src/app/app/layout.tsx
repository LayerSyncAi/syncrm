"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: ReactNode }) {
  // Middleware handles auth redirects - if we get here, user should be authenticated
  // We need to wait for user data to load for the UI
  const { user, isLoading, isAuthenticated, isSessionAuthenticated, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

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

  // Redirect to login if not authenticated (must be in useEffect to avoid state update during render)
  useEffect(() => {
    if (!isLoading && !isSessionAuthenticated) {
      console.log("[AppLayout] Not authenticated, redirecting to login");
      router.replace("/login");
    }
  }, [isLoading, isSessionAuthenticated, router]);

  // Show loading state while auth session or user data is loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Handle case where session is authenticated but no user record found
  // This can happen if:
  // - User record was deleted from DB but session still exists
  // - There's a mismatch between auth and user records
  // - The user lookup query failed
  // Show an error state with option to sign out, don't auto sign-out to avoid loops
  if (isSessionAuthenticated && !user) {
    console.log("[AppLayout] Session authenticated but no user record found. Showing account issue screen.");
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-6">
          <AlertCircle className="h-12 w-12 text-amber-500" />
          <h2 className="text-lg font-semibold text-text-primary">Account Setup Issue</h2>
          <p className="text-sm text-text-muted">
            Your session is valid but we couldn&apos;t find your account record.
            This can happen if your account is still being set up or if there was a sync issue.
          </p>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If not session authenticated and not loading, show redirecting state
  // (actual redirect happens in useEffect above)
  if (!isSessionAuthenticated) {
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // At this point we should have a user, but TypeScript doesn't know that
  if (!user) {
    return null;
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
