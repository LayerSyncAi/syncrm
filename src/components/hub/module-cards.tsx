"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODULES, MODULE_ORDER, UPCOMING_MODULES, type ModuleKey } from "@/config/modules";
import { cn } from "@/lib/utils";

/**
 * One card per module: open, not on the plan, or coming soon. A module the org
 * has but the user's role cannot open is shown as "Ask your admin".
 */
export function ModuleCards({
  myModules,
  enabledModules,
  isAdmin,
}: {
  myModules: ModuleKey[];
  enabledModules: ModuleKey[];
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {MODULE_ORDER.map((key) => {
        const def = MODULES[key];
        const Icon = def.icon;
        const canOpen = myModules.includes(key);
        const onPlan = enabledModules.includes(key);
        if (canOpen) {
          return (
            <Link key={key} href={def.homeHref} className="group block">
              <Card className="flex h-full flex-col gap-3 p-5 transition-transform duration-200 group-hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-[12px]", def.accent)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-h3">{def.name}</h3>
                    <p className="text-xs text-text-muted">{def.tagline}</p>
                  </div>
                </div>
                <p className="flex-1 text-sm text-text-muted">{def.description}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink">
                  Open
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Card>
            </Link>
          );
        }
        return (
          <Card key={key} className="flex h-full flex-col gap-3 p-5 opacity-70">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-surface-2 text-text-muted">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-h3">{def.name}</h3>
                <p className="text-xs text-text-muted">{def.tagline}</p>
              </div>
            </div>
            <p className="flex-1 text-sm text-text-muted">{def.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {onPlan ? (
                <span>Your role cannot open this. Ask your admin.</span>
              ) : (
                <>
                  <Badge variant="neutral">Not on your plan</Badge>
                  {isAdmin && <span>Ask LayerSync to switch this on</span>}
                </>
              )}
            </div>
          </Card>
        );
      })}
      {UPCOMING_MODULES.map((m) => {
        const Icon = m.icon;
        return (
          <Card key={m.name} className="flex h-full flex-col gap-3 border-dashed p-5 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-surface-2 text-text-muted">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-h3">{m.name}</h3>
                <p className="text-xs text-text-muted">{m.tagline}</p>
              </div>
            </div>
            <div>
              <Badge variant="neutral">Coming soon</Badge>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
