/** Side-by-side comparison of up to four properties (the web cards view). */
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Facts, Sheet } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";
import { commercialLabel, listingLabel, priceLabel, statusLabel, typeLabel } from "../../../../lib/crm/records/properties/labels";
import type { PropertyRow } from "./PropertyCard";

type Row = PropertyRow & { commercialType?: string; zoning?: string; usageType?: string };

export function CompareSheet({
  open,
  onClose,
  items,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  items: Row[];
  onRemove: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Compare properties">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
        {items.map((p) => (
          <View key={p._id} style={styles.col}>
            {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={styles.photo} /> : null}
            <Text style={styles.title} numberOfLines={2}>
              {p.title}
            </Text>
            <Facts
              items={[
                { label: "Price", value: priceLabel(p.price, p.currency) },
                { label: "Location", value: p.location },
                { label: "Area", value: `${p.area} m²` },
                { label: "Type", value: typeLabel(p.type) },
                { label: "Listing", value: listingLabel(p.listingType) },
                { label: "Beds", value: p.bedrooms != null ? String(p.bedrooms) : "" },
                { label: "Baths", value: p.bathrooms != null ? String(p.bathrooms) : "" },
                { label: "Commercial", value: p.commercialType ? commercialLabel(p.commercialType) : "" },
                { label: "Zoning", value: p.zoning ?? "" },
                { label: "Usage", value: p.usageType ?? "" },
                { label: "Status", value: statusLabel(p.status) },
              ]}
            />
            <Button small variant="ghost" title="Remove" onPress={() => onRemove(p._id)} />
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  col: { width: 230, gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surface },
  title: { fontSize: font.md, fontWeight: "700", color: colors.text },
});
