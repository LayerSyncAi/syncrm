"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent, useEffect, useRef } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

type AuthMode = "signIn" | "signUp";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRedirected = useRef(false);

  // Redirect to app if already authenticated
  // This handles both:
  // 1. User lands on login page while already authenticated
  // 2. User just signed in and auth state updated
  useEffect(() => {
    if (isAuthenticated && !authLoading && !hasRedirected.current) {
      if (process.env.NODE_ENV === "development") {
        console.log("[LoginPage] Redirecting to dashboard - user is authenticated");
      }
      hasRedirected.current = true;
      setIsRedirecting(true);
      router.replace("/app/dashboard");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "signUp") {
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setIsSubmitting(false);
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setIsSubmitting(false);
          return;
        }
        if (!name.trim()) {
          setError("Name is required");
          setIsSubmitting(false);
          return;
        }
      }

      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", password);
      formData.set("flow", mode);
      if (mode === "signUp") {
        formData.set("name", name);
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[LoginPage] Calling signIn...");
      }

      await signIn("password", formData);

      if (process.env.NODE_ENV === "development") {
        console.log("[LoginPage] signIn completed - waiting for auth state update");
      }

      // Don't navigate here - let the useEffect handle redirect once isAuthenticated becomes true
      // This avoids the race condition where we navigate before auth state is updated
      // Keep isSubmitting true to show loading state until redirect happens
    } catch (err) {
      console.error("Auth error:", err);
      if (mode === "signIn") {
        setError("Invalid email or password");
      } else {
        setError("Could not create account. Email may already be in use.");
      }
      setIsSubmitting(false);
    }
    // Note: Don't reset isSubmitting in finally - we want to keep showing loading until redirect
  };

  // Show loading while checking initial auth state
  if (authLoading) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Checking authentication...</p>
        </div>
      </main>
    );
  }

  // Show loading while redirect is in progress (user is authenticated)
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-text-dim">
              SynCRM
            </p>
            <h1 className="text-xl font-semibold">
              {mode === "signIn" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-text-muted">
              {mode === "signIn"
                ? "Use your credentials to access the pipeline."
                : "Register for a new account."}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signUp" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted">
                  Full Name
                </label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted">
                Email
              </label>
              <Input
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted">
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isSubmitting}
              />
            </div>
            {mode === "signUp" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted">
                  Confirm Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isSubmitting}
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-text-dim">
              {mode === "signIn" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signUp");
                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className="text-primary-600 hover:underline disabled:opacity-50"
                  >
                    Create an account
                  </button>
                  <Link
                    href="/forgot-password"
                    className="text-text-muted hover:underline"
                  >
                    Forgot password?
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signIn");
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="text-primary-600 hover:underline disabled:opacity-50"
                >
                  Already have an account? Sign in
                </button>
              )}
            </div>

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "signIn" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "signIn" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
