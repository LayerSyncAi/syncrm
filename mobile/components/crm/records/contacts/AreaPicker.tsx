/**
 * Preferred areas: a searchable sheet of the agency's saved locations, with
 * "Add" for an area that is not on the list yet. Typed areas are recorded
 * under their canonical name so they stay matchable, as on the website.
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { canonicalizeArea } from "../../../../../convex/lib/locations";
import { Button, Ionicons, SearchBar, Sheet } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";

/** Sheet listing saved locations. `allowCreate` saves a new one to the list too. */
export function AreaSheet({
  open,
  onClose,
  onPick,
  allowCreate = false,
  title = "Choose an area",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (area: string) => void;
  allowCreate?: boolean;
  title?: string;
}) {
  const locations = useQuery(api.locations.list, open ? {} : "skip");
  const createLocation = useMutation(api.locations.create);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (locations ?? []).filter((l) => !s || l.name.toLowerCase().includes(s)).slice(0, 80);
  }, [locations, q]);
  const typed = q.trim();
  const exact = shown.some((l) => l.name.toLowerCase() === typed.toLowerCase());

  const pick = (name: string) => {
    onPick(name);
    setQ("");
    onClose();
  };

  const addNew = () => {
    const canonical = canonicalizeArea(typed);
    if (!canonical) return;
    // Record the area first; saving it to the shared list is best effort.
    pick(canonical);
    createLocation({ name: typed }).catch(() => {});
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search areas" />
      {allowCreate && typed && !exact && (
        <Button variant="secondary" icon="add" title={`Add "${canonicalizeArea(typed) || typed}"`} onPress={addNew} />
      )}
      {locations === undefined ? (
        <Text style={{ color: colors.muted }}>Loading areas</Text>
      ) : shown.length === 0 ? (
        <Text style={{ color: colors.muted }}>{typed ? "No saved area matches." : "No saved areas yet."}</Text>
      ) : (
        shown.map((l) => (
          <Pressable key={l._id} onPress={() => pick(l.name)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: font.md, color: colors.text }}>{l.name}</Text>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

/** Selected areas as removable chips plus an "Add area" button. */
export function AreaPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const add = (area: string) => {
    const canonical = canonicalizeArea(area);
    if (canonical && !value.some((a) => a.toLowerCase() === canonical.toLowerCase())) onChange([...value, canonical]);
  };
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Preferred areas</Text>
      {value.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {value.map((a) => (
            <Pressable
              key={a}
              onPress={() => onChange(value.filter((x) => x !== a))}
              accessibilityLabel={`Remove ${a}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: colors.brand, fontSize: font.sm, fontWeight: "600" }}>{a}</Text>
              <Ionicons name="close" size={14} color={colors.brand} />
            </Pressable>
          ))}
        </View>
      )}
      <Button small variant="secondary" icon="add" title="Add area" onPress={() => setOpen(true)} style={{ alignSelf: "flex-start" }} />
      <AreaSheet open={open} onClose={() => setOpen(false)} onPick={add} allowCreate title="Add a preferred area" />
    </View>
  );
}
