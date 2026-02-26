"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle, Loader2, Mail } from "lucide-react";
import { authToasts } from "@/lib/toast";

const cardSpring = { type: "spring" as const, stiffness: 200, damping: 20 };

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
    <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      {/* #7: AnimatePresence crossfade between form and success */}
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
                    <h1 className="text-xl font-semibold">Check your email</h1>
                    <p className="text-sm text-text-muted">
                      If an account exists for <strong>{email}</strong>, we&apos;ve
                      sent password reset instructions.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-text-dim text-center">
                  Didn&apos;t receive the email? Check your spam folder or try again
                  with a different email.
                </p>
                <div className="flex flex-col gap-2">
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
                      <Mail className="h-6 w-6 text-primary-600" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] text-text-dim">
                        SynCRM
                      </p>
                      <h1 className="text-xl font-semibold">Forgot password?</h1>
                      <p className="text-sm text-text-muted">
                        No worries, we&apos;ll send you reset instructions.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
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
                        disabled={isLoading}
                      />
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
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
