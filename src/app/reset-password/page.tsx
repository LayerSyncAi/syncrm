"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent, useEffect, Suspense } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle,
  Key,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { authToasts } from "@/lib/toast";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const tokenValidation = useQuery(
    api.passwordReset.validateResetToken,
    token ? { token } : "skip"
  );
  const resetPassword = useAction(api.passwordReset.resetPassword);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle missing token
  if (!token) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-xl font-semibold">Invalid link</h1>
                <p className="text-sm text-text-muted">
                  This password reset link is invalid or missing.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full">Request new reset link</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Loading token validation
  if (tokenValidation === undefined) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Validating reset link...</p>
        </div>
      </main>
    );
  }

  // Invalid or expired token
  if (!tokenValidation.valid) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-xl font-semibold">Link expired</h1>
                <p className="text-sm text-text-muted">
                  {tokenValidation.error ||
                    "This password reset link is invalid or has expired."}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full">Request new reset link</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword({ token, newPassword: password });
      if (result.success) {
        setIsSuccess(true);
        authToasts.passwordResetSuccess();
      } else {
        setError(result.error || "Failed to reset password");
        authToasts.passwordResetError(result.error);
      }
    } catch (err) {
      console.error("Reset error:", err);
      setError("Something went wrong. Please try again.");
      authToasts.passwordResetError();
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex flex-col items-center space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center space-y-1">
                <h1 className="text-xl font-semibold">Password reset!</h1>
                <p className="text-sm text-text-muted">
                  Your password has been successfully reset. You can now sign in
                  with your new password.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/10">
              <Key className="h-6 w-6 text-primary-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-text-dim">
                SynCRM
              </p>
              <h1 className="text-xl font-semibold">Set new password</h1>
              <p className="text-sm text-text-muted">
                Your new password must be at least 8 characters.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted">
                New Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>

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
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset password"
              )}
            </Button>

            <Link href="/login">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to login
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
