/**
 * Which agent(s) hold a property record: the company, or specific agents.
 * Used by the new property form, the reassign sheet and PropertyBook import.
 * An empty list means the company, as on the website.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Body, Chips, Ionicons } from "../../../ui";
import { colors, font, radius, space } from "../../../../lib/theme";

export type AgentChoice = { mode: "company" | "agents"; ids: Id<"users">[] };

export function AgentPicker({ value, onChange }: { value: AgentChoice; onChange: (v: AgentChoice) => void }) {
  const agents = useQuery(api.users.listForAssignment) ?? [];
  return (
    <View style={{ gap: space.sm }}>
      <Chips
        options={[
          { value: "company", label: "Company" },
          { value: "agents", label: "Specific agents" },
        ]}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      {value.mode === "agents" && (
        <AgentChips
          agents={agents}
          selected={value.ids}
          onToggle={(id) => onChange({ ...value, ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id] })}
        />
      )}
      {value.mode === "agents" && value.ids.length === 0 && <Body small muted>Choose at least one agent.</Body>}
    </View>
  );
}

export function AgentChips({
  agents,
  selected,
  onToggle,
}: {
  agents: Array<{ _id: Id<"users">; name: string }>;
  selected: Id<"users">[];
  onToggle: (id: Id<"users">) => void;
}) {
  if (agents.length === 0) return <Body small muted>No agents available.</Body>;
  return (
    <View style={styles.wrap}>
      {agents.map((a) => {
        const on = selected.includes(a._id);
        return (
          <Pressable key={a._id} onPress={() => onToggle(a._id)} style={[styles.chip, on && styles.chipOn]}>
            {on && <Ionicons name="checkmark" size={14} color="#fff" />}
            <Text style={[styles.chipText, on && { color: "#fff" }]}>{a.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small hook for an AgentChoice starting value. */
export function useAgentChoice(initial: AgentChoice = { mode: "company", ids: [] }) {
  return useState<AgentChoice>(initial);
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: font.sm, color: colors.text, fontWeight: "500" },
});
