/**
 * Move a lead to another pipeline stage. Closing stages (won or lost) ask for
 * the reason first, and a won deal for its value and currency, so commissions
 * are created in one step. After a win or "Under contract" the contact's other
 * open leads can be marked lost, as on the website.
 */
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Field, Ionicons, Loading, Notice, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { parseMoney, triggersSiblingReview, interestLabel, type StageLite } from "../../../lib/crm/leads/helpers";
import { CheckRow, ConfirmPhrase, MoneyField } from "./bits";
import { colors, font, space } from "../../../lib/theme";

export type MovableLead = {
  _id: Id<"leads">;
  contactId: Id<"contacts">;
  fullName: string;
  stageId: Id<"pipelineStages">;
  dealValue?: number;
  dealCurrency?: string;
  closeReason?: string;
};

export function StageMover({ open, onClose, lead, stages }: { open: boolean; onClose: () => void; lead: MovableLead | null; stages: StageLite[] | undefined }) {
  const router = useRouter();
  const moveStage = useMutation(api.leads.moveStage);
  const [target, setTarget] = useState<StageLite | null>(null);
  const [reason, setReason] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [siblingsFor, setSiblingsFor] = useState<MovableLead | null>(null);

  useEffect(() => {
    if (open) {
      setTarget(null);
      setReason(lead?.closeReason ?? "");
      setValue(lead?.dealValue ? String(lead.dealValue) : "");
      setCurrency(lead?.dealCurrency || "USD");
    }
  }, [open, lead?._id]);

  const move = async (stage: StageLite) => {
    if (!lead) return;
    setBusy(true);
    try {
      const won = stage.isTerminal && stage.terminalOutcome === "won";
      await moveStage({
        leadId: lead._id,
        stageId: stage._id,
        closeReason: stage.isTerminal ? reason.trim() : undefined,
        dealValue: won ? (parseMoney(value) ?? undefined) : undefined,
        dealCurrency: won ? currency : undefined,
      });
      onClose();
      if (triggersSiblingReview(stage)) {
        const l = lead;
        // Let the first sheet finish closing before the next one opens.
        setTimeout(() => setSiblingsFor(l), 450);
      }
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg.includes("MISSING_CONTACT_INFO")) {
        Alert.alert(
          "Contact details needed",
          "A lead cannot move past the first stage without a phone number or email. Add one to the contact first.",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Open contact",
              onPress: () => {
                onClose();
                router.push(`/crm/contacts/${lead.contactId}` as Href);
              },
            },
          ]
        );
      } else {
        Alert.alert("Could not move the lead", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = (s: StageLite) => {
    if (s._id === lead?.stageId) return;
    if (s.isTerminal) setTarget(s);
    else void move(s);
  };

  const won = target?.terminalOutcome === "won";
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={target ? `Close as ${won ? "won" : "lost"}` : "Move to stage"}
        footer={
          target ? (
            <>
              <Button title={won ? "Close as won" : "Close as lost"} variant={won ? "brand" : "danger"} loading={busy} onPress={() => move(target)} />
              <Button title="Back" variant="secondary" onPress={() => setTarget(null)} />
            </>
          ) : undefined
        }
      >
        {!stages ? (
          <Loading />
        ) : target ? (
          <>
            <Body muted>
              {lead?.fullName} moves to {target.name}.
            </Body>
            <Field label="Close reason" value={reason} onChangeText={setReason} placeholder={won ? "e.g. Signed lease" : "e.g. Chose another agency"} multiline />
            {won && <MoneyField label="Deal value" value={value} onChange={setValue} currency={currency} onCurrency={setCurrency} />}
            {won && <Notice>Commission records are created from the deal value.</Notice>}
          </>
        ) : (
          <View style={{ gap: space.xs }}>
            {busy && <Loading />}
            {stages.map((s) => {
              const current = s._id === lead?.stageId;
              return (
                <Pressable
                  key={s._id}
                  onPress={() => pick(s)}
                  disabled={busy}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Ionicons
                    name={s.isTerminal ? (s.terminalOutcome === "won" ? "trophy-outline" : "close-circle-outline") : "ellipse-outline"}
                    size={18}
                    color={current ? colors.brand : s.isTerminal ? (s.terminalOutcome === "won" ? colors.success : colors.danger) : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.md, color: current ? colors.brand : colors.text, fontWeight: current ? "700" : "500" }}>{s.name}</Text>
                    {s.description ? <Text style={{ fontSize: font.xs, color: colors.muted }}>{s.description}</Text> : null}
                  </View>
                  {current && <Ionicons name="checkmark" size={18} color={colors.brand} />}
                </Pressable>
              );
            })}
          </View>
        )}
      </Sheet>
      <SiblingLeadsSheet lead={siblingsFor} onClose={() => setSiblingsFor(null)} />
    </>
  );
}

/** Offer to mark the contact's other open leads as lost. */
export function SiblingLeadsSheet({ lead, onClose }: { lead: MovableLead | null; onClose: () => void }) {
  const siblings = useQuery(api.leads.getOpenLeadsForContact, lead ? { contactId: lead.contactId, excludeLeadId: lead._id } : "skip");
  const bulkCloseAsLost = useMutation(api.leads.bulkCloseAsLost);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPicked(new Set());
    setTyped("");
  }, [lead?._id]);

  // Nothing to resolve: close quietly.
  useEffect(() => {
    if (lead && siblings && siblings.length === 0) onClose();
  }, [lead, siblings, onClose]);

  const phrase = lead ? `close leads for ${lead.fullName.toLowerCase()}` : "";
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const closeLeads = async () => {
    setBusy(true);
    try {
      await bulkCloseAsLost({ leadIds: Array.from(picked) as Id<"leads">[], closeReason: "Contact chose another property" });
      onClose();
    } catch (e) {
      Alert.alert("Could not close the leads", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={!!lead && !!siblings && siblings.length > 0}
      onClose={onClose}
      title="Other open leads"
      footer={
        <>
          {picked.size > 0 && <ConfirmPhrase phrase={phrase} value={typed} onChange={setTyped} />}
          <Button title={`Mark ${picked.size} as lost`} variant="danger" loading={busy} disabled={picked.size === 0 || typed !== phrase} onPress={closeLeads} />
          <Button title="Keep all open" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <Body muted>{lead?.fullName} has other open leads. Choose any to mark as lost.</Body>
      {siblings?.map((s) => (
        <CheckRow
          key={s._id}
          on={picked.has(s._id)}
          onPress={() => toggle(s._id)}
          title={s.fullName}
          subtitle={[
            `${interestLabel(s.interestType, true)} · ${s.stageName}`,
            s.properties && s.properties.length > 0
              ? `Property: ${s.properties
                  .filter(Boolean)
                  .map((p) => p!.title)
                  .join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")}
        />
      ))}
    </Sheet>
  );
}
