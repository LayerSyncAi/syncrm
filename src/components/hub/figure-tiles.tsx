"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HubFigure } from "../../../convex/lib/modules";

const toneClass: Record<NonNullable<HubFigure["tone"]>, string> = {
  default: "border-l-border-strong",
  good: "border-l-green-500",
  warning: "border-l-amber-500",
};

/** Headline figures for one module as a row of stat tiles. */
export function FigureTiles({ figures }: { figures: HubFigure[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map((f) => {
        const tile = (
          <Card className={cn("h-full border-l-4 p-4", toneClass[f.tone ?? "default"], f.href && "hover:border-primary/60")}>
            <p className="text-xs text-text-muted">{f.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{f.value}</p>
            {f.hint && <p className="mt-1 text-xs text-text-muted">{f.hint}</p>}
          </Card>
        );
        return f.href ? (
          <Link key={f.label} href={f.href} className="block">
            {tile}
          </Link>
        ) : (
          <div key={f.label}>{tile}</div>
        );
      })}
    </div>
  );
}
