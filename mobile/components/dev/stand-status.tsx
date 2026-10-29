/** Stand status colours and the sold, reserved, available bar. */
import { View } from "react-native";
import { colors, radius } from "../../lib/theme";

export type StandStatus = "available" | "reserved" | "sold";

export const STATUS: Record<StandStatus, { label: string; fg: string; bg: string; border: string }> = {
  available: { label: "Available", fg: colors.success, bg: colors.successBg, border: colors.success },
  reserved: { label: "Reserved", fg: colors.warning, bg: colors.warningBg, border: colors.warning },
  sold: { label: "Sold", fg: "#ffffff", bg: colors.brand, border: colors.brand },
};

/** One horizontal bar: sold, then reserved, then available. */
export function StockBar({ sold, reserved, available }: { sold: number; reserved: number; available: number }) {
  const total = sold + reserved + available;
  if (!total) return <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.border }} />;
  const parts: Array<[number, string]> = [
    [sold, STATUS.sold.bg],
    [reserved, STATUS.reserved.fg],
    [available, STATUS.available.fg],
  ];
  return (
    <View style={{ flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.border }}>
      {parts.map(([n, c], i) => (n > 0 ? <View key={i} style={{ flex: n, backgroundColor: c }} /> : null))}
    </View>
  );
}
