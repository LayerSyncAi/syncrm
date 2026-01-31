"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Redirect to login if not authenticated - must be in useEffect to avoid setState during render
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading state while checking authentication
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

  // Show loading while redirect is in progress
  if (!isAuthenticated || !user) {
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
