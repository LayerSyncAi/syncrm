/** Building blocks for the PropertyBook import screen. */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge, Button, Card, Ionicons, Sheet } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";
import { AgentChips } from "./AgentPicker";

export type Agency = { slug: string; name: string; logoUrl?: string; forSaleCount?: number; forRentCount?: number };

export type PbListing = {
  pbRefCode: string;
  pbSourceUrl: string;
  pbAgencySlug: string;
  title: string;
  listingType: "rent" | "sale";
  propertyType: "house" | "apartment" | "land" | "commercial" | "other";
  price: number;
  currency: string;
  location: string;
  area: number;
  bedrooms?: number;
  bathrooms?: number;
  description: string;
  imageUrls: string[];
  status: "available";
};

export function Logo({ url, name, size = 44 }: { url?: string; name: string; size?: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.surface }} resizeMode="contain" />;
  return (
    <View style={[styles.logo, { width: size, height: size }]}>
      <Text style={styles.logoText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function AgencyRow({ agency, onPress }: { agency: Agency; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.row}>
      <Logo url={agency.logoUrl} name={agency.name} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title} numberOfLines={1}>
          {agency.name}
        </Text>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          {typeof agency.forSaleCount === "number" && <Badge label={`Sales: ${agency.forSaleCount}`} />}
          {typeof agency.forRentCount === "number" && <Badge label={`Rent: ${agency.forRentCount}`} />}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Card>
  );
}

export function ListingRow({
  l,
  selected,
  ownerLabel,
  overridden,
  onToggle,
  onOwner,
}: {
  l: PbListing;
  selected: boolean;
  ownerLabel: string;
  overridden: boolean;
  onToggle: () => void;
  onOwner: () => void;
}) {
  return (
    <Card style={[styles.row, selected && { borderColor: colors.brand }]}>
      <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel={`Select ${l.title}`}>
        <Ionicons name={selected ? "checkbox" : "square-outline"} size={24} color={selected ? colors.brand : colors.faint} />
      </Pressable>
      {l.imageUrls[0] ? <Image source={{ uri: l.imageUrls[0] }} style={styles.thumb} /> : <View style={styles.thumb} />}
      <Pressable onPress={onToggle} style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {l.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {l.location}
        </Text>
        <Text style={styles.sub}>
          {l.listingType === "sale" ? "Sale" : "Rent"} · {l.currency} {l.price.toLocaleString("en-GB")} · {l.imageUrls.length} photos
        </Text>
        <Text style={styles.meta}>Ref {l.pbRefCode}</Text>
      </Pressable>
      <Pressable onPress={onOwner} style={[styles.owner, overridden && { borderColor: colors.brand, backgroundColor: colors.brandLight }]}>
        <Text style={[styles.ownerText, overridden && { color: colors.brand }]} numberOfLines={1}>
          {ownerLabel}
        </Text>
        <Ionicons name="chevron-down" size={12} color={overridden ? colors.brand : colors.muted} />
      </Pressable>
    </Card>
  );
}

/** Set one listing's owners: the company or specific agents. */
export function RowOwnerSheet({
  open,
  onClose,
  agents,
  owners,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  agents: Array<{ _id: Id<"users">; name: string }>;
  owners: Id<"users">[];
  onChange: (ids: Id<"users">[]) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Owner for this listing" footer={<Button title="Done" onPress={onClose} />}>
      <Pressable onPress={() => onChange([])} style={styles.company}>
        <Ionicons name={owners.length === 0 ? "radio-button-on" : "radio-button-off"} size={20} color={colors.brand} />
        <Text style={styles.title}>Company</Text>
      </Pressable>
      <AgentChips agents={agents} selected={owners} onToggle={(id) => onChange(owners.includes(id) ? owners.filter((x) => x !== id) : [...owners, id])} />
    </Sheet>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  logo: { borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: font.md, fontWeight: "700", color: colors.muted },
  title: { fontSize: font.md, fontWeight: "600", color: colors.text },
  sub: { fontSize: font.xs, color: colors.muted },
  meta: { fontSize: font.xs, color: colors.faint },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surface },
  owner: { flexDirection: "row", alignItems: "center", gap: 2, maxWidth: 96, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 6 },
  ownerText: { fontSize: font.xs, color: colors.muted, flexShrink: 1 },
  company: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", width: "100%" },
  barFill: { height: 8, backgroundColor: colors.brand },
});
