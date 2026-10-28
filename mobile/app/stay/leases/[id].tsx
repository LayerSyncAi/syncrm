/** One lease: balance, terms, statement, payments, charges, deposit, notes and documents. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Field, Ionicons, ListItem, Loading, Notice, Row, Screen, Section, Sheet, Stat, StatGrid } from "../../../components/ui";
import { ChargeStatusBadge, LeaseStatusBadge } from "../../../components/stay/badges";
import { LeaseSheets, type LeaseSheetKind } from "../../../components/stay/lease-sheets";
import { ReversePaymentSheet, type ReverseTarget } from "../../../components/stay/reverse-payment-sheet";
import { StatementList } from "../../../components/stay/statement-list";
import { StayDocuments } from "../../../components/stay/ops/stay-documents";
import { useShareReceipt } from "../../../lib/stay/share";
import { useRefresh } from "../../../lib/stay/hooks";
import { useRun } from "../../../lib/useRun";
import { dateLabel as dayLabel } from "../../../lib/format";
import { colors, font, space } from "../../../lib/theme";
import { chargeKindLabel, dateLabel, heldInLabel, methodLabel, money } from "@/lib/stay/format";

export default function LeaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leaseId = id as Id<"stayLeases">;
  const router = useRouter();
  const lease = useQuery(api.stay.leases.get, { id: leaseId });
  const shareReceipt = useShareReceipt();
  const emailReceipt = useMutation(api.stay.payments.emailReceipt);
  const cancelCharge = useMutation(api.stay.leases.cancelCharge);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();

  const [sheet, setSheet] = useState<LeaseSheetKind | null>(null);
  const [menu, setMenu] = useState(false);
  const [reversing, setReversing] = useState<ReverseTarget>(null);
  const [cancelling, setCancelling] = useState<{ _id: Id<"stayCharges">; description: string } | null>(null);
  const [reason, setReason] = useState("");
  const [sharingId, setSharingId] = useState<Id<"stayPayments"> | null>(null);
  const [fullStatement, setFullStatement] = useState(false);

  if (lease === undefined) return <Loading />;
  if (lease === null) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Lease" }} />
        <EmptyState icon="document-text-outline" title="Lease not found" message="It may belong to a property you do not manage." />
      </Screen>
    );
  }

  const active = lease.status === "active";
  const cur = lease.currency;
  const held = lease.deposit?.held ?? 0;
  const go = (href: string) => router.push(href as Href);
  const recordPayment = () => go(`/stay/payments/record?leaseId=${lease._id}`);

  const actions: Array<{ label: string; kind: LeaseSheetKind; show: boolean }> = [
    { label: "Add charge", kind: "charge", show: lease.canEdit },
    { label: "Edit terms", kind: "terms", show: lease.canEdit && active },
    { label: "Renew", kind: "renew", show: lease.canEdit && active },
    { label: lease.noticeGivenOn ? "Change notice" : "Tenant gave notice", kind: "notice", show: lease.canEdit && active },
    { label: "Plan rent increase", kind: "increase", show: lease.canEdit && active },
    { label: "End lease", kind: "end", show: lease.canEdit && active },
    { label: "Settle deposit", kind: "deposit", show: lease.canEdit && held > 0 },
    { label: "Add arrears note", kind: "note", show: true },
  ];

  const share = async (pid: Id<"stayPayments">) => {
    setSharingId(pid);
    await shareReceipt(pid);
    setSharingId(null);
  };

  const doCancel = async () => {
    if (!cancelling || !reason.trim()) return;
    const ok = await run(
      async () => {
        await cancelCharge({ chargeId: cancelling._id, reason: reason.trim() });
        return true;
      },
      { success: "Charge cancelled" },
    );
    if (ok) {
      setCancelling(null);
      setReason("");
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: lease.tenantName,
          headerRight: () => (
            <Pressable onPress={() => setMenu(true)} accessibilityLabel="Lease actions" hitSlop={10}>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <View style={{ gap: space.xs }}>
          <Row style={{ flexWrap: "wrap" }}>
            <LeaseStatusBadge status={lease.status} notice={!!lease.noticeGivenOn} />
          </Row>
          <Text onPress={() => go(`/stay/properties/${lease.stayPropertyId}`)} style={{ fontSize: font.md, color: colors.brand, fontWeight: "600" }}>
            {lease.propertyName}, {lease.unitLabel}
          </Text>
          <Text onPress={() => go(`/stay/tenants/${lease.tenantContactId}`)} style={{ fontSize: font.sm, color: colors.brand }}>
            Tenant account
          </Text>
        </View>

        <Button variant="brand" icon="receipt-outline" title="Record payment" onPress={recordPayment} />

        {lease.renewedToLeaseId && (
          <Card onPress={() => go(`/stay/leases/${lease.renewedToLeaseId}`)} style={{ backgroundColor: colors.surface }}>
            <Body small>
              This lease was renewed. <Text style={{ color: colors.brand, fontWeight: "600" }}>Open the current lease</Text>
            </Body>
          </Card>
        )}

        <StatGrid>
          <Stat
            label="Balance"
            value={money(lease.balance, cur)}
            tone={lease.balance > 0 ? "warning" : "good"}
            hint={lease.credit > 0 ? `Includes credit of ${money(lease.credit, cur)}` : undefined}
          />
          <Stat
            label="Overdue"
            value={money(lease.overdue, cur)}
            tone={lease.overdue > 0 ? "danger" : undefined}
            hint={lease.oldestOverdue ? `Oldest due ${dateLabel(lease.oldestOverdue)}` : undefined}
          />
          <Stat label="Monthly rent" value={money(lease.rentAmount, cur)} hint={`Due on day ${lease.dueDay}`} />
          <Stat
            label="Deposit held"
            value={lease.deposit ? money(held, cur) : "None"}
            hint={lease.deposit ? `${heldInLabel(lease.deposit.heldIn)}; ${money(lease.deposit.received, cur)} of ${money(lease.deposit.expected, cur)} received` : undefined}
          />
        </StatGrid>

        <Section title="Lease">
          <Card>
            <Facts
              items={[
                { label: "Start", value: dateLabel(lease.startDate) },
                { label: "End", value: `${dateLabel(lease.endDate)}${active && lease.daysToEnd >= 0 ? ` (in ${lease.daysToEnd} days)` : ""}` },
                { label: "Currency", value: cur },
                { label: "Landlord", value: lease.landlordName },
                { label: "Manager", value: lease.managerName ?? "Not assigned" },
                { label: "Management fee", value: lease.managementFeePct !== null ? `${lease.managementFeePct}%` : "-" },
                { label: "Tenant phone", value: lease.tenant?.phone },
                { label: "Tenant email", value: lease.tenant?.email },
                { label: "Tenant ID number", value: lease.tenant?.idNumber },
                ...(lease.noticeGivenOn ? [{ label: "Notice given", value: dateLabel(lease.noticeGivenOn) }] : []),
                ...(lease.moveOutDate ? [{ label: active ? "Planned move-out" : "Moved out", value: dateLabel(lease.moveOutDate) }] : []),
                ...(lease.endReason ? [{ label: "Reason for ending", value: lease.endReason }] : []),
                ...(lease.rentIncrease
                  ? [
                      {
                        label: "Rent increase",
                        value: `${money(lease.rentIncrease.newRent, cur)} from ${dateLabel(lease.rentIncrease.effectiveDate)}${lease.rentIncrease.appliedAt ? " (applied)" : ""}`,
                      },
                    ]
                  : []),
              ]}
            />
            {lease.renewedFromLeaseId && <Button small variant="ghost" title="Open the previous lease" onPress={() => go(`/stay/leases/${lease.renewedFromLeaseId}`)} />}
          </Card>
        </Section>

        <Section
          title="Statement"
          right={
            lease.statement.length > 8 ? (
              <Text onPress={() => setFullStatement((s) => !s)} style={{ color: colors.brand, fontWeight: "600" }}>
                {fullStatement ? "Show less" : "Show all"}
              </Text>
            ) : undefined
          }
        >
          <Card>
            <StatementList lines={lease.statement} currency={cur} limit={fullStatement ? undefined : 8} />
          </Card>
        </Section>

        <Section title="Payments" right={<Button small variant="ghost" icon="add" title="Record" onPress={recordPayment} />}>
          {lease.payments.length === 0 ? (
            <Body small muted>
              No payments yet.
            </Body>
          ) : (
            lease.payments.map((p) => (
              <Card key={p._id}>
                <Row style={{ flexWrap: "wrap" }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: p.reversed ? colors.faint : colors.text, textDecorationLine: p.reversed ? "line-through" : "none" }}>
                    {money(p.amount, cur)}
                  </Text>
                  {p.purpose === "deposit" && <Badge tone="info" label="Deposit" />}
                  {p.reversed && <Badge tone="danger" label="Reversed" />}
                </Row>
                <Body small muted>
                  {p.receiptNumber}, {dateLabel(p.paidOn)}, {methodLabel(p.method)}
                  {p.reference ? `, ref ${p.reference}` : ""}
                  {p.reverseReason ? `. Reason: ${p.reverseReason}` : ""}
                </Body>
                <Row style={{ flexWrap: "wrap" }}>
                  <Button small variant="secondary" icon="share-outline" title="Share PDF" loading={sharingId === p._id} onPress={() => share(p._id)} />
                  {!p.reversed && !!lease.tenant?.email && (
                    <Button
                      small
                      variant="secondary"
                      icon="mail-outline"
                      title="Email"
                      onPress={() =>
                        run(
                          async () => {
                            await emailReceipt({ paymentId: p._id });
                            return true;
                          },
                          { success: "Receipt emailed" },
                        )
                      }
                    />
                  )}
                  {!p.reversed && lease.canAdmin && (
                    <Button small variant="danger" title="Reverse" onPress={() => setReversing({ ...p, currency: cur, tenantName: lease.tenantName })} />
                  )}
                </Row>
              </Card>
            ))
          )}
        </Section>

        <Section title="Charges" right={lease.canEdit ? <Button small variant="ghost" icon="add" title="Add" onPress={() => setSheet("charge")} /> : undefined}>
          {lease.charges.length === 0 ? (
            <Body small muted>
              No charges yet. Rent is charged automatically before each due date.
            </Body>
          ) : (
            lease.charges.map((c) => (
              <Card key={c._id}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ flex: 1, fontSize: font.md, fontWeight: "600", color: colors.text }}>{c.description}</Text>
                  <ChargeStatusBadge status={c.status} />
                </Row>
                <Body small muted>
                  {chargeKindLabel(c.kind)}, due {dateLabel(c.dueDate)}, {money(c.amount, cur)}
                  {c.status === "part_paid" ? `, ${money(c.outstanding, cur)} left` : ""}
                  {c.cancelReason ? `. Cancelled: ${c.cancelReason}` : ""}
                </Body>
                {lease.canEdit && c.status !== "cancelled" && c.status !== "paid" && (
                  <Button small variant="ghost" title="Cancel charge" onPress={() => setCancelling(c)} style={{ alignSelf: "flex-start" }} />
                )}
              </Card>
            ))
          )}
        </Section>

        <Section title="Deposit" right={lease.canEdit && held > 0 ? <Button small variant="ghost" title="Apply or refund" onPress={() => setSheet("deposit")} /> : undefined}>
          {!lease.deposit ? (
            <Body small muted>
              No deposit on this lease.
            </Body>
          ) : (
            <Card>
              <Facts
                items={[
                  { label: "Expected", value: money(lease.deposit.expected, cur) },
                  { label: "Received", value: money(lease.deposit.received, cur) },
                  { label: "Applied to amounts owed", value: money(lease.deposit.applied, cur) },
                  { label: "Refunded", value: money(lease.deposit.refunded, cur) },
                  { label: "Held now", value: money(held, cur) },
                  { label: "Held in", value: heldInLabel(lease.deposit.heldIn) },
                ]}
              />
              {lease.deposit.movements.map((m, i) => (
                <Row key={i} style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                  <Body small style={{ flex: 1 }}>
                    {dateLabel(m.date)}: {m.kind === "received" ? "received" : m.kind === "applied" ? "applied to amounts owed" : "refunded"}
                    {m.note ? ` (${m.note})` : ""}
                  </Body>
                  <Body small style={{ fontWeight: "600" }}>
                    {money(m.amount, cur)}
                  </Body>
                </Row>
              ))}
              {lease.deposit.received < lease.deposit.expected && <Button small variant="secondary" title="Record deposit received" onPress={recordPayment} />}
            </Card>
          )}
        </Section>

        <Section title="Arrears notes" right={<Button small variant="ghost" icon="add" title="Note" onPress={() => setSheet("note")} />}>
          {lease.notes.length === 0 ? (
            <Body small muted>
              Log calls and promises to pay here.
            </Body>
          ) : (
            lease.notes.map((n) => (
              <Card key={n._id}>
                <Body small>{n.note}</Body>
                <Body small muted>
                  {n.by}, {dayLabel(n.createdAt)}
                  {n.promiseDate ? `. Promised ${n.promiseAmount ? money(n.promiseAmount, cur) : "payment"} by ${dateLabel(n.promiseDate)}` : ""}
                </Body>
              </Card>
            ))
          )}
        </Section>

        <Section title="Repairs and inspections">
          <ListItem icon="construct-outline" title="Repairs for this unit" onPress={() => go(`/stay/maintenance?unitId=${lease.unitId}`)} />
          <ListItem icon="add-circle-outline" title="Report a repair" onPress={() => go(`/stay/maintenance/new?unitId=${lease.unitId}`)} />
          <ListItem icon="clipboard-outline" title="Inspections for this unit" onPress={() => go(`/stay/inspections?unitId=${lease.unitId}`)} />
          <ListItem icon="add-circle-outline" title="Start an inspection" onPress={() => go(`/stay/inspections/new?unitId=${lease.unitId}`)} />
        </Section>

        <StayDocuments stayPropertyId={lease.stayPropertyId} leaseId={lease._id} />
      </Screen>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Lease actions">
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <ListItem
              key={a.kind}
              title={a.label}
              onPress={() => {
                setMenu(false);
                // Let the menu close before the next sheet opens.
                setTimeout(() => setSheet(a.kind), 350);
              }}
            />
          ))}
      </Sheet>

      <LeaseSheets kind={sheet} lease={lease} onClose={() => setSheet(null)} onRenewed={(newId) => router.replace(`/stay/leases/${newId}` as Href)} />
      <ReversePaymentSheet target={reversing} onClose={() => setReversing(null)} />

      <Sheet
        open={!!cancelling}
        onClose={() => {
          setCancelling(null);
          setReason("");
        }}
        title="Cancel charge"
        footer={<Button variant="danger" title="Cancel charge" onPress={doCancel} loading={busy} disabled={!reason.trim()} />}
      >
        <Notice tone="warning">&quot;{cancelling?.description ?? ""}&quot; stays on record, marked cancelled.</Notice>
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="For example: raised in error" />
      </Sheet>
    </>
  );
}
