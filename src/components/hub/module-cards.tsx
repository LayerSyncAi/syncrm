"use client";

import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODULES, MODULE_ORDER, UPCOMING_MODULES, type ModuleKey } from "@/config/modules";
import { cn } from "@/lib/utils";
import type { HubFigure } from "../../../convex/lib/modules";

/**
 * The Hub's product launcher. Modules the user can open are cards with their
 * headline figures inside (two on a phone, up to four on a wider screen), so
 * the Hub shows each figure once. Modules the agency doesn't have, or the
 * user's role can't open, sit in a quiet row underneath.
 */
export function ModuleCards({
  myModules,
  enabledModules,
  isAdmin,
  figures = {},
}: {
  myModules: ModuleKey[];
  enabledModules: ModuleKey[];
  isAdmin: boolean;
  figures?: Partial<Record<ModuleKey, HubFigure[] | null | undefined>>;
}) {
  const open = MODULE_ORDER.filter((k) => myModules.includes(k));
  const closed = MODULE_ORDER.filter((k) => !myModules.includes(k));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {open.map((key) => {
          const def = MODULES[key];
          const Icon = def.icon;
          const figs = (figures[key] ?? []).slice(0, 4);
          return (
            <Link key={key} href={def.homeHref} className="group block">
              <Card className="flex h-full flex-col gap-3 p-4 transition-transform duration-200 group-hover:-translate-y-0.5 sm:gap-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-[14px]", def.accent)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-h3">{def.name}</h3>
                  <p className="hidden text-xs text-text-muted sm:block">{def.tagline}</p>
                </div>
                {figs.length > 0 ? (
                  <dl className="mt-auto grid gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-2 sm:pt-4">
                    {figs.map((f, i) => (
                      <div key={f.label} className={cn("min-w-0", i >= 2 && "hidden sm:block")}>
                        <dd
                          className={cn(
                            "break-words text-lg font-light leading-tight tracking-[-0.03em] tabular-nums sm:text-xl",
                            f.tone === "warning" && "text-[var(--status-warning-fg)]"
                          )}
                        >
                          {f.value}
                        </dd>
                        <dt className="truncate text-xs text-text-muted" title={f.label}>
                          {f.label}
                        </dt>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-auto hidden text-sm text-text-muted sm:block">{def.description}</p>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {(closed.length > 0 || UPCOMING_MODULES.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {closed.map((key) => {
            const def = MODULES[key];
            const Icon = def.icon;
            const onPlan = enabledModules.includes(key);
            return (
              <div key={key} className="flex items-center gap-3 rounded-[16px] border border-dashed border-border-strong px-4 py-3 text-text-muted">
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{def.name}</p>
                  <p className="truncate text-xs">
                    {onPlan ? "Your role can't open this. Ask your admin." : isAdmin ? "Ask LayerSync to switch this on" : def.tagline}
                  </p>
                </div>
                {onPlan ? <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Badge variant="neutral">Not on your plan</Badge>}
              </div>
            );
          })}
          {UPCOMING_MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.name} className="flex items-center gap-3 rounded-[16px] border border-dashed border-border-strong px-4 py-3 text-text-muted">
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{m.name}</p>
                  <p className="truncate text-xs">{m.tagline}</p>
                </div>
                <Badge variant="neutral">Coming soon</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
