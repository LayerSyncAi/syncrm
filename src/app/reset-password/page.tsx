"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent, Suspense } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { authToasts } from "@/lib/toast";

const cardSpring = { type: "spring" as const, stiffness: 200, damping: 20 };

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
  const [shake, setShake] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Handle missing token — entrance animation
  if (!token) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={cardSpring}
          className="w-full max-w-md"
        >
          <Card>
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
        </motion.div>
      </main>
    );
  }

  // Loading token validation
  if (tokenValidation === undefined) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Validating reset link...</p>
        </motion.div>
      </main>
    );
  }

  // Invalid or expired token — entrance animation
  if (!tokenValidation.valid) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={cardSpring}
          className="w-full max-w-md"
        >
          <Card>
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
        </motion.div>
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
        setShake(true);
      }
    } catch (err) {
      console.error("Reset error:", err);
      setError("Something went wrong. Please try again.");
      authToasts.passwordResetError();
      setShake(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      {/* #7: Crossfade between form and success */}
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={cardSpring}
            className="w-full max-w-md"
          >
            <Card>
              <CardHeader>
                <div className="flex flex-col items-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
                  >
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </motion.div>
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
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={cardSpring}
            className="w-full max-w-md"
          >
            {/* #10: Shake on server error */}
            <motion.div
              animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.5 }}
              onAnimationComplete={() => setShake(false)}
            >
              <Card>
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
                    {/* #11: Password with visibility toggle */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-muted">
                        New Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          disabled={isLoading}
                          className="pr-10"
                        />
                        <motion.button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted"
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          <motion.div
                            key={showPassword ? "visible" : "hidden"}
                            initial={{ scale: 0.8 }}
                            animate={{ scale: [0.8, 1.1, 1] }}
                            transition={{ duration: 0.2 }}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </motion.div>
                        </motion.button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-text-muted">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={8}
                          disabled={isLoading}
                          className="pr-10"
                        />
                        <motion.button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted"
                          tabIndex={-1}
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          <motion.div
                            key={showConfirmPassword ? "visible" : "hidden"}
                            initial={{ scale: 0.8 }}
                            animate={{ scale: [0.8, 1.1, 1] }}
                            transition={{ duration: 0.2 }}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </motion.div>
                        </motion.button>
                      </div>
                    </div>

                    {/* #10: Error slides in */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                            {error}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
