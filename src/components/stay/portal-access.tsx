"use client";

import * as React from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";

const STATUS: Record<"none" | "invited" | "active" | "deactivated", { label: string; variant: "neutral" | "warning" | "success" | "danger" }> = {
  none: { label: "No portal login", variant: "neutral" },
  invited: { label: "Invited", variant: "warning" },
  active: { label: "Portal active", variant: "success" },
  deactivated: { label: "Portal switched off", variant: "danger" },
};

/**
 * Portal login status for a landlord or tenant, with invite, re-send and
 * switch-off actions (HB-13). The invite emails a one-off password.
 */
export function PortalAccess({
  contactId,
  kind,
  canManage,
}: {
  contactId: Id<"contacts">;
  kind: "landlord" | "tenant";
  canManage: boolean;
}) {
  const account = useQuery(api.portal.accounts.getForContact, { contactId });
  const invite = useAction(api.portal.accounts.invite);
  const revoke = useMutation(api.portal.accounts.revoke);
  const [busy, setBusy] = React.useState(false);

  if (account === undefined) return null;
  if (account === null) return null;
  const s = STATUS[account.status];

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      animatedToast.success(await fn());
    } catch (e) {
      animatedToast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={s.variant} className="px-2 py-0.5">
        {s.label}
      </Badge>
      {canManage && (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !account.email}
            title={account.email ? undefined : "Add an email address first"}
            onClick={() =>
              run(async () => {
                const r = await invite({ contactId, kind });
                return r.emailed ? `Portal invite sent to ${r.email}` : `Login created, but the email to ${r.email} failed`;
              })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {account.status === "none" ? "Invite to portal" : "Send new login"}
          </Button>
          {(account.status === "active" || account.status === "invited") && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await revoke({ contactId });
                  return "Portal login switched off";
                })
              }
            >
              Switch off
            </Button>
          )}
        </>
      )}
    </div>
  );
}
