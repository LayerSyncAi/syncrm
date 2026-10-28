/** One managed property: agreement, landlord, units, past leases, expenses and documents. */
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Ionicons, ListItem, Loading, Row, Screen, Section } from "../../../components/ui";
import { LeaseStatusBadge, UnitStatusBadge } from "../../../components/stay/badges";
import { PortalAccess } from "../../../components/stay/portal-access";
import { AgreementSheet, ExpenseSheet, LandlordSheet, UnitSheet, type UnitView } from "../../../components/stay/property-sheets";
import { StayDocuments } from "../../../components/stay/ops/stay-documents";
import { UnitMaintenance } from "../../../components/stay/ops/unit-maintenance";
import { UnitInspections } from "../../../components/stay/ops/unit-inspections";
import { useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel, money } from "@/lib/stay/format";

type SheetKind = "landlord" | "agreement" | "unit" | "expense" | null;

export default function StayProperty() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const p = useQuery(api.stay.properties.get, { id: id as Id<"stayProperties"> });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editUnit, setEditUnit] = useState<UnitView | null>(null);
  const [openUnit, setOpenUnit] = useState<Id<"stayUnits"> | null>(null);
  const { refreshing, onRefresh } = useRefresh();
  const go = (href: string) => router.push(href as Href);

  if (p === undefined) return <Loading />;
  if (p === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Property" }} />
        <EmptyState
          icon="business-outline"
          title="Property not found"
          message="It may have been removed, or it is assigned to another manager."
          action={<Button variant="secondary" title="Back to properties" onPress={() => router.navigate("/stay/properties")} />}
        />
      </Screen>
    );
  }

  const closeSheets = () => {
    setSheet(null);
    setEditUnit(null);
  };
  const ll = p.landlord;

  return (
    <>
      <Stack.Screen
        options={{
          title: p.name,
          headerRight: p.canEdit
            ? () => (
                <Pressable onPress={() => setSheet("agreement")} accessibilityLabel="Edit property" hitSlop={10}>
                  <Ionicons name="create-outline" size={22} color={colors.brand} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <Body muted>{p.address}</Body>

        <Section
          title="Management agreement"
          right={p.canEdit ? <Button small variant="ghost" icon="create-outline" title="Edit" onPress={() => setSheet("agreement")} /> : undefined}
        >
          <Card>
            <Facts
              items={[
                { label: "Use", value: p.kind === "commercial" ? "Commercial" : "Residential" },
                { label: "Management fee", value: `${p.managementFeePct}% of rent collected` },
                { label: "Property manager", value: p.managerName ?? "Unassigned" },
                { label: "Repairs needing landlord approval", value: p.repairApprovalThreshold !== null ? `Over ${p.repairApprovalThreshold}` : "None" },
                { label: "Status", value: p.isActive ? "Managed" : "No longer managed" },
                { label: "Notes", value: p.notes },
              ]}
            />
          </Card>
        </Section>

        <Section
          title="Landlord"
          right={p.canEdit && ll ? <Button small variant="ghost" icon="create-outline" title="Edit details" onPress={() => setSheet("landlord")} /> : undefined}
        >
          {ll ? (
            <Card>
              <PortalAccess contactId={ll._id} kind="landlord" canManage={p.canEdit} />
              <Facts
                items={[
                  { label: "Name", value: ll.name },
                  {
                    label: "Phone",
                    value: ll.phone ? (
                      <Text style={{ color: colors.brand, fontSize: font.sm }} onPress={() => Linking.openURL(`tel:${ll.phone}`)}>
                        {ll.phone}
                      </Text>
                    ) : (
                      ""
                    ),
                  },
                  {
                    label: "Email",
                    value: ll.email ? (
                      <Text style={{ color: colors.brand, fontSize: font.sm }} onPress={() => Linking.openURL(`mailto:${ll.email}`)}>
                        {ll.email}
                      </Text>
                    ) : (
                      ""
                    ),
                  },
                  { label: ll.entityKind === "company" ? "Company number" : "ID number", value: ll.idNumber },
                  { label: "Bank", value: [ll.bankDetails.bankName, ll.bankDetails.branch].filter(Boolean).join(", ") },
                  { label: "Account", value: [ll.bankDetails.accountName, ll.bankDetails.accountNumber].filter(Boolean).join(", ") },
                ]}
              />
            </Card>
          ) : (
            <Body small muted>
              Landlord record not found.
            </Body>
          )}
        </Section>

        <Section title={`Units (${p.units.length})`} right={p.canEdit ? <Button small variant="ghost" icon="add" title="Add unit" onPress={() => setSheet("unit")} /> : undefined}>
          {p.units.map((u) => (
            <Card key={u._id}>
              <Row style={{ flexWrap: "wrap" }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{u.label}</Text>
                <UnitStatusBadge status={u.status} />
                {u.bedrooms !== null && (
                  <Body small muted>
                    {u.bedrooms} bed
                  </Body>
                )}
                {p.canEdit && (
                  <Pressable onPress={() => setEditUnit(u)} accessibilityLabel={`Edit ${u.label}`} hitSlop={10} style={{ marginLeft: "auto" }}>
                    <Ionicons name="create-outline" size={20} color={colors.brand} />
                  </Pressable>
                )}
              </Row>
              {u.lease ? (
                <Body small>
                  <Text onPress={() => go(`/stay/leases/${u.lease!._id}`)} style={{ color: colors.brand, fontWeight: "600" }}>
                    {u.lease.tenantName}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    {" "}
                    {money(u.lease.rentAmount, u.lease.currency)} a month, {dateLabel(u.lease.startDate)} to {dateLabel(u.lease.endDate)}
                    {u.lease.noticeGivenOn ? `, notice given ${dateLabel(u.lease.noticeGivenOn)}` : ""}
                  </Text>
                </Body>
              ) : (
                <Body small muted>
                  No current lease
                </Body>
              )}
              {u.inspectionIntervalMonths ? (
                <Body small muted>
                  Routine inspection every {u.inspectionIntervalMonths} months{u.nextInspectionDue ? `, next due ${dateLabel(u.nextInspectionDue)}` : ""}
                </Body>
              ) : null}
              <Row style={{ flexWrap: "wrap" }}>
                {u.lease ? (
                  <Button small variant="brand" icon="receipt-outline" title="Record payment" onPress={() => go(`/stay/payments/record?leaseId=${u.lease!._id}`)} />
                ) : (
                  p.canEdit && <Button small title="Let this unit" onPress={() => go(`/stay/leases/new?unitId=${u._id}`)} />
                )}
                <Button
                  small
                  variant="secondary"
                  title={openUnit === u._id ? "Hide repairs and inspections" : "Repairs and inspections"}
                  onPress={() => setOpenUnit(openUnit === u._id ? null : u._id)}
                />
              </Row>
              {openUnit === u._id && (
                <View style={{ gap: space.md, paddingTop: space.sm }}>
                  <UnitMaintenance unitId={u._id} />
                  <UnitInspections unitId={u._id} />
                  <Row style={{ flexWrap: "wrap" }}>
                    <Button small variant="ghost" title="All repairs" onPress={() => go(`/stay/maintenance?unitId=${u._id}`)} />
                    <Button small variant="ghost" title="All inspections" onPress={() => go(`/stay/inspections?unitId=${u._id}`)} />
                  </Row>
                </View>
              )}
            </Card>
          ))}
        </Section>

        {p.pastLeases.length > 0 && (
          <Section title="Past leases">
            {p.pastLeases.map((l) => (
              <ListItem
                key={l._id}
                title={l.tenantName}
                subtitle={`${l.unitLabel}, ${dateLabel(l.startDate)} to ${dateLabel(l.endDate)}`}
                right={<LeaseStatusBadge status={l.status} />}
                onPress={() => go(`/stay/leases/${l._id}`)}
              />
            ))}
          </Section>
        )}

        <Section title="Expenses" right={p.canEdit ? <Button small variant="ghost" icon="add" title="Add expense" onPress={() => setSheet("expense")} /> : undefined}>
          {p.expenses.length === 0 ? (
            <Body small muted>
              No expenses recorded. Repair costs from maintenance requests appear here too.
            </Body>
          ) : (
            <Card>
              {p.expenses.map((e, i) => (
                <Row
                  key={e._id}
                  style={{ alignItems: "flex-start", justifyContent: "space-between", borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, paddingTop: i ? space.sm : 0 }}
                >
                  <View style={{ flex: 1 }}>
                    <Body small style={{ fontWeight: "600" }}>
                      {e.description}
                    </Body>
                    <Body small muted>
                      {dateLabel(e.date)}
                      {e.supplier ? `, ${e.supplier}` : ""}
                      {e.fromMaintenance ? ", from a maintenance request" : ""}
                    </Body>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Body small>{money(e.amount, e.currency)}</Body>
                    {e.rechargeToLandlord ? (
                      <Badge tone="info" label="On landlord statement" />
                    ) : (
                      <Body small muted>
                        Agency cost
                      </Body>
                    )}
                  </View>
                </Row>
              ))}
            </Card>
          )}
        </Section>

        <StayDocuments stayPropertyId={p._id} />
      </Screen>

      {ll && <LandlordSheet landlord={ll} open={sheet === "landlord"} onClose={closeSheets} />}
      <AgreementSheet p={p} open={sheet === "agreement"} onClose={closeSheets} />
      <UnitSheet stayPropertyId={p._id} unit={editUnit} open={sheet === "unit" || !!editUnit} onClose={closeSheets} />
      <ExpenseSheet p={p} open={sheet === "expense"} onClose={closeSheets} />
    </>
  );
}
