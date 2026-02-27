"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle, Loader2, Mail } from "lucide-react";
import { authToasts } from "@/lib/toast";
import { AuthLayout, RequiredLabel } from "@/components/auth/auth-layout";

export default function ForgotPasswordPage() {
  const requestReset = useAction(api.passwordReset.requestPasswordReset);

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const baseUrl = window.location.origin;
      await requestReset({ email, baseUrl });
      setIsSuccess(true);
      authToasts.passwordResetRequested(email);
    } catch (err) {
      console.error("Reset request error:", err);
      setError("Something went wrong. Please try again.");
      authToasts.passwordResetFailed();
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
          >
            <div className="flex flex-col items-center text-center">
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
                Check your email
              </h1>
              <p className="text-sm text-text-muted max-w-xs">
                If an account exists for <strong>{email}</strong>, we&apos;ve
                sent password reset instructions.
              </p>
              <p className="text-sm text-text-dim mt-4 max-w-xs">
                Didn&apos;t receive the email? Check your spam folder or try
                again with a different email.
              </p>
              <div className="flex flex-col gap-2 w-full mt-8">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsSuccess(false);
                    setEmail("");
                  }}
                >
                  Try another email
                </Button>
                <Link href="/login">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to login
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <motion.div
              animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.5 }}
              onAnimationComplete={() => setShake(false)}
            >
              {/* Icon */}
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/10 mb-6">
                <Mail className="h-6 w-6 text-primary-600" />
              </div>

              {/* Header */}
              <h1 className="text-3xl font-bold text-text mb-2">
                Forgot password?
              </h1>
              <p className="text-sm text-text-muted mb-8">
                No worries, we&apos;ll send you reset instructions.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <RequiredLabel>Email</RequiredLabel>
                  <Input
                    type="email"
                    placeholder="you@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

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

                <Button
                  className="w-full h-11 font-semibold"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
