/** Step through months ("YYYY-MM") with arrows. */
import { Pressable, Text } from "react-native";
import { Card, Ionicons, Row } from "../ui";
import { colors, font } from "../../lib/theme";
import { addMonths, periodLabel } from "@/lib/stay/format";

export function MonthPicker({ value, onChange, hint }: { value: string; onChange: (m: string) => void; hint?: string }) {
  const arrow = (dir: -1 | 1) => (
    <Pressable onPress={() => onChange(addMonths(value, dir))} accessibilityLabel={dir < 0 ? "Previous month" : "Next month"} hitSlop={12} style={{ padding: 6 }}>
      <Ionicons name={dir < 0 ? "chevron-back" : "chevron-forward"} size={22} color={colors.brand} />
    </Pressable>
  );
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        {arrow(-1)}
        <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{periodLabel(value, true)}</Text>
        {arrow(1)}
      </Row>
      {hint ? <Text style={{ fontSize: font.sm, color: colors.muted, textAlign: "center" }}>{hint}</Text> : null}
    </Card>
  );
}
