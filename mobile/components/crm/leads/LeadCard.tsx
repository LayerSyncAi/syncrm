/** One lead in the list or board: who, interest, score, stage and owner, with one-tap Call and WhatsApp. */
import { Linking, Pressable, Text, View } from "react-native";
import { Badge, Card, Ionicons, Row } from "../../ui";
import { interestLabel } from "../../../lib/crm/leads/helpers";
import { ScoreBadge } from "./bits";
import { colors, font, radius, space } from "../../../lib/theme";
import { telHref, whatsAppHref } from "@/lib/phone";

export type LeadCardData = {
  fullName: string;
  phone?: string;
  interestType: string;
  score?: number;
  ownerName: string;
  stageName?: string;
  propertyTitle?: string | null;
  closedAt?: number;
  closeReason?: string;
};

export function LeadCard({
  lead,
  onPress,
  onStage,
  onDelete,
}: {
  lead: LeadCardData;
  onPress: () => void;
  /** Open the stage mover; omitted once the lead is closed with a reason. */
  onStage?: () => void;
  onDelete?: () => void;
}) {
  const locked = !!(lead.closedAt && lead.closeReason);
  const tel = telHref(lead.phone);
  const wa = whatsAppHref(lead.phone);
  return (
    <Card onPress={onPress} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }} numberOfLines={1}>
            {lead.fullName}
          </Text>
          <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>
            {[lead.phone, lead.ownerName].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <ScoreBadge score={lead.score} />
      </Row>
      <Row style={{ flexWrap: "wrap" }}>
        <Badge label={interestLabel(lead.interestType)} tone={lead.interestType === "buy" ? "success" : "info"} />
        {lead.propertyTitle ? (
          <Text style={{ fontSize: font.sm, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
            {lead.propertyTitle}
          </Text>
        ) : null}
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        {lead.stageName ? (
          <Pressable
            onPress={!locked && onStage ? onStage : undefined}
            disabled={locked || !onStage}
            accessibilityLabel={`Stage ${lead.stageName}. Change stage`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              flexShrink: 1,
            }}
          >
            <Text style={{ fontSize: font.sm, color: colors.text, fontWeight: "600" }} numberOfLines={1}>
              {lead.stageName}
            </Text>
            {!locked && onStage && <Ionicons name="chevron-down" size={14} color={colors.muted} />}
          </Pressable>
        ) : (
          <View />
        )}
        <Row style={{ gap: space.sm }}>
          {tel && <ContactButton icon="call-outline" label={`Call ${lead.fullName}`} onPress={() => Linking.openURL(tel)} />}
          {wa && <ContactButton icon="logo-whatsapp" label={`WhatsApp ${lead.fullName}`} onPress={() => Linking.openURL(wa)} />}
          {onDelete && (
            <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel="Delete lead" style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          )}
        </Row>
      </Row>
    </Card>
  );
}

/** A round outlined button for calling or messaging the lead. */
function ContactButton({ icon, label, onPress }: { icon: "call-outline" | "logo-whatsapp"; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={17} color={colors.text} />
    </Pressable>
  );
}
