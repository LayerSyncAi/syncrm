"use client";

import { Clock, CreditCard, FlaskConical, Palette } from "lucide-react";
import {
  PLAN_DESCRIPTIONS,
  PLAN_KEYS,
  PLAN_LABELS,
  planStatus,
  type PlanKey,
} from "../../../../convex/lib/plans";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";

const PLAN_ICONS: Record<PlanKey, typeof Clock> = {
  trial: Clock,
  beta: FlaskConical,
  standard: CreditCard,
  white_label: Palette,
};

/** Four plain choices, as cards: what each plan is, in one line. */
export function PlanPicker({
  value,
  onChange,
  disabled,
}: {
  value: PlanKey | null;
  onChange: (plan: PlanKey) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Plan" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PLAN_KEYS.map((key) => {
        const Icon = PLAN_ICONS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${PLAN_LABELS[key]}. ${PLAN_DESCRIPTIONS[key]}`}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors disabled:opacity-60",
              selected
                ? "border-primary-600 bg-primary-soft ring-2 ring-[var(--primary-glow)]"
                : "border-border bg-card-bg hover:bg-surface-2"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
                selected ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text-muted"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">
                {PLAN_LABELS[key]}
              </span>
              <span className="block text-xs text-text-muted">{PLAN_DESCRIPTIONS[key]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Free trial · 12 days left", coloured by urgency. */
export function PlanBadge({ plan, trialEndsAt }: { plan: PlanKey | null; trialEndsAt: number | null }) {
  const now = useNow();
  const status = planStatus({ plan, trialEndsAt }, now);
  return (
    <Badge variant={status.tone}>
      {status.label}
      {status.detail ? ` · ${status.detail}` : ""}
    </Badge>
  );
}
