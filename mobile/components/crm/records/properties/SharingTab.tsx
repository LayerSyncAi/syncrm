/**
 * Share a property with an agent who has a matching lead (port of the web
 * PropertyShare panel). The sharer can cancel an active share.
 */
import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Field, Loading, Notice, Row, Section, Select, Sheet, type BadgeTone } from "../../../ui";
import { useRun } from "../../../../lib/useRun";
import { space } from "../../../../lib/theme";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "info" },
  closed_won: { label: "Won", tone: "success" },
  closed_lost: { label: "Lost", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function SharingTab({ propertyId, currentUserId }: { propertyId: Id<"properties">; currentUserId: Id<"users"> }) {
  const shares = useQuery(api.propertyShares.listForProperty, { propertyId });
  const cancel = useMutation(api.propertyShares.cancelShare);
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: space.md }}>
      <Button variant="secondary" icon="share-social-outline" title="Share with an agent" onPress={() => setOpen(true)} />
      <Section title="Shares">
        {shares === undefined ? (
          <Loading />
        ) : shares.length === 0 ? (
          <Body small muted>This property has not been shared with any agents yet.</Body>
        ) : (
          shares.map((s) => {
            const st = STATUS[s.status] ?? { label: s.status, tone: "neutral" as const };
            return (
              <Card key={s._id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Badge label={st.label} tone={st.tone} />
                  {s.status === "active" && s.sharedByUserId === currentUserId && (
                    <Button small variant="ghost" title="Cancel share" loading={busy} onPress={() => run(() => cancel({ shareId: s._id }), { success: "Share cancelled" })} />
                  )}
                </Row>
                <Body>
                  {s.sharedByName} to {s.sharedWithName}
                </Body>
                <Body small muted>Lead: {s.leadName}</Body>
                {s.notes ? <Body small muted>{s.notes}</Body> : null}
              </Card>
            );
          })
        )}
      </Section>
      <ShareSheet open={open} onClose={() => setOpen(false)} propertyId={propertyId} currentUserId={currentUserId} />
    </View>
  );
}

function ShareSheet({ open, onClose, propertyId, currentUserId }: { open: boolean; onClose: () => void; propertyId: Id<"properties">; currentUserId: Id<"users"> }) {
  const agents = useQuery(api.users.listForAssignment, open ? {} : "skip");
  const leads = useQuery(api.leads.list, open ? {} : "skip");
  const share = useMutation(api.propertyShares.shareProperty);
  const { busy, run } = useRun();
  const [agent, setAgent] = useState("");
  const [lead, setLead] = useState("");
  const [notes, setNotes] = useState("");

  const others = (agents ?? []).filter((a) => a._id !== currentUserId);
  const agentLeads = (leads?.items ?? []).filter((l) => l.ownerUserId === agent);

  const save = async () => {
    const ok = await run(async () => {
      await share({ propertyId, leadId: lead as Id<"leads">, sharedWithUserId: agent as Id<"users">, notes: notes.trim() || undefined });
      return true;
    }, { success: "Property shared" });
    if (ok) {
      setAgent("");
      setLead("");
      setNotes("");
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share property" footer={<Button title="Share property" onPress={save} loading={busy} disabled={!agent || !lead} />}>
      <Body small muted>Share this property with an agent who has a matching lead. They will be responsible for closing the deal.</Body>
      <Select
        label="Agent *"
        value={agent}
        options={others.map((a) => ({ value: a._id as string, label: a.name }))}
        onChange={(v) => {
          setAgent(v);
          setLead("");
        }}
        placeholder="Choose an agent"
      />
      {agent ? (
        agentLeads.length === 0 ? (
          <Notice tone="warning">This agent has no active leads. Choose a different agent.</Notice>
        ) : (
          <Select
            label="Lead *"
            value={lead}
            options={agentLeads.map((l) => ({
              value: l._id as string,
              label: `${l.fullName} · ${l.interestType === "buy" ? "Buying" : "Renting"} (${l.stageName})`,
            }))}
            onChange={setLead}
            placeholder="Choose a lead"
          />
        )
      ) : null}
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Any notes about this share" />
    </Sheet>
  );
}
