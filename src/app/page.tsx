"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRedirected = useRef(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading && !hasRedirected.current) {
      if (process.env.NODE_ENV === "development") {
        console.log("[HomePage] Redirecting to dashboard - user is authenticated");
      }
      hasRedirected.current = true;
      setIsRedirecting(true);
      router.replace("/app/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Checking authentication...</p>
        </div>
      </main>
    );
  }

  // If authenticated, show loading while redirecting
  if (isAuthenticated || isRedirecting) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Redirecting to dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      <div className="max-w-lg text-center space-y-4">
        <p className="text-text-muted">SynCRM MVP</p>
        <h1 className="text-2xl font-semibold">Real Estate Pipeline CRM</h1>
        <p className="text-text-dim">
          A Celoxis-inspired CRM for managing leads, activities, and property
          matches.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-[10px] bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_4px_rgba(59,130,246,0.18)]"
        >
          Go to Login
        </Link>
      </div>
    </main>
  );
}
