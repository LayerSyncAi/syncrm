/** Every tenancy: who rents which unit, for how long and at what rent. */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Card, Chips, EmptyState, Fab, List, Row, SearchBar } from "../../../components/ui";
import { LeaseStatusBadge } from "../../../components/stay/badges";
import { useDebounced, useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel, money } from "@/lib/stay/format";

type Status = "active" | "ended" | "renewed" | "all";
type Expiring = "" | "30" | "60" | "90";

export default function StayLeases() {
  const router = useRouter();
  const params = useLocalSearchParams<{ expiring?: string }>();
  const [status, setStatus] = useState<Status>("active");
  const [expiring, setExpiring] = useState<Expiring>((params.expiring as Expiring) ?? "");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const { refreshing, onRefresh } = useRefresh();

  // A dashboard link can open this tab with ?expiring=60.
  useEffect(() => {
    if (params.expiring) setExpiring(params.expiring as Expiring);
  }, [params.expiring]);

  const leases = useQuery(api.stay.leases.list, {
    status: expiring ? "active" : status,
    q: q || undefined,
    expiringWithinDays: expiring ? Number(expiring) : undefined,
  });

  return (
    <View style={{ flex: 1 }}>
      <List
        data={leases}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.sm, marginBottom: space.sm }}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Tenant, property, unit, landlord" />
            {!expiring && (
              <Chips<Status>
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active" },
                  { value: "ended", label: "Ended" },
                  { value: "renewed", label: "Renewed" },
                  { value: "all", label: "All" },
                ]}
              />
            )}
            <Chips<Expiring>
              value={expiring}
              onChange={setExpiring}
              options={[
                { value: "", label: "Ending any time" },
                { value: "30", label: "Within 30 days" },
                { value: "60", label: "Within 60 days" },
                { value: "90", label: "Within 90 days" },
              ]}
            />
          </View>
        }
        empty={
          <EmptyState
            icon="document-text-outline"
            title={q || expiring ? "No matching leases" : "No leases yet"}
            message={q || expiring ? "Try a different search or filter." : "Create a lease when you let a unit."}
          />
        }
        keyExtractor={(l) => l._id}
        renderItem={({ item: l }) => (
          <Card onPress={() => router.push(`/stay/leases/${l._id}` as Href)}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                  {l.tenantName}
                </Text>
                <Body small muted numberOfLines={1}>
                  {l.propertyName}, {l.unitLabel}
                </Body>
              </View>
              <LeaseStatusBadge status={l.status} notice={!!l.noticeGivenOn} />
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Body small muted>
                {dateLabel(l.startDate)} to {dateLabel(l.moveOutDate ?? l.endDate)}
              </Body>
              <Body small style={{ fontWeight: "600" }}>
                {money(l.rentAmount, l.currency)}
              </Body>
            </Row>
            {l.status === "active" && l.daysToEnd >= 0 && l.daysToEnd <= 60 && (
              <Body small style={{ color: colors.warning }}>
                Ends in {l.daysToEnd} days
              </Body>
            )}
          </Card>
        )}
      />
      <Fab label="New lease" onPress={() => router.push("/stay/leases/new")} />
    </View>
  );
}
