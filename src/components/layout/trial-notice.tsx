"use client";

import { useState } from "react";
import { Clock, X } from "lucide-react";
import { planStatus, type PlanKey } from "../../../convex/lib/plans";
import { useNow } from "@/hooks/useNow";
import { useOrgBrand } from "@/components/providers/org-brand-provider";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "support@layersyncai.com";
const DISMISS_KEY = "trial-notice-dismissed";

/**
 * A quiet reminder for an agency's admins when their free trial ends within
 * a week or has ended. Nothing is locked: the notice only says who to talk
 * to. Dismissed for the rest of the browser session.
 */
export function TrialNotice({ plan, trialEndsAt }: { plan?: PlanKey | null; trialEndsAt?: number | null }) {
  const now = useNow();
  const { productName } = useOrgBrand();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === String(trialEndsAt ?? "");
    } catch {
      return false;
    }
  });

  const status = planStatus({ plan: plan ?? null, trialEndsAt: trialEndsAt ?? null }, now);
  if (status.plan !== "trial" || !status.endingSoon || !trialEndsAt || dismissed) return null;

  const date = new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const message = status.expired
    ? `Your free trial ended on ${date}. Your data is safe.`
    : `Your free trial ends ${status.daysLeft === 1 || status.detail === "Ends today" ? "today" : `in ${status.daysLeft} days`} (${date}).`;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 border-b px-4 py-2.5 text-sm sm:items-center sm:px-6",
        status.expired
          ? "border-[var(--status-danger-bg)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
          : "border-[var(--status-warning-bg)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
      )}
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {message} To keep using {productName}, contact LayerSync at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, String(trialEndsAt));
          } catch {
            // Private mode: it just comes back next page load.
          }
        }}
        className="shrink-0 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Hide this reminder"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
