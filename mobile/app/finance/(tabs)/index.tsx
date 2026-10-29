/** Sync Finance dashboard: money in and out, balances and what is owed, this week or this month. */
import { useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Button, Chips, ListItem, Loading, Screen, Section, Stat, StatGrid } from "../../../components/ui";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { space } from "../../../lib/theme";
import { ACCOUNT_TYPE_LABELS, dateLabel, money } from "@/lib/finance/format";

type Range = "week" | "month";

export default function FinanceDashboard() {
  const router = useRouter();
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const [range, setRange] = useState<Range>("month");
  const data = useQuery(api.finance.reports.dashboard, isStaff ? { range } : "skip");
  const { refreshing, onRefresh } = useRefresh();
  const go = (href: string) => router.push(href as Href);

  if (fin === undefined) return <Loading />;

  if (!isStaff) {
    return (
      <Screen>
        <Body muted>See what the agency holds for the landlords of the properties you manage.</Body>
        <ListItem icon="people-outline" title="Landlords" subtitle="Balances held and monthly statements" onPress={() => go("/finance/landlords")} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={{ gap: space.sm }}>
        <Button variant="brand" icon="add-circle-outline" title="Money in" onPress={() => go("/finance/money/in")} />
        <Button variant="secondary" icon="calculator-outline" title="Cash-up" onPress={() => go("/finance/money/cash-up")} />
      </View>

      <Chips<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: "week", label: "This week" },
          { value: "month", label: "This month" },
        ]}
      />

      {data === undefined ? (
        <Loading />
      ) : (
        <>
          <Body muted small>
            From {dateLabel(data.from)} to {dateLabel(data.to)}. USD and ZiG are shown separately.
          </Body>
          <StatGrid>
            <Stat label="Money in" value={data.totals.moneyIn} tone="good" hint="Excluding transfers" onPress={() => go("/finance/money")} />
            <Stat label="Money out" value={data.totals.moneyOut} hint="Excluding transfers" onPress={() => go("/finance/money")} />
            <Stat label="Balance in all accounts" value={data.totals.balance} />
            <Stat label="Held in trust" value={data.heldInTrust} hint="For landlords, tenants, buyers and developers" onPress={() => go("/finance/landlords")} />
            <Stat label="Commission earned" value={data.commissionEarned} tone="good" />
            <Stat
              label="Payouts due"
              value={data.payoutsDue}
              hint={data.payoutsAwaitingApproval ? `${data.payoutsAwaitingApproval} awaiting approval` : "Landlord balances"}
              tone={data.payoutsAwaitingApproval ? "warning" : undefined}
              onPress={() => go("/finance/payouts")}
            />
            <Stat label="Unpaid invoices" value={data.unpaidInvoices.total} hint={`${data.unpaidInvoices.count} invoice${data.unpaidInvoices.count === 1 ? "" : "s"}`} tone={data.unpaidInvoices.count ? "warning" : undefined} />
            <Stat label="Tenant arrears" value={data.tenantArrears} tone="danger" />
          </StatGrid>

          <Section title="Balance per account">
            {data.accounts.length === 0 ? (
              <Body muted small>
                No accounts yet. Add your bank accounts and cash floats in Finance settings on the website.
              </Body>
            ) : (
              data.accounts.map((a) => (
                <ListItem
                  key={a._id}
                  title={a.name}
                  subtitle={`${ACCOUNT_TYPE_LABELS[a.type]}, in ${money(a.moneyIn, a.currency)}, out ${money(a.moneyOut, a.currency)}`}
                  right={money(a.balance, a.currency)}
                />
              ))
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
