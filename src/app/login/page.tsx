"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { authToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AuthLayout,
  RequiredLabel,
  containerVariants,
  itemVariants,
} from "@/components/auth/auth-layout";

type AuthMode = "signIn" | "signUp";
type SubmitState = "idle" | "submitting" | "success";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isLoading: authLoading, isSessionAuthenticated } = useAuth();
  const setupOrganization = useMutation(api.organizations.setupOrganization);

  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [shake, setShake] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[LoginPage] Auth state:", {
        authLoading,
        isSessionAuthenticated,
      });
    }
  }, [authLoading, isSessionAuthenticated]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitState("submitting");

    try {
      if (mode === "signUp") {
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setSubmitState("idle");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setSubmitState("idle");
          return;
        }
        if (!name.trim()) {
          setError("Name is required");
          setSubmitState("idle");
          return;
        }
        if (!orgName.trim()) {
          setError("Organization name is required");
          setSubmitState("idle");
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
        console.log("[LoginPage] Calling signIn with flow:", mode);
      }

      await signIn("password", formData);

      if (mode === "signUp") {
        await setupOrganization({ orgName: orgName.trim() });
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[LoginPage] signIn completed successfully");
        console.log("[LoginPage] Navigating to /app/dashboard");
      }

      setSubmitState("success");
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.replace("/app/dashboard");
    } catch (err) {
      console.error("[LoginPage] Auth error:", err);

      let errorMessage: string;
      if (err instanceof Error) {
        const message = err.message.toLowerCase();
        if (
          message.includes("invalid") ||
          message.includes("password") ||
          message.includes("credentials")
        ) {
          errorMessage = "Invalid email or password";
        } else if (message.includes("exists") || message.includes("already")) {
          errorMessage = "An account with this email already exists";
        } else if (mode === "signIn") {
          errorMessage = "Invalid email or password";
        } else {
          errorMessage = "Could not create account. Please try again.";
        }
      } else if (mode === "signIn") {
        errorMessage = "Invalid email or password";
      } else {
        errorMessage = "Could not create account. Email may already be in use.";
      }

      setError(errorMessage);
      if (mode === "signIn") {
        authToasts.loginFailed(errorMessage);
      } else {
        authToasts.signupFailed(errorMessage);
      }
      setSubmitState("idle");
      setShake(true);
    }
  };

  if (authLoading) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </AuthLayout>
    );
  }

  const isDisabled = submitState !== "idle";

  return (
    <AuthLayout>
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
          {/* Header */}
          <motion.div variants={itemVariants} className="mb-2">
            <h1 className="text-3xl font-bold text-text">
              {mode === "signIn" ? "Sign in to your account" : "Create your account"}
            </h1>
          </motion.div>
          <motion.div variants={itemVariants} className="mb-8">
            <p className="text-sm text-text-muted">
              {mode === "signIn"
                ? "Welcome back! Enter your credentials to access your pipeline."
                : "Register your organization and create an admin account."}
            </p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence>
              {mode === "signUp" && (
                <motion.div
                  key="signup-fields-top"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden space-y-5"
                >
                  <div className="space-y-1.5">
                    <RequiredLabel>Organization Name</RequiredLabel>
                    <Input
                      type="text"
                      placeholder="Acme Realty"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      disabled={isDisabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <RequiredLabel>Full Name</RequiredLabel>
                    <Input
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={isDisabled}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div variants={itemVariants} className="space-y-1.5">
              <RequiredLabel>Email</RequiredLabel>
              <Input
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isDisabled}
              />
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-1.5">
              <RequiredLabel>Password</RequiredLabel>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isDisabled}
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
            </motion.div>

            <AnimatePresence>
              {mode === "signUp" && (
                <motion.div
                  key="signup-confirm-pw"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <RequiredLabel>Confirm Password</RequiredLabel>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={isDisabled}
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
              <motion.button
                type="submit"
                disabled={isDisabled}
                className={cn(
                  "relative inline-flex h-11 w-full items-center justify-center rounded-[10px] text-sm font-semibold text-white transition-colors duration-300 disabled:cursor-not-allowed overflow-hidden",
                  submitState === "success"
                    ? "bg-green-500"
                    : "bg-primary-600 hover:bg-primary shadow-[0_0_0_4px_rgba(236,164,0,0.12)] disabled:opacity-50"
                )}
                whileTap={
                  submitState === "idle" ? { scale: 0.98 } : undefined
                }
              >
                <AnimatePresence mode="wait">
                  {submitState === "idle" && (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {mode === "signIn" ? "Sign in" : "Create account"}
                    </motion.span>
                  )}
                  {submitState === "submitting" && (
                    <motion.span
                      key="submitting"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center"
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mode === "signIn"
                        ? "Signing in..."
                        : "Creating account..."}
                    </motion.span>
                  )}
                  {submitState === "success" && (
                    <motion.span
                      key="success"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "spring" as const,
                        stiffness: 300,
                        damping: 20,
                      }}
                    >
                      <Check className="h-5 w-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="flex items-center justify-between text-sm"
            >
              {mode === "signIn" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signUp");
                      setError(null);
                    }}
                    disabled={isDisabled}
                    className="text-primary-600 font-medium hover:underline disabled:opacity-50"
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
                  disabled={isDisabled}
                  className="text-primary-600 font-medium hover:underline disabled:opacity-50"
                >
                  Already have an account? Sign in
                </button>
              )}
            </motion.div>
          </form>
        </motion.div>
      </motion.div>
    </AuthLayout>
  );
}
