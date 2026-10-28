/** Large tap tiles for a short choice, e.g. payment method. Two per row. */
import { Pressable, Text, View } from "react-native";
import { colors, font, radius, space } from "../../lib/theme";

export function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label?: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{label}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={{
                flexBasis: `${Math.floor(100 / columns) - 3}%` as `${number}%`,
                flexGrow: 1,
                minHeight: 46,
                paddingHorizontal: space.sm,
                borderRadius: radius.md,
                borderWidth: 1,
                alignItems: "center",
                justifyContent: "center",
                borderColor: on ? colors.brand : colors.borderStrong,
                backgroundColor: on ? colors.brandLight : colors.card,
              }}
            >
              <Text style={{ fontSize: font.sm, fontWeight: "600", color: on ? colors.brand : colors.text, textAlign: "center" }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
