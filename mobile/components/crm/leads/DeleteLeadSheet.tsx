/** Permanently delete a lead after typing the same confirmation phrase as the website. */
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { ConfirmPhrase } from "./bits";
import { colors, font, radius, space } from "../../../lib/theme";

export function DeleteLeadSheet({
  lead,
  onClose,
  onDeleted,
  onPending,
}: {
  lead: { _id: Id<"leads">; fullName: string; propertyTitle?: string | null } | null;
  onClose: () => void;
  onDeleted?: () => void;
  /**
   * Called with true just before the delete and false if it fails, so a
   * detail screen can stop its lead queries before the lead disappears.
   */
  onPending?: (pending: boolean) => void;
}) {
  const deleteLead = useMutation(api.leads.deleteLead);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setTyped(""), [lead?._id]);
  const phrase = lead?.propertyTitle ? `delete lead ${lead.fullName.toLowerCase()} for ${lead.propertyTitle.toLowerCase()}` : "delete my lead";
  const go = async () => {
    if (!lead) return;
    setBusy(true);
    onPending?.(true);
    try {
      await deleteLead({ leadId: lead._id });
      onClose();
      onDeleted?.();
    } catch (e) {
      onPending?.(false);
      Alert.alert("Could not delete the lead", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={!!lead}
      onClose={onClose}
      title="Delete lead"
      footer={
        <>
          <Button title="Delete lead" variant="danger" loading={busy} disabled={typed !== phrase} onPress={go} />
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <Body muted>This cannot be undone. The lead, its activities and property matches are deleted, and attached properties are freed.</Body>
      <View style={{ borderWidth: 1, borderColor: "#fecaca", backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: space.md }}>
        <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{lead?.fullName}</Text>
        {lead?.propertyTitle ? <Text style={{ fontSize: font.sm, color: colors.muted }}>Property: {lead.propertyTitle}</Text> : null}
      </View>
      <ConfirmPhrase phrase={phrase} value={typed} onChange={setTyped} />
    </Sheet>
  );
}
