/**
 * Properties on a lead: what is attached (with a match type), attaching more,
 * and scored suggestions with a side-by-side comparison of up to five.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Ionicons, Loading, Row, SearchBar, Section, Select, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { confirm, useRun } from "../../../lib/useRun";
import { budgetLabel, interestLabel, matchTone, MATCH_TYPE_OPTIONS, priceLabel, type MatchType } from "../../../lib/crm/leads/helpers";
import { Bar, CheckRow } from "./bits";
import { colors, font, space } from "../../../lib/theme";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function LeadMatches({ leadId }: { leadId: Id<"leads"> }) {
  const router = useRouter();
  const matches = useQuery(api.matches.listForLead, { leadId });
  const detach = useMutation(api.matches.detach);
  const { run } = useRun();
  const [attaching, setAttaching] = useState(false);
  return (
    <Section title="Matched properties" right={<Button small title="Attach" icon="add" onPress={() => setAttaching(true)} />}>
      {matches === undefined ? (
        <Loading />
      ) : matches.length === 0 ? (
        <EmptyState icon="home-outline" title="No properties matched yet" message="Attach a property the client asked about, viewed or was offered." />
      ) : (
        matches.map((m) => (
          <Card key={m._id} onPress={() => router.push(`/crm/properties/${m.propertyId}` as Href)} style={{ gap: 4 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                {m.property?.title ?? "Unknown property"}
              </Text>
              <Badge label={m.property?.listingType === "sale" ? "Sale" : "Rent"} />
            </Row>
            <Text style={{ fontSize: font.sm, color: colors.muted }}>
              {cap(m.matchType)} · {m.property?.location || "No location"}
              {m.property ? ` · ${priceLabel(m.property.price, m.property.currency)}` : ""}
            </Text>
            <Row style={{ justifyContent: "flex-end" }}>
              <Button
                small
                variant="danger"
                title="Remove"
                onPress={async () => {
                  if (await confirm("Remove property", "Detach this property from the lead?", "Remove", true)) await run(() => detach({ matchId: m._id }));
                }}
              />
            </Row>
          </Card>
        ))
      )}
      <AttachSheet open={attaching} onClose={() => setAttaching(false)} leadId={leadId} attached={new Set((matches ?? []).map((m) => m.propertyId as string))} />
    </Section>
  );
}

/** Pick available properties to attach. Several at once create one lead per extra property, as on the website. */
function AttachSheet({ open, onClose, leadId, attached }: { open: boolean; onClose: () => void; leadId: Id<"leads">; attached: Set<string> }) {
  const properties = useQuery(api.properties.list, open ? {} : "skip");
  const bulkAttach = useMutation(api.matches.bulkAttachProperties);
  const [search, setSearch] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("requested");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setSearch("");
    }
  }, [open]);
  const list = useMemo(() => {
    const q = search.toLowerCase();
    return (properties?.items ?? []).filter(
      (p) => (p.status === "available" || p.status === "under_offer") && !attached.has(p._id) && (p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
    );
  }, [properties, search, attached]);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const save = async () => {
    setBusy(true);
    try {
      const r = await bulkAttach({ leadId, propertyIds: Array.from(picked) as Id<"properties">[], matchType });
      onClose();
      if (r.createdLeadCount > 0) Alert.alert("Properties attached", `${r.createdLeadCount} new lead${r.createdLeadCount > 1 ? "s were" : " was"} created, one per extra property.`);
    } catch (e) {
      Alert.alert("Could not attach", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Attach properties"
      footer={<Button title={picked.size ? `Attach ${picked.size}` : "Select properties"} loading={busy} disabled={!picked.size} onPress={save} />}
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by title or location" />
      <Select label="Match type" value={matchType} options={MATCH_TYPE_OPTIONS} onChange={setMatchType} />
      {!properties ? (
        <Loading />
      ) : list.length === 0 ? (
        <Body muted>No properties available to attach.</Body>
      ) : (
        list.map((p) => (
          <CheckRow
            key={p._id}
            on={picked.has(p._id)}
            onPress={() => toggle(p._id)}
            title={p.title}
            subtitle={`${p.listingType === "sale" ? "Sale" : "Rent"} · ${p.location} · ${priceLabel(p.price, p.currency)}`}
          />
        ))
      )}
    </Sheet>
  );
}

/** Scored suggestions for this lead, attach one tap, compare two to five. */
export function LeadSuggestions({ leadId }: { leadId: Id<"leads"> }) {
  const router = useRouter();
  const data = useQuery(api.matches.suggestPropertiesForLead, { leadId, limit: 10, minScore: 20 });
  const attach = useMutation(api.matches.attachPropertyToLead);
  const { run } = useRun();
  const [compare, setCompare] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  if (data === undefined) return <Loading />;
  const toggle = (id: string) =>
    setCompare((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < 5) n.add(id);
      return n;
    });
  const { lead } = data;
  return (
    <Section title="Suggested properties" right={compare.size >= 2 ? <Button small title={`Compare (${compare.size})`} onPress={() => setComparing(true)} /> : undefined}>
      <Body muted small>
        {data.matchedCount} matches from {data.totalAvailableProperties} properties. Looking for: {interestLabel(lead.interestType, true).toLowerCase()}
        {budgetLabel(lead.budgetMin, lead.budgetMax, lead.budgetCurrency) ? `, ${budgetLabel(lead.budgetMin, lead.budgetMax, lead.budgetCurrency)}` : ""}
        {lead.preferredAreas.length ? `, in ${lead.preferredAreas.join(", ")}` : ""}.
      </Body>
      {data.suggestions.length === 0 ? (
        <EmptyState icon="sparkles-outline" title="No suggestions" message="Add a budget and preferred areas to improve matching." />
      ) : (
        data.suggestions.map((s) => {
          const id = s.property._id;
          const open = expanded === id;
          return (
            <Card key={id} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/crm/properties/${id}` as Href)}>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{s.property.title}</Text>
                  <Text style={{ fontSize: font.sm, color: colors.muted }}>
                    {priceLabel(s.property.price, s.property.currency)} · {s.property.location}
                    {s.property.bedrooms !== undefined ? ` · ${s.property.bedrooms} bed` : ""}
                  </Text>
                </Pressable>
                <Badge label={`${s.totalScore}% match`} tone={matchTone(s.totalScore)} />
              </Row>
              <Pressable onPress={() => setExpanded(open ? null : id)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: font.sm, color: colors.brand, fontWeight: "600" }}>{open ? "Hide score" : "Why this match"}</Text>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.brand} />
              </Pressable>
              {open && (
                <View style={{ gap: space.sm }}>
                  <ScoreLine label="Interest type" score={s.interestTypeScore} max={30} />
                  <ScoreLine label="Budget fit" score={s.budgetScore} max={35} />
                  <ScoreLine label="Location" score={s.locationScore} max={25} />
                  <ScoreLine label="Availability" score={s.availabilityScore} max={10} />
                  {s.matchReasons.map((r) => (
                    <Text key={r} style={{ fontSize: font.sm, color: colors.success }}>
                      + {r}
                    </Text>
                  ))}
                  {s.warnings.map((w) => (
                    <Text key={w} style={{ fontSize: font.sm, color: colors.warning }}>
                      ! {w}
                    </Text>
                  ))}
                </View>
              )}
              <Row style={{ justifyContent: "flex-end" }}>
                <Button small variant={compare.has(id) ? "brand" : "secondary"} title={compare.has(id) ? "Comparing" : "Compare"} onPress={() => toggle(id)} />
                <Button small title="Attach" onPress={() => run(() => attach({ leadId, propertyId: id, matchType: "suggested" }))} />
              </Row>
            </Card>
          );
        })
      )}
      <CompareSheet open={comparing} onClose={() => setComparing(false)} ids={Array.from(compare) as Id<"properties">[]} />
    </Section>
  );
}

function ScoreLine({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max ? (score / max) * 100 : 0;
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ fontSize: font.xs, color: colors.muted }}>{label}</Text>
        <Text style={{ fontSize: font.xs, color: colors.muted }}>
          {Math.round(score)}/{max}
        </Text>
      </Row>
      <Bar percent={pct} color={pct >= 80 ? colors.success : pct >= 60 ? colors.info : pct >= 40 ? colors.warning : colors.danger} />
    </View>
  );
}

/** Up to five properties, one card each with the same facts in the same order. */
function CompareSheet({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: Id<"properties">[] }) {
  const data = useQuery(api.matches.getPropertiesForComparison, open && ids.length ? { propertyIds: ids } : "skip");
  return (
    <Sheet open={open} onClose={onClose} title="Compare properties">
      {!data ? (
        <Loading />
      ) : (
        data.properties.map((p) => (
          <Card key={p._id}>
            <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{p.title}</Text>
            <Facts
              items={[
                { label: "Price", value: priceLabel(p.price, p.currency) },
                { label: "Listing", value: p.listingType === "sale" ? "Sale" : "Rent" },
                { label: "Type", value: cap(p.type) },
                { label: "Location", value: p.location },
                { label: "Size", value: p.area ? `${p.area} m²` : "" },
                { label: "Bedrooms", value: p.bedrooms ?? "" },
                { label: "Bathrooms", value: p.bathrooms ?? "" },
                { label: "Status", value: cap(p.status.replace(/_/g, " ")) },
              ]}
            />
          </Card>
        ))
      )}
    </Sheet>
  );
}
