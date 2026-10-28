/**
 * While a new contact is typed, warn when the phone or email already belongs
 * to a contact or an open lead, so the agent opens that record instead of
 * creating a second one. Uses the same list and lead checks as the website.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Ionicons, Row } from "../../../ui";
import { useDebounced } from "../../../../lib/crm/records/properties/hooks";
import { colors, font, radius, space } from "../../../../lib/theme";

export function ContactDuplicates({ phone, email, onOpen }: { phone: string; email: string; onOpen?: () => void }) {
  const router = useRouter();
  const p = useDebounced(phone.replace(/\D/g, "").length >= 7 ? phone.trim() : "", 500);
  const e = useDebounced(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim().toLowerCase() : "", 500);

  const byPhone = useQuery(api.contacts.list, p ? { q: p, role: "all", pageSize: 5 } : "skip");
  const byEmail = useQuery(api.contacts.list, e ? { q: e, role: "all", pageSize: 5 } : "skip");
  const leads = useQuery(api.leadImport.findDuplicatesForLead, p || e ? { phone: p || undefined, email: e || undefined } : "skip");

  const contacts = new Map<string, { _id: string; name: string; reason: string }>();
  for (const c of byPhone?.items ?? []) contacts.set(c._id, { _id: c._id, name: c.name, reason: "Same phone" });
  for (const c of byEmail?.items ?? []) {
    if (c.email?.toLowerCase() === e) contacts.set(c._id, { _id: c._id, name: c.name, reason: contacts.has(c._id) ? "Same phone and email" : "Same email" });
  }
  const contactRows = [...contacts.values()];
  const leadRows = leads ?? [];
  if (contactRows.length === 0 && leadRows.length === 0) return null;

  const go = (href: string) => {
    onOpen?.();
    router.push(href as Href);
  };

  return (
    <View style={{ backgroundColor: colors.warningBg, borderColor: colors.warning + "55", borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <Row>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={{ fontWeight: "700", color: colors.warning, fontSize: font.sm, flex: 1 }}>This person may already be on file</Text>
      </Row>
      {contactRows.map((c) => (
        <Pressable key={c._id} onPress={() => go(`/crm/contacts/${c._id}`)} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.text, fontSize: font.sm }}>
            Contact <Text style={{ fontWeight: "700" }}>{c.name}</Text> · {c.reason}
            <Text style={{ color: colors.brand, fontWeight: "600" }}>  Open</Text>
          </Text>
        </Pressable>
      ))}
      {leadRows.slice(0, 3).map((l) => (
        <Pressable key={l.leadId} onPress={() => go(`/crm/leads/${l.leadId}`)} style={{ paddingVertical: 4 }}>
          <Text style={{ color: colors.text, fontSize: font.sm }}>
            Lead <Text style={{ fontWeight: "700" }}>{l.fullName}</Text> · {l.reason}
            <Text style={{ color: colors.brand, fontWeight: "600" }}>  Open</Text>
          </Text>
        </Pressable>
      ))}
      <Text style={{ color: colors.muted, fontSize: font.xs }}>You can still save if this is a different person.</Text>
    </View>
  );
}
