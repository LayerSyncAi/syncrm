"use client";

import { ReactNode, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { StaticDataProvider } from "@/components/providers/static-data-provider";

const OnboardingTour = dynamic(
  () => import("@/components/onboarding/onboarding-tour").then((m) => m.OnboardingTour),
  { ssr: false }
);

export default function AppLayout({ children }: { children: ReactNode }) {
  // Middleware handles auth redirects - if we get here, user should be authenticated
  // We need to wait for user data to load for the UI
  const { user, org, isLoading, isAuthenticated, isSessionAuthenticated, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleTourComplete = useCallback(() => {
    setTourDismissed(true);
  }, []);

  const isForceChangePasswordPage = pathname === "/app/force-change-password";

  // Redirect to login if not authenticated (must be in useEffect to avoid state update during render)
  useEffect(() => {
    if (!isLoading && !isSessionAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isSessionAuthenticated, router]);

  // Redirect to force-change-password if user has resetPasswordOnNextLogin flag
  useEffect(() => {
    if (!isLoading && user && user.resetPasswordOnNextLogin && !isForceChangePasswordPage) {
      router.replace("/app/force-change-password");
    }
  }, [isLoading, user, isForceChangePasswordPage, router]);

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
              variant="secondary"
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

  // If user must reset password, only allow the force-change-password page (no sidebar/topbar)
  if (user.resetPasswordOnNextLogin) {
    if (isForceChangePasswordPage) {
      return <>{children}</>;
    }
    // Redirect happens in useEffect above, show loading in the meantime
    return (
      <div className="min-h-screen bg-content-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Redirecting...</p>
        </div>
      </div>
    );
  }

  const userName = user.fullName || user.name || user.email || "User";
  const isAdmin = user.role === "admin";

  // Onboarding tour: show for users who haven't completed it yet
  // Default to true for users who don't have the field set (existing users)
  const showOnboarding = user.showOnboardingInterface !== false && pathname === "/app/dashboard";

  return (
    <StaticDataProvider>
    <div className="min-h-screen bg-content-bg">
      {showOnboarding && !tourDismissed && (
        <OnboardingTour isAdmin={isAdmin} onComplete={handleTourComplete} />
      )}
      <ErrorBoundary sectionName="Sidebar">
        <Sidebar
          isAdmin={isAdmin}
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
          orgName={org?.name}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      </ErrorBoundary>
      <div
        className="transition-[margin] duration-200 max-md:!ml-0"
        style={{
          marginLeft: collapsed
            ? "var(--sidebar-width-collapsed)"
            : "var(--sidebar-width)",
        }}
      >
        <Topbar userName={userName} userEmail={user.email || undefined} orgName={org?.name} userTimezone={user.timezone || undefined} onMobileMenuOpen={() => setMobileOpen(true)} />
        <div className="px-3 py-4 sm:px-6 sm:py-6">
          <ErrorBoundary sectionName="Page Content">
            {children}
          </ErrorBoundary>
        </div>
      </div>
    </div>
    </StaticDataProvider>
  );
}
