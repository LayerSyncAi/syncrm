import { Flame, Snowflake, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type Temperature = "hot" | "warm" | "cold";

/** Same bands as the leads score filter: hot 70+, warm 40 to 69, cold below. */
export function temperatureOf(score: number | null | undefined): Temperature | null {
  if (score === null || score === undefined) return null;
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

const meta = {
  hot: { label: "Hot", Icon: Flame, cls: "bg-[var(--hot-soft)] text-[var(--hot-ink)]" },
  warm: { label: "Warm", Icon: Sun, cls: "bg-[var(--warm-soft)] text-[var(--warm-ink)]" },
  cold: { label: "Cold", Icon: Snowflake, cls: "bg-[var(--cold-soft)] text-[var(--cold-ink)]" },
} as const;

/**
 * A lead's temperature with its score, in one chip, so the list doesn't need
 * separate score and temperature columns.
 */
export function TemperatureChip({ score, className }: { score: number | null | undefined; className?: string }) {
  const t = temperatureOf(score);
  if (!t) {
    return (
      <span className={cn("inline-flex h-6 items-center rounded-full bg-surface-3 px-2.5 text-xs font-medium text-text-muted", className)}>
        Not scored
      </span>
    );
  }
  const { label, Icon, cls } = meta[t];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
      <span className="tabular-nums opacity-75">{score}</span>
    </span>
  );
}
