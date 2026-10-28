/** One tenant: contact details, portal access and a running statement per lease. */
import { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, Facts, Ionicons, Loading, Notice, Row, Screen, Section, Sheet, Stat, StatGrid } from "../../../components/ui";
import { LeaseStatusBadge } from "../../../components/stay/badges";
import { PersonFields } from "../../../components/stay/person-fields";
import { PortalAccess } from "../../../components/stay/portal-access";
import { StatementList } from "../../../components/stay/statement-list";
import { personArg, personFormFrom, type PersonForm } from "../../../lib/stay/person";
import { tenantStatementPdf } from "../../../lib/stay/pdf";
import { useLogo } from "../../../lib/stay/share";
import { useRefresh } from "../../../lib/stay/hooks";
import { sharePdf } from "../../../lib/files";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { getErrorMessage } from "@/lib/errors";
import { dateLabel, heldInLabel, money, todayLocal } from "@/lib/stay/format";

export default function StayTenant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contactId = id as Id<"contacts">;
  const router = useRouter();
  const convex = useConvex();
  const logo = useLogo();
  const tenant = useQuery(api.stay.people.getTenant, { contactId });
  const updatePerson = useMutation(api.stay.people.updatePerson);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();

  const [form, setForm] = useState<PersonForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (tenant === undefined) return <Loading />;
  if (tenant === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Tenant" }} />
        <EmptyState
          icon="people-outline"
          title="Tenant not found"
          message="They may not be on a lease you manage."
          action={<Button variant="secondary" title="Back to tenants" onPress={() => router.navigate("/stay/tenants")} />}
        />
      </Screen>
    );
  }

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError("Name is required.");
    setError(null);
    const ok = await run(
      async () => {
        await updatePerson({ contactId, person: personArg(form, false) });
        return true;
      },
      { success: "Tenant updated" },
    );
    if (ok) setForm(null);
  };

  const shareStatement = async () => {
    setPreparing(true);
    try {
      const [org, logoUrl] = await Promise.all([convex.query(api.hub.getOrgSettings, {}), logo()]);
      const { html, fileName } = tenantStatementPdf(
        {
          agency: {
            name: org?.name ?? "",
            address: org?.address || undefined,
            phone: org?.phone || undefined,
            email: org?.email || undefined,
            vatNumber: org?.vatNumber || undefined,
          },
          tenant: { name: tenant.name, phone: tenant.phone, email: tenant.email, idNumber: tenant.idNumber },
          accounts: tenant.accounts.map((a) => ({
            label: a.label,
            status: a.status,
            startDate: a.startDate,
            endDate: a.endDate,
            currency: a.currency,
            balance: a.balance,
            lines: a.lines,
          })),
          asOf: todayLocal(),
        },
        logoUrl,
      );
      await sharePdf(html, fileName);
    } catch (e) {
      Alert.alert("Could not create the statement", getErrorMessage(e));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: tenant.name,
          headerRight: tenant.canEdit
            ? () => (
                <Pressable
                  onPress={() => {
                    setError(null);
                    setForm(personFormFrom(tenant));
                  }}
                  accessibilityLabel="Edit details"
                  hitSlop={10}
                >
                  <Ionicons name="create-outline" size={22} color={colors.brand} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {tenant.managerNames.length > 0 && <Body muted>Managed by {tenant.managerNames.join(", ")}</Body>}
        <Button variant="secondary" icon="share-outline" title={preparing ? "Preparing..." : "Share statement PDF"} onPress={shareStatement} loading={preparing} />

        <Section title="Details">
          <Card>
            <PortalAccess contactId={contactId} kind="tenant" canManage={tenant.canEdit} />
            <Facts
              items={[
                { label: "Type", value: tenant.entityKind === "company" ? "Company" : "Individual" },
                { label: tenant.entityKind === "company" ? "Registration number" : "ID number", value: tenant.idNumber },
                {
                  label: "Phone",
                  value: tenant.phone ? (
                    <Text style={{ color: colors.brand, fontSize: font.sm }} onPress={() => Linking.openURL(`tel:${tenant.phone}`)}>
                      {tenant.phone}
                    </Text>
                  ) : (
                    ""
                  ),
                },
                {
                  label: "Email",
                  value: tenant.email ? (
                    <Text style={{ color: colors.brand, fontSize: font.sm }} onPress={() => Linking.openURL(`mailto:${tenant.email}`)}>
                      {tenant.email}
                    </Text>
                  ) : (
                    ""
                  ),
                },
              ]}
            />
            {tenant.canEdit && (
              <Button
                small
                variant="ghost"
                icon="create-outline"
                title="Edit details"
                onPress={() => {
                  setError(null);
                  setForm(personFormFrom(tenant));
                }}
                style={{ alignSelf: "flex-start" }}
              />
            )}
          </Card>
        </Section>

        {tenant.accounts.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No leases" message="This person has no lease you can see." />
        ) : (
          tenant.accounts.map((a) => (
            <Section key={a.leaseId} title={a.label}>
              <Card>
                <Row style={{ flexWrap: "wrap" }}>
                  <LeaseStatusBadge status={a.status} />
                  <Body small muted>
                    {dateLabel(a.startDate)} to {dateLabel(a.endDate)}
                  </Body>
                </Row>
                <StatGrid>
                  <Stat label="Rent" value={`${money(a.rentAmount, a.currency)} / month`} />
                  <Stat label={a.balance < 0 ? "In credit" : "Balance"} value={money(Math.abs(a.balance), a.currency)} tone={a.balance < 0 ? "good" : undefined} />
                  <Stat label="Overdue" value={money(a.overdue, a.currency)} tone={a.overdue > 0 ? "danger" : undefined} />
                  <Stat label="Deposit held" value={a.deposit ? money(a.deposit.held, a.currency) : "None"} hint={a.deposit ? heldInLabel(a.deposit.heldIn) : undefined} />
                </StatGrid>
                {a.credit > 0 && (
                  <Body small muted>
                    Credit carried forward {money(a.credit, a.currency)}.
                  </Body>
                )}
                <Row>
                  <Button small variant="secondary" title="Open lease" onPress={() => router.push(`/stay/leases/${a.leaseId}` as Href)} style={{ flex: 1 }} />
                  <Button
                    small
                    variant="brand"
                    icon="receipt-outline"
                    title="Record payment"
                    onPress={() => router.push(`/stay/payments/record?leaseId=${a.leaseId}` as Href)}
                    style={{ flex: 1 }}
                  />
                </Row>
                <View style={{ gap: space.xs }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.muted }}>Statement</Text>
                    {a.lines.length > 6 && (
                      <Text onPress={() => setExpanded((s) => ({ ...s, [a.leaseId]: !s[a.leaseId] }))} style={{ color: colors.brand, fontWeight: "600", fontSize: font.sm }}>
                        {expanded[a.leaseId] ? "Show less" : `Show all ${a.lines.length}`}
                      </Text>
                    )}
                  </Row>
                  <StatementList lines={a.lines} currency={a.currency} limit={expanded[a.leaseId] ? undefined : 6} />
                </View>
              </Card>
            </Section>
          ))
        )}
      </Screen>

      <Sheet open={!!form} onClose={() => setForm(null)} title={`Edit ${tenant.name}`} footer={<Button title="Save changes" onPress={save} loading={busy} />}>
        {error && <Notice tone="danger">{error}</Notice>}
        {form && <PersonFields value={form} onChange={setForm} role="tenant" excludeId={contactId} />}
      </Sheet>
    </>
  );
}
