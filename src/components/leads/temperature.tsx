import { Flame, Snowflake, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPERATURE_LABELS, temperatureOf } from "@/lib/temperature";

export { temperatureOf };
export type { Temperature } from "@/lib/temperature";

const meta = {
  hot: { label: TEMPERATURE_LABELS.hot, Icon: Flame, cls: "bg-[var(--hot-soft)] text-[var(--hot-ink)]" },
  warm: { label: TEMPERATURE_LABELS.warm, Icon: Sun, cls: "bg-[var(--warm-soft)] text-[var(--warm-ink)]" },
  cold: { label: TEMPERATURE_LABELS.cold, Icon: Snowflake, cls: "bg-[var(--cold-soft)] text-[var(--cold-ink)]" },
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
