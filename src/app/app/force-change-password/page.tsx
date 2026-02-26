"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2 } from "lucide-react";
import { authToasts } from "@/lib/toast";

export default function ForceChangePasswordPage() {
  const router = useRouter();
  const forceChangePassword = useAction(api.users.forceChangePassword);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const result = await forceChangePassword({ newPassword: password });
      if (result.success) {
        authToasts.forceChangeSuccess();
        router.replace("/app/dashboard");
      } else {
        setError(result.error || "Failed to change password");
        authToasts.forceChangeFailed(result.error);
      }
    } catch (err) {
      console.error("Password change error:", err);
      setError("Something went wrong. Please try again.");
      authToasts.forceChangeFailed();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-content-bg flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-md"
      >
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600/10">
              <KeyRound className="h-6 w-6 text-primary-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-text-dim">
                SynCRM
              </p>
              <h1 className="text-xl font-semibold">Change your password</h1>
              <p className="text-sm text-text-muted">
                You must change your password before continuing. Your new
                password must be at least 8 characters.
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
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted">
                Confirm Password
              </label>
              <Input
                type="password"
                placeholder="Retype new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3 overflow-hidden"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing password...
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  );
}
