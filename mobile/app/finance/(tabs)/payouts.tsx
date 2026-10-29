/** Payouts prepared and waiting for a director to approve. Approving pays them. */
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, List, Loading, Row } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { confirm, useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { LEDGER_LABELS, dateLabel, money } from "@/lib/finance/format";

export default function FinancePayouts() {
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const rows = useQuery(api.finance.payouts.list, isStaff ? { status: "prepared" } : "skip");
  const approve = useMutation(api.finance.payouts.approve);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();

  if (fin === undefined) return <Loading />;
  if (!isStaff) return <StaffOnly />;

  const onApprove = async (p: { _id: Id<"finPayouts">; number: string; payeeName: string; amount: number; currency: string }) => {
    const amount = money(p.amount, p.currency);
    const ok = await confirm("Approve payout", `Pay ${amount} to ${p.payeeName} (${p.number}). The money leaves the account and the payout is marked paid.`, "Approve and pay");
    if (!ok) return;
    await run(
      async () => {
        await approve({ payoutId: p._id });
        return true;
      },
      { success: `${p.number} approved` },
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <List
        data={rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <Body muted small style={{ marginBottom: space.sm }}>
            Payouts prepared and waiting for approval. Prepare new payouts on the website.
          </Body>
        }
        empty={<EmptyState icon="checkmark-done-outline" title="Nothing to approve" message="Every prepared payout has been dealt with." />}
        keyExtractor={(p) => p._id}
        renderItem={({ item: p }) => (
          <Card>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{p.payeeName}</Text>
                <Body small muted>
                  {[p.number, LEDGER_LABELS[p.ledger as keyof typeof LEDGER_LABELS] ?? p.ledger, dateLabel(p.date), p.method].filter(Boolean).join(" · ")}
                </Body>
                <Body small muted>
                  Prepared by {p.preparedBy}
                </Body>
              </View>
              <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{money(p.amount, p.currency)}</Text>
            </Row>
            {p.canApprove ? (
              <Button small variant="brand" icon="checkmark-outline" title="Approve" onPress={() => onApprove(p)} disabled={busy} style={{ alignSelf: "flex-start" }} />
            ) : (
              <Body small muted>
                {fin.role.canApprove ? "Another director must approve a payout you prepared." : "A director approves this payout."}
              </Body>
            )}
          </Card>
        )}
      />
    </View>
  );
}
