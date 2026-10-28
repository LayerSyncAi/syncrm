/** One property in the list: cover photo, title, place, price and status. */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, Ionicons } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";
import { dateLabel } from "../../../../lib/format";
import { STATUS_TONE, listingLabel, priceLabel, statusLabel, typeLabel, type PropertyStatus } from "../../../../lib/crm/records/properties/labels";

export type PropertyRow = {
  _id: string;
  title: string;
  type: string;
  listingType: string;
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  status: PropertyStatus;
  images: string[];
  createdAt: number;
  createdByName?: string;
  pbRefCode?: string;
};

export function PropertyCard({
  p,
  onPress,
  onLongPress,
  selected = false,
}: {
  p: PropertyRow;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  const facts = [
    p.bedrooms != null ? `${p.bedrooms} bed` : null,
    p.bathrooms != null ? `${p.bathrooms} bath` : null,
    p.area ? `${p.area} m²` : null,
  ].filter(Boolean);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && { opacity: 0.85 }, selected && styles.selected]}>
          {p.images?.[0] ? (
            <Image source={{ uri: p.images[0] }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.noPhoto]}>
              <Ionicons name="image-outline" size={22} color={colors.faint} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.title} numberOfLines={1}>
              {p.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {p.location}
            </Text>
            <Text style={styles.price}>{priceLabel(p.price, p.currency)}</Text>
            <View style={styles.badges}>
              <Badge label={statusLabel(p.status)} tone={STATUS_TONE[p.status]} />
              <Text style={styles.meta}>
                {typeLabel(p.type)} · {listingLabel(p.listingType)}
                {facts.length ? ` · ${facts.join(", ")}` : ""}
              </Text>
            </View>
            <Text style={styles.meta}>
              Added {dateLabel(p.createdAt)} by {p.createdByName || "System"}
              {p.pbRefCode ? " · PropertyBook" : ""}
            </Text>
          </View>
          {selected && <Ionicons name="checkmark-circle" size={22} color={colors.brand} style={styles.tick} />}
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space.md, padding: space.md },
  selected: { borderColor: colors.brand, borderWidth: 2 },
  photo: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surface },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: font.md, fontWeight: "700", color: colors.text },
  sub: { fontSize: font.sm, color: colors.muted },
  price: { fontSize: font.md, fontWeight: "700", color: colors.brand },
  badges: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  meta: { fontSize: font.xs, color: colors.faint },
  tick: { position: "absolute", top: 8, right: 8 },
});
