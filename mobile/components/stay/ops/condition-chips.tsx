import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../ui";
import { colors, font, radius, space } from "../../../lib/theme";
import { CONDITIONS, conditionLabel, conditionVariant, type Condition } from "@/lib/stay-ops/labels";

const TINT: Record<Condition, { fg: string; bg: string }> = {
  good: { fg: colors.success, bg: colors.successBg },
  fair: { fg: colors.info, bg: colors.infoBg },
  poor: { fg: colors.warning, bg: colors.warningBg },
  damaged: { fg: colors.danger, bg: colors.dangerBg },
};

/** Four large buttons to rate a room. */
export function ConditionChips({ value, onChange }: { value?: Condition; onChange: (c: Condition) => void }) {
  return (
    <View style={styles.row}>
      {CONDITIONS.map((c) => {
        const on = value === c.value;
        return (
          <Pressable
            key={c.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(c.value)}
            style={[styles.chip, on && { borderColor: TINT[c.value].fg, backgroundColor: TINT[c.value].bg }]}
          >
            <Text style={[styles.text, on && { color: TINT[c.value].fg }]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ConditionBadge({ c }: { c?: Condition }) {
  return <Badge label={conditionLabel(c)} tone={c ? conditionVariant[c] : "neutral"} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  chip: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.card },
  text: { fontSize: font.sm, fontWeight: "600", color: colors.muted },
});
