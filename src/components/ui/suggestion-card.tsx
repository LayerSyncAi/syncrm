import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A suggested next step worked out from the data, with one button that does
 * it. The tinted green card is reserved for these, so they stand out.
 */
export function SuggestionCard({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[20px] border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-primary-soft p-5",
        className
      )}
    >
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-card-bg px-3 py-1 text-xs font-medium text-text">
        <Sparkles className="h-3.5 w-3.5 text-primary-ink" aria-hidden="true" />
        Smart suggestion
      </span>
      <div className="text-[15px] leading-relaxed text-text">{children}</div>
      {action}
    </div>
  );
}
