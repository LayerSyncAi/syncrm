/** SyncStay dashboard: this month's rent, arrears, vacancies and what needs doing. */
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Button, Card, EmptyState, Ionicons, ListItem, Loading, Row, Screen, Section, Stat, StatGrid } from "../../../components/ui";
import { colors, font, space } from "../../../lib/theme";
import { useRefresh } from "../../../lib/stay/hooks";
import { dateLabel, formatTotals, money } from "@/lib/stay/format";

export default function StayDashboard() {
  const router = useRouter();
  const data = useQuery(api.stay.dashboard.summary);
  const recent = useQuery(api.stay.payments.recent);
  const { refreshing, onRefresh } = useRefresh();
  const go = (href: string) => router.push(href as Href);

  if (data === undefined) return <Loading />;

  if (data.propertyCount === 0) {
    return (
      <Screen>
        <EmptyState
          icon="business-outline"
          title="No properties yet"
          message="Add the properties you manage with their landlord and units, or bring them in from your spreadsheet."
          action={
            <View style={{ gap: space.sm, marginTop: space.md, alignSelf: "stretch" }}>
              <Button title="Add property" icon="add" onPress={() => go("/stay/properties/new")} />
              {data.isDirector && <Button variant="secondary" title="Import from a spreadsheet" icon="cloud-upload-outline" onPress={() => go("/stay/import")} />}
            </View>
          }
        />
      </Screen>
    );
  }

  const hasArrears = Object.values(data.arrears).some((n) => (n ?? 0) > 0);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ gap: space.sm }}>
        <Body muted>Today is {dateLabel(data.today)}.</Body>
        <Button variant="brand" icon="receipt-outline" title="Record payment" onPress={() => go("/stay/payments/record")} />
        {data.canEditLeases && <Button variant="secondary" icon="create-outline" title="New lease" onPress={() => go("/stay/leases/new")} />}
      </View>

      {hasArrears && (
        <Card onPress={() => go("/stay/arrears")} style={{ backgroundColor: colors.dangerBg, borderColor: colors.danger + "44" }}>
          <Row>
            <Ionicons name="warning-outline" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: font.sm, flex: 1 }}>
              {data.tenantsInArrears} tenant{data.tenantsInArrears === 1 ? " is" : "s are"} behind with rent. Open the arrears list.
            </Text>
          </Row>
        </Card>
      )}

      <StatGrid>
        <Stat label="Rent due this month" value={formatTotals(data.rentDue)} onPress={() => go("/stay/leases")} />
        <Stat label="Collected so far" value={formatTotals(data.collected)} tone="good" onPress={() => go("/stay/payments")} />
        <Stat
          label="Total arrears"
          value={formatTotals(data.arrears)}
          hint={`${data.tenantsInArrears} tenant${data.tenantsInArrears === 1 ? "" : "s"} owing`}
          tone={hasArrears ? "danger" : undefined}
          onPress={() => go("/stay/arrears")}
        />
        <Stat
          label="Vacant units"
          value={String(data.vacant)}
          hint={`${data.occupancyPct}% occupied, ${data.units} units, ${data.notice} on notice`}
          tone={data.vacant ? "warning" : undefined}
          onPress={() => go("/stay/reports")}
        />
        <Stat
          label="Leases ending in 60 days"
          value={String(data.expiringCount)}
          tone={data.expiringCount ? "warning" : undefined}
          onPress={() => go("/stay/leases?expiring=60")}
        />
        <Stat label="Open maintenance" value={String(data.openMaintenance)} onPress={() => go("/stay/maintenance")} />
        <Stat label="Inspections due" value={String(data.inspectionsDue)} hint="Due or overdue within 7 days" onPress={() => go("/stay/inspections")} />
        <Stat label="Properties" value={String(data.propertyCount)} onPress={() => go("/stay/properties")} />
      </StatGrid>

      <Section
        title="Leases ending soon"
        right={
          <Text onPress={() => go("/stay/leases?expiring=60")} style={{ color: colors.brand, fontWeight: "600" }}>
            All
          </Text>
        }
      >
        {data.expiring.length === 0 ? (
          <Body muted small>
            No leases end in the next 60 days.
          </Body>
        ) : (
          data.expiring.map((l) => (
            <ListItem key={l._id} title={l.tenantName} subtitle={`${l.propertyName}, ${l.unitLabel}`} right={dateLabel(l.endDate)} onPress={() => go(`/stay/leases/${l._id}`)} />
          ))
        )}
      </Section>

      <Section
        title="Recent payments"
        right={
          <Text onPress={() => go("/stay/payments")} style={{ color: colors.brand, fontWeight: "600" }}>
            All
          </Text>
        }
      >
        {recent === undefined ? (
          <Body muted small>
            Loading...
          </Body>
        ) : recent.length === 0 ? (
          <Body muted small>
            No payments recorded yet.
          </Body>
        ) : (
          recent.map((p) => (
            <ListItem
              key={p._id}
              title={p.tenantName}
              subtitle={`${p.receiptNumber}, ${dateLabel(p.paidOn)}, ${p.unit}`}
              right={
                <Text style={{ fontSize: font.sm, fontWeight: "600", color: p.reversed ? colors.faint : colors.text, textDecorationLine: p.reversed ? "line-through" : "none" }}>
                  {money(p.amount, p.currency)}
                </Text>
              }
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
