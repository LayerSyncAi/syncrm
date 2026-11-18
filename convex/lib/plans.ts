/**
 * Organisation plans for the pilot. One plan per organisation:
 *
 * - trial        Free trial until `trialEndsAt` (LayerSync can add days).
 * - beta         Beta tester, no end date.
 * - standard     Paid, the normal SyncEstate look.
 * - white_label  Paid, the agency's own logo and colours (organizations.whiteLabel).
 *
 * Paid plans decide the look; trial and beta organisations can be shown
 * either way (a trial can preview its own branding). Nothing is locked when a
 * trial ends: admins see a notice and LayerSync decides what happens next.
 *
 * Pure, so the Platform screens and the server share the same rules.
 */

export const PLAN_KEYS = ["trial", "beta", "standard", "white_label"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_LABELS: Record<PlanKey, string> = {
  trial: "Free trial",
  beta: "Beta tester",
  standard: "Standard",
  white_label: "White label",
};

export const PLAN_DESCRIPTIONS: Record<PlanKey, string> = {
  trial: "Free for a set number of days. You can add days any time.",
  beta: "Helping us test during the pilot. No end date.",
  standard: "Paid subscription with the SyncEstate look.",
  white_label: "Paid subscription with their own logo and colours.",
};

export const DAY_MS = 86_400_000;
export const TRIAL_LENGTHS = [14, 30, 60, 90] as const;
export const DEFAULT_TRIAL_DAYS = 30;
/** Admins start seeing the "trial ends soon" notice this many days before. */
export const TRIAL_WARNING_DAYS = 7;
export const MAX_TRIAL_EXTENSION_DAYS = 365;

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

export function isPaidPlan(plan: PlanKey | null | undefined): boolean {
  return plan === "standard" || plan === "white_label";
}

/** The white-label switch a plan implies: paid plans decide it, trial and beta keep it. */
export function whiteLabelForPlan(plan: PlanKey, current: boolean): boolean {
  if (plan === "white_label") return true;
  if (plan === "standard") return false;
  return current;
}

/** The new end date after adding `days` to a trial (from today if it already ended). */
export function extendTrialEnd(trialEndsAt: number | undefined, days: number, now: number): number {
  return Math.max(trialEndsAt ?? now, now) + days * DAY_MS;
}

export type PlanTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface PlanStatus {
  plan: PlanKey | null;
  /** "Free trial", "White label", "No plan set"… */
  label: string;
  /** "12 days left", "Ends today", "Ended 3 days ago", or "" */
  detail: string;
  tone: PlanTone;
  /** Whole days until a trial ends (negative once it has ended); null when not on trial. */
  daysLeft: number | null;
  expired: boolean;
  /** True when a trial admin should see the reminder. */
  endingSoon: boolean;
}

export function planStatus(org: { plan?: PlanKey | null; trialEndsAt?: number | null }, now: number): PlanStatus {
  const plan = org.plan ?? null;
  if (!plan) {
    return { plan: null, label: "No plan set", detail: "", tone: "neutral", daysLeft: null, expired: false, endingSoon: false };
  }
  if (plan !== "trial") {
    return {
      plan,
      label: PLAN_LABELS[plan],
      detail: "",
      tone: plan === "beta" ? "info" : "success",
      daysLeft: null,
      expired: false,
      endingSoon: false,
    };
  }
  if (!org.trialEndsAt) {
    return { plan, label: PLAN_LABELS.trial, detail: "No end date", tone: "info", daysLeft: null, expired: false, endingSoon: false };
  }
  const msLeft = org.trialEndsAt - now;
  const expired = msLeft <= 0;
  const daysLeft = expired ? -Math.floor(-msLeft / DAY_MS) : Math.ceil(msLeft / DAY_MS);
  let detail: string;
  if (expired) {
    const ago = Math.abs(daysLeft);
    detail = ago === 0 ? "Ended today" : `Ended ${ago} ${ago === 1 ? "day" : "days"} ago`;
  } else if (daysLeft <= 1 && msLeft < DAY_MS) {
    detail = "Ends today";
  } else {
    detail = `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
  }
  const endingSoon = expired || daysLeft <= TRIAL_WARNING_DAYS;
  return {
    plan,
    label: PLAN_LABELS.trial,
    detail,
    tone: expired ? "danger" : endingSoon ? "warning" : "info",
    daysLeft,
    expired,
    endingSoon,
  };
}
