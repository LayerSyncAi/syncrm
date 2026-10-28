/**
 * Portal login status for a landlord or tenant, with invite, re-send and
 * switch-off actions. The invite emails a one-off password.
 */
import { Alert } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Row, type BadgeTone } from "../ui";
import { confirm, useRun } from "../../lib/useRun";

const STATUS: Record<"none" | "invited" | "active" | "deactivated", { label: string; tone: BadgeTone }> = {
  none: { label: "No portal login", tone: "neutral" },
  invited: { label: "Invited", tone: "warning" },
  active: { label: "Portal active", tone: "success" },
  deactivated: { label: "Portal switched off", tone: "danger" },
};

export function PortalAccess({ contactId, kind, canManage }: { contactId: Id<"contacts">; kind: "landlord" | "tenant"; canManage: boolean }) {
  const account = useQuery(api.portal.accounts.getForContact, { contactId });
  const invite = useAction(api.portal.accounts.invite);
  const revoke = useMutation(api.portal.accounts.revoke);
  const { busy, run } = useRun();

  if (!account) return null;
  const s = STATUS[account.status];

  const sendInvite = async () => {
    const r = await run(() => invite({ contactId, kind }));
    if (r) Alert.alert(r.emailed ? `Portal invite sent to ${r.email}` : `Login created, but the email to ${r.email} failed`);
  };
  const switchOff = async () => {
    if (!(await confirm("Switch off portal login?", "They will no longer be able to sign in to the portal.", "Switch off", true))) return;
    await run(() => revoke({ contactId }), { success: "Portal login switched off" });
  };

  return (
    <>
      <Badge tone={s.tone} label={s.label} />
      {canManage && (
        <Row style={{ flexWrap: "wrap" }}>
          <Button
            small
            variant="secondary"
            icon="key-outline"
            title={account.status === "none" ? "Invite to portal" : "Send new login"}
            onPress={sendInvite}
            loading={busy}
            disabled={!account.email}
          />
          {(account.status === "active" || account.status === "invited") && <Button small variant="secondary" title="Switch off" onPress={switchOff} disabled={busy} />}
        </Row>
      )}
      {canManage && !account.email && (
        <Body small muted>
          Add an email address first to invite them to the portal.
        </Body>
      )}
    </>
  );
}
