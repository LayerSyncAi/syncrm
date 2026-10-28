/**
 * Merge duplicate leads (admins only; leadMerge.*): choose two or more leads
 * and a primary, pick which value wins for each field, then merge. Activities
 * and properties move to the primary and the others are archived.
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Ionicons, Loading, Notice, Row, Screen, SearchBar, Section } from "../../../components/ui";
import { getErrorMessage } from "@/lib/errors";
import { leadSourceLabel } from "../../../lib/crm/leads/helpers";
import { isEffectiveAdmin, useDebounced } from "../../../lib/crm/leads/useRefresh";
import { useSession } from "../../../lib/session";
import { CheckRow } from "../../../components/crm/leads/bits";
import { colors, font, radius, space } from "../../../lib/theme";

const FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "interestType", label: "Interest type" },
  { key: "budgetCurrency", label: "Budget currency" },
  { key: "budgetMin", label: "Budget min" },
  { key: "budgetMax", label: "Budget max" },
  { key: "preferredAreas", label: "Preferred areas" },
  { key: "notes", label: "Notes" },
] as const;

type Step = "select" | "resolve" | "done";

export default function MergeLeads() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = isEffectiveAdmin(user);
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const initial = (ids ?? "").split(",").filter(Boolean) as Id<"leads">[];
  const [step, setStep] = useState<Step>(initial.length >= 2 ? "resolve" : "select");
  const [selected, setSelected] = useState<Id<"leads">[]>(initial);
  const [primary, setPrimary] = useState<Id<"leads"> | null>(initial[0] ?? null);
  const [choices, setChoices] = useState<Record<string, { value: string; leadId: Id<"leads"> }>>({});
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const all = useQuery(api.leads.list, isAdmin && step === "select" ? { q: q || undefined, pageSize: 50 } : "skip");
  const chosen = useQuery(api.leadMerge.getLeadsForMerge, isAdmin && selected.length >= 2 ? { leadIds: selected } : "skip");
  const mergeLeads = useMutation(api.leadMerge.mergeLeads);
  const leads = useMemo(() => (chosen ?? []).filter((l): l is NonNullable<typeof l> => l !== null), [chosen]);

  if (!isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Merge duplicates" }} />
        <EmptyState icon="lock-closed-outline" title="Admins only" message="Only administrators can merge leads." />
      </Screen>
    );
  }

  const toggle = (id: Id<"leads">) => {
    setSelected((s) => {
      const next = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
      if (!next.includes(primary as Id<"leads">)) setPrimary(next[0] ?? null);
      return next;
    });
  };

  const valueOf = (lead: (typeof leads)[number], key: string): string => {
    const raw = (lead as Record<string, unknown>)[key];
    if (key === "preferredAreas") return Array.isArray(raw) ? raw.join(", ") : "";
    return raw === undefined || raw === null ? "" : String(raw);
  };

  const merge = async () => {
    if (!primary) return;
    setBusy(true);
    setError("");
    try {
      await mergeLeads({
        primaryLeadId: primary,
        mergedLeadIds: selected.filter((id) => id !== primary),
        fieldResolutions: Object.entries(choices).map(([field, c]) => ({ field, chosenValue: c.value, sourceLeadId: c.leadId })),
      });
      setStep("done");
    } catch (e) {
      setError(getErrorMessage(e, "Merge failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Merge duplicates" }} />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {step === "select" && (
        <>
          <Body muted>Select the leads to merge, then tap the star on the one to keep as primary.</Body>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search by name, phone or email" />
          {all === undefined ? (
            <Loading />
          ) : (
            all.items.map((l) => {
              const on = selected.includes(l._id);
              return (
                <CheckRow
                  key={l._id}
                  on={on}
                  onPress={() => toggle(l._id)}
                  title={l.fullName}
                  subtitle={[l.phone, l.email, leadSourceLabel(l.source)].filter(Boolean).join(" · ")}
                  right={
                    on ? (
                      <Pressable onPress={() => setPrimary(l._id)} hitSlop={10} accessibilityLabel="Make primary">
                        <Ionicons name={primary === l._id ? "star" : "star-outline"} size={22} color={colors.primary} />
                      </Pressable>
                    ) : undefined
                  }
                />
              );
            })
          )}
          <Button title={`Merge ${selected.length} leads`} disabled={selected.length < 2} onPress={() => setStep("resolve")} />
        </>
      )}

      {step === "resolve" && (
        <>
          {chosen === undefined ? (
            <Loading />
          ) : (
            <>
              <Notice>
                Primary: {leads.find((l) => l._id === primary)?.fullName ?? "choose one"}. The other leads are archived.
              </Notice>
              <Section title="Primary lead">
                <Row style={{ flexWrap: "wrap" }}>
                  {leads.map((l) => (
                    <Button key={l._id} small variant={primary === l._id ? "brand" : "secondary"} title={l.fullName} onPress={() => setPrimary(l._id)} />
                  ))}
                </Row>
              </Section>
              {FIELDS.map((f) => {
                const values = leads.map((l) => ({ leadId: l._id, name: l.fullName, val: valueOf(l, f.key) }));
                const distinct = new Set(values.map((v) => v.val).filter((v) => v !== ""));
                const current = choices[f.key];
                const isChosen = (v: (typeof values)[number]) => (current ? current.leadId === v.leadId : v.leadId === primary);
                return (
                  <Card key={f.key} style={[{ gap: space.sm }, distinct.size > 1 && { borderColor: colors.warning + "88", backgroundColor: colors.warningBg }]}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{f.label}</Text>
                      {distinct.size > 1 && <Badge label="Conflict" tone="warning" />}
                    </Row>
                    {values.map((v) => (
                      <Pressable
                        key={v.leadId}
                        onPress={() => setChoices((c) => ({ ...c, [f.key]: { value: v.val, leadId: v.leadId } }))}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: space.sm,
                          padding: space.sm,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: isChosen(v) ? colors.brand : colors.border,
                          backgroundColor: colors.card,
                        }}
                      >
                        <Ionicons name={isChosen(v) ? "radio-button-on" : "radio-button-off"} size={18} color={isChosen(v) ? colors.brand : colors.faint} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: font.xs, color: colors.muted }}>{v.name}</Text>
                          <Text style={{ fontSize: font.sm, color: v.val ? colors.text : colors.faint }}>{v.val || "(empty)"}</Text>
                        </View>
                        {v.leadId === primary && <Badge label="Primary" tone="info" />}
                      </Pressable>
                    ))}
                  </Card>
                );
              })}
              <Button title="Confirm merge" loading={busy} disabled={!primary} onPress={merge} />
              <Button title="Back" variant="secondary" onPress={() => setStep("select")} />
            </>
          )}
        </>
      )}

      {step === "done" && (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Leads merged"
          message="Activities and properties moved to the primary lead."
          action={
            <View style={{ gap: space.sm, alignSelf: "stretch" }}>
              {primary && <Button title="View primary lead" onPress={() => router.replace(`/crm/leads/${primary}` as Href)} />}
              <Button title="Go to leads" variant="secondary" onPress={() => router.replace("/crm/leads")} />
            </View>
          }
        />
      )}
    </Screen>
  );
}
