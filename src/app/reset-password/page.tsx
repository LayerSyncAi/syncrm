"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent, Suspense } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import {
  AuthLayout,
  RequiredLabel,
  containerVariants,
  itemVariants,
} from "@/components/auth/auth-layout";

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

  // Missing token
  if (!token) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring" as const,
            stiffness: 200,
            damping: 20,
          }}
          className="flex flex-col items-center text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mb-6">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-text mb-2">Invalid link</h1>
          <p className="text-sm text-text-muted max-w-xs">
            This password reset link is invalid or missing.
          </p>
          <div className="w-full mt-8">
            <Link href="/forgot-password">
              <Button className="w-full h-11 font-semibold">
                Request new reset link
              </Button>
            </Link>
          </div>
        </motion.div>
      </AuthLayout>
    );
  }

  // Loading token validation
  if (tokenValidation === undefined) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Validating reset link...</p>
        </div>
      </AuthLayout>
    );
  }

  // Expired / invalid token
  if (!tokenValidation.valid) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring" as const,
            stiffness: 200,
            damping: 20,
          }}
          className="flex flex-col items-center text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mb-6">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="text-3xl font-bold text-text mb-2">Link expired</h1>
          <p className="text-sm text-text-muted max-w-xs">
            {tokenValidation.error ||
              "This password reset link is invalid or has expired."}
          </p>
          <div className="w-full mt-8">
            <Link href="/forgot-password">
              <Button className="w-full h-11 font-semibold">
                Request new reset link
              </Button>
            </Link>
          </div>
        </motion.div>
      </AuthLayout>
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
    <AuthLayout>
      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{
              type: "spring" as const,
              stiffness: 200,
              damping: 20,
            }}
            className="flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring" as const,
                stiffness: 300,
                damping: 20,
                delay: 0.1,
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-6"
            >
              <CheckCircle className="h-7 w-7 text-green-600" />
            </motion.div>
            <h1 className="text-3xl font-bold text-text mb-2">
              Password reset!
            </h1>
            <p className="text-sm text-text-muted max-w-xs">
              Your password has been successfully reset. You can now sign in with
              your new password.
            </p>
            <div className="w-full mt-8">
              <Link href="/login">
                <Button className="w-full h-11 font-semibold">Sign in</Button>
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.5 }}
              onAnimationComplete={() => setShake(false)}
            >
              <motion.div
                variants={containerVariants}
                initial="initial"
                animate="animate"
              >
                {/* Icon */}
                <motion.div
                  variants={itemVariants}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/10 mb-6"
                >
                  <Key className="h-6 w-6 text-primary-600" />
                </motion.div>

                {/* Header */}
                <motion.div variants={itemVariants} className="mb-2">
                  <h1 className="text-3xl font-bold text-text">
                    Set new password
                  </h1>
                </motion.div>
                <motion.div variants={itemVariants} className="mb-8">
                  <p className="text-sm text-text-muted">
                    Your new password must be at least 8 characters.
                  </p>
                </motion.div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <motion.div variants={itemVariants} className="space-y-1.5">
                    <RequiredLabel>New Password</RequiredLabel>
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
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
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
                  </motion.div>

                  <motion.div variants={itemVariants} className="space-y-1.5">
                    <RequiredLabel>Confirm Password</RequiredLabel>
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
                        aria-label={
                          showConfirmPassword
                            ? "Hide password"
                            : "Show password"
                        }
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
                  </motion.div>

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

                  <motion.div variants={itemVariants}>
                    <Button
                      className="w-full h-11 font-semibold"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        "Reset password"
                      )}
                    </Button>
                  </motion.div>

                  <motion.div variants={itemVariants}>
                    <Link href="/login">
                      <Button variant="ghost" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to login
                      </Button>
                    </Link>
                  </motion.div>
                </form>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        </AuthLayout>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
