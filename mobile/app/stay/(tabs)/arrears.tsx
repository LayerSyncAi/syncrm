/** Tenants with money overdue, aged by the oldest unpaid charge. */
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Chips, EmptyState, List, Row, Select, Stat, StatGrid } from "../../../components/ui";
import { ArrearsNoteSheet, type NoteTarget } from "../../../components/stay/arrears-note-sheet";
import { useRefresh } from "../../../lib/stay/hooks";
import { dateLabel as dayLabel } from "../../../lib/format";
import { colors, font, space } from "../../../lib/theme";
import { AGE_BUCKET_LABELS, dateLabel, formatTotals, money, todayLocal } from "@/lib/stay/format";

type Bucket = "0_30" | "31_60" | "61_90" | "90_plus";
const BUCKETS: Bucket[] = ["0_30", "31_60", "61_90", "90_plus"];
const ALL = "__all";

export default function StayArrears() {
  const router = useRouter();
  const [managerUserId, setManagerUserId] = useState(ALL);
  const [stayPropertyId, setStayPropertyId] = useState(ALL);
  const [landlordContactId, setLandlordContactId] = useState(ALL);
  const [bucket, setBucket] = useState<Bucket | "">("");
  const [showFilters, setShowFilters] = useState(false);
  const [noteFor, setNoteFor] = useState<NoteTarget>(null);
  const { refreshing, onRefresh } = useRefresh();

  const pick = <T,>(v: string) => (v === ALL ? undefined : (v as T));
  const data = useQuery(api.stay.arrears.list, {
    managerUserId: pick<Id<"users">>(managerUserId),
    stayPropertyId: pick<Id<"stayProperties">>(stayPropertyId),
    landlordContactId: pick<Id<"contacts">>(landlordContactId),
  });
  const managers = useQuery(api.stay.properties.listManagers, showFilters ? {} : "skip");
  const properties = useQuery(api.stay.properties.list, showFilters ? {} : "skip");
  const landlords = useQuery(api.stay.people.listLandlords, showFilters ? {} : "skip");

  const rows = data ? data.rows.filter((r) => !bucket || r.bucket === bucket) : undefined;
  const filtered = managerUserId !== ALL || stayPropertyId !== ALL || landlordContactId !== ALL || !!bucket;
  const today = todayLocal();

  return (
    <View style={{ flex: 1 }}>
      <List
        data={rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <StatGrid>
              <Stat label="Total overdue" value={data ? formatTotals(data.totals) : "..."} tone="danger" hint={data ? `${data.rows.length} tenancies` : undefined} />
              {BUCKETS.map((b) => (
                <Stat
                  key={b}
                  label={AGE_BUCKET_LABELS[b]}
                  value={data ? formatTotals(data.bucketTotals[b]) : "..."}
                  tone={b === "0_30" ? "warning" : "danger"}
                  onPress={() => setBucket(bucket === b ? "" : b)}
                />
              ))}
            </StatGrid>
            <Chips<Bucket | "">
              value={bucket}
              onChange={setBucket}
              options={[{ value: "", label: "Any age" }, ...BUCKETS.map((b) => ({ value: b, label: AGE_BUCKET_LABELS[b] }))]}
            />
            <Button
              small
              variant="ghost"
              icon="options-outline"
              title={showFilters ? "Hide filters" : "Filter by manager, property or landlord"}
              onPress={() => setShowFilters((s) => !s)}
            />
            {showFilters && (
              <Card>
                <Select
                  label="Property manager"
                  value={managerUserId}
                  onChange={setManagerUserId}
                  options={[{ value: ALL, label: "All managers" }, ...(managers ?? []).map((m) => ({ value: m._id as string, label: m.name }))]}
                />
                <Select
                  label="Property"
                  value={stayPropertyId}
                  onChange={setStayPropertyId}
                  options={[{ value: ALL, label: "All properties" }, ...(properties ?? []).map((p) => ({ value: p._id as string, label: p.name }))]}
                />
                <Select
                  label="Landlord"
                  value={landlordContactId}
                  onChange={setLandlordContactId}
                  options={[{ value: ALL, label: "All landlords" }, ...(landlords ?? []).map((l) => ({ value: l._id as string, label: l.name }))]}
                />
              </Card>
            )}
          </View>
        }
        empty={
          <EmptyState
            icon="checkmark-circle-outline"
            title={filtered ? "No arrears match these filters" : "No arrears"}
            message={filtered ? "Clear a filter to see more." : "Every tenant is up to date."}
          />
        }
        keyExtractor={(r) => r.leaseId}
        renderItem={({ item: r }) => {
          const n = r.lastNote;
          const broken = !!n?.promiseDate && n.promiseDate < today;
          return (
            <Card>
              <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text onPress={() => router.push(`/stay/leases/${r.leaseId}` as Href)} style={{ fontSize: font.md, fontWeight: "600", color: colors.brand }}>
                    {r.tenantName}
                  </Text>
                  <Body small muted numberOfLines={1}>
                    {r.propertyName}, {r.unitLabel}
                  </Body>
                  {r.managerName && (
                    <Body small muted>
                      {r.managerName}
                    </Body>
                  )}
                  {r.leaseStatus !== "active" && <Badge label="Lease ended" />}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.danger }}>{money(r.total, r.currency)}</Text>
                  <Badge tone={r.bucket === "0_30" || r.bucket === "31_60" ? "warning" : "danger"} label={`${r.daysOverdue} days`} />
                </View>
              </Row>
              {n && (
                <View>
                  <Body small numberOfLines={2}>
                    {n.note}
                  </Body>
                  {n.promiseDate && (
                    <Body small style={{ color: broken ? colors.danger : colors.muted }}>
                      Promised {n.promiseAmount ? money(n.promiseAmount, r.currency) : ""} by {dateLabel(n.promiseDate)}
                      {broken ? " (passed)" : ""}
                    </Body>
                  )}
                  <Body small muted>
                    {dayLabel(n.createdAt)}
                  </Body>
                </View>
              )}
              <Row>
                {r.tenantPhone ? (
                  <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${r.tenantPhone}`)} style={{ flex: 1 }} />
                ) : null}
                <Button small variant="secondary" title="Note" onPress={() => setNoteFor({ leaseId: r.leaseId, tenantName: r.tenantName })} style={{ flex: 1 }} />
                <Button small variant="brand" title="Payment" onPress={() => router.push(`/stay/payments/record?leaseId=${r.leaseId}` as Href)} style={{ flex: 1 }} />
              </Row>
              <Text onPress={() => router.push(`/stay/tenants/${r.tenantContactId}` as Href)} style={{ fontSize: font.sm, color: colors.brand }}>
                Tenant record
              </Text>
            </Card>
          );
        }}
      />
      <ArrearsNoteSheet target={noteFor} onClose={() => setNoteFor(null)} />
    </View>
  );
}
