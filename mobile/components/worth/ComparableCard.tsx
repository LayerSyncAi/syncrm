/** One comparable: address, kind, type, date, sizes and price or rent. */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Badge, Card, Row } from "../ui";
import { colors, font } from "../../lib/theme";
import { COMPARABLE_KIND_LABELS, comparableAmount, formatArea, formatDay, type ComparableView } from "../../lib/worth/util";

export function ComparableCard({ c, right, footer, onPress }: { c: ComparableView; right?: ReactNode; footer?: ReactNode; onPress?: () => void }) {
  return (
    <Card onPress={onPress}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={2}>
            {c.address}, {c.suburb}
          </Text>
          <Text style={{ fontSize: font.sm, color: colors.muted }}>
            {c.propertyType} · {formatDay(c.date)}
            {c.jobRef ? ` · ${c.jobRef}` : ""}
          </Text>
        </View>
        {right ?? <Badge label={COMPARABLE_KIND_LABELS[c.kind]} />}
      </Row>
      <Text style={{ fontSize: font.sm, color: colors.text }}>
        {comparableAmount(c, true)} · land {formatArea(c.landSizeM2)} · building {formatArea(c.buildingSizeM2)}
      </Text>
      {footer}
    </Card>
  );
}
