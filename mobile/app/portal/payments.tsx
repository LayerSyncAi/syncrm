/** Tenant payments: running statement and receipts, each receipt shareable as a PDF. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActivityIndicator } from "react-native";
import { Body, Card, EmptyState, Ionicons, Loading, Screen, Section, Title } from "../../components/ui";
import { KindGuard, LeaseSelect, useSelectedLease, usePortal } from "../../components/portal/common";
import { shareReceiptPdf } from "../../lib/portal/pdf";
import { useRun } from "../../lib/useRun";
import { dateLabel, money } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

const bal = (n: number, c: string) => (n < 0 ? `${money(Math.abs(n), c)} CR` : money(n, c));

function ReceiptShare({ paymentId }: { paymentId: Id<"stayPayments"> }) {
  const convex = useConvex();
  const portal = usePortal();
  const { busy, run } = useRun();
  return (
    <Pressable
      disabled={busy}
      accessibilityLabel="Share receipt as PDF"
      hitSlop={8}
      onPress={() =>
        run(async () => {
          const r = await convex.query(api.portal.tenant.receipt, { paymentId });
          await shareReceiptPdf(r, portal?.logoUrl ?? null);
        })
      }
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      {busy ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="share-outline" size={22} color={colors.brand} />}
    </Pressable>
  );
}

function Inner() {
  const leases = useQuery(api.portal.tenant.home);
  const [leaseId, setLeaseId] = useSelectedLease(leases);
  const st = useQuery(api.portal.tenant.statement, leaseId ? { leaseId: leaseId as Id<"stayLeases"> } : "skip");

  if (leases === undefined) return <Loading />;
  if (leases.length === 0) return <EmptyState icon="receipt-outline" title="No payments yet" />;

  return (
    <Screen>
      <Title>Payments</Title>
      <LeaseSelect leases={leases} value={leaseId} onChange={setLeaseId} />
      {!st ? (
        <Loading />
      ) : (
        <>
          <Section title="Statement">
            <Card>
              {st.lines.length === 0 ? (
                <Body muted>Nothing to show yet.</Body>
              ) : (
                <>
                  {st.lines.map((l, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Body>{l.description}</Body>
                        <Body small muted>{dateLabel(l.date)}</Body>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: font.md, color: l.credit ? colors.success : colors.text }}>
                          {l.credit ? `- ${money(l.credit, st.currency)}` : money(l.debit, st.currency)}
                        </Text>
                        <Body small muted>Balance {bal(l.balance, st.currency)}</Body>
                      </View>
                    </View>
                  ))}
                  <Body small muted style={{ marginTop: space.sm }}>CR means the account is in credit.</Body>
                </>
              )}
            </Card>
          </Section>
          <Section title="Receipts">
            <Card>
              {st.receipts.length === 0 ? (
                <Body muted>No receipts yet.</Body>
              ) : (
                st.receipts.map((r, i) => (
                  <View key={r._id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{r.receiptNumber}</Text>
                      <Body small muted>
                        {dateLabel(r.paidOn)}. {r.method.replace(/_/g, " ")}
                        {r.purpose === "deposit" ? ". Deposit" : ""}
                      </Body>
                    </View>
                    <Text style={{ fontSize: font.md, color: colors.text }}>{money(r.amount, r.currency)}</Text>
                    <ReceiptShare paymentId={r._id} />
                  </View>
                ))
              )}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

export default function PortalPayments() {
  return (
    <KindGuard kind="tenant">
      <Inner />
    </KindGuard>
  );
}
