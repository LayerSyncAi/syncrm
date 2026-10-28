/** Choose a contact from a searchable sheet. Shows buyers and tenants, as the website's pickers do. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Ionicons, SearchBar, Sheet } from "../../../ui";
import { useDebounced } from "../../../../lib/crm/records/properties/hooks";
import { colors, font, radius, space } from "../../../../lib/theme";

export function ContactPicker({ label, name, onPick }: { label: string; name?: string; onPick: (id: Id<"contacts">) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const result = useQuery(api.contacts.list, open ? { q: q || undefined, pageSize: 40 } : "skip");
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12 }}
      >
        <Text style={{ flex: 1, fontSize: font.md, color: name ? colors.text : colors.faint }} numberOfLines={1}>
          {name || "Select a contact"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Name, phone, email" />
        {result === undefined ? (
          <Text style={{ color: colors.muted }}>Loading contacts</Text>
        ) : result.items.length === 0 ? (
          <Text style={{ color: colors.muted }}>No contacts found.</Text>
        ) : (
          result.items.map((c) => (
            <Pressable
              key={c._id}
              onPress={() => {
                onPick(c._id);
                setOpen(false);
              }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ fontSize: font.md, color: colors.text }}>{c.name}</Text>
              {c.phone ? <Text style={{ fontSize: font.sm, color: colors.muted }}>{c.phone}</Text> : null}
            </Pressable>
          ))
        )}
      </Sheet>
    </View>
  );
}
