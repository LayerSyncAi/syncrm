/** Warns when another open lead shares this email or phone, with View and Merge links. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Ionicons, Row } from "../../ui";
import { useSession } from "../../../lib/session";
import { colors, font, radius, space } from "../../../lib/theme";

export function DuplicateWarning({ email, phone, excludeLeadId }: { email?: string; phone?: string; excludeLeadId?: Id<"leads"> }) {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === "admin" && !user?.agentMode;
  const [dismissed, setDismissed] = useState(false);
  const dups = useQuery(api.leadImport.findDuplicatesForLead, email || phone ? { email: email || undefined, phone: phone || undefined, excludeLeadId } : "skip");
  if (dismissed || !dups || dups.length === 0) return null;
  return (
    <View style={{ backgroundColor: colors.warningBg, borderColor: colors.warning + "55", borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={{ fontWeight: "700", color: colors.warning, fontSize: font.sm }}>Possible duplicate{dups.length > 1 ? "s" : ""}</Text>
        </Row>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.warning} />
        </Pressable>
      </Row>
      {dups.map((d) => (
        <View key={d.leadId} style={{ backgroundColor: colors.card, borderRadius: radius.sm, padding: space.sm, gap: 4 }}>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>
            {d.fullName}
            {d.propertyTitle ? <Text style={{ fontWeight: "400", color: colors.muted }}> for {d.propertyTitle}</Text> : null}
          </Text>
          <Text style={{ fontSize: font.sm, color: colors.muted }}>
            {d.phone}
            {d.email ? ` · ${d.email}` : ""}
          </Text>
          <Row style={{ justifyContent: "space-between" }}>
            <Badge label={d.reason} tone="warning" />
            <Row>
              <Button small variant="ghost" title="View" onPress={() => router.push(`/crm/leads/${d.leadId}` as Href)} />
              {isAdmin && (
                <Button
                  small
                  variant="secondary"
                  title="Merge"
                  onPress={() => router.push(`/crm/leads/merge?ids=${d.leadId}${excludeLeadId ? `,${excludeLeadId}` : ""}` as Href)}
                />
              )}
            </Row>
          </Row>
        </View>
      ))}
    </View>
  );
}
