/** Clients paying for stands on instalments, overdue first. */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Card, Chips, EmptyState, List, Loading, Row, SearchBar } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel, money } from "@/lib/finance/format";

type Show = "all" | "overdue";

export default function FinanceInstalments() {
  const router = useRouter();
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const [show, setShow] = useState<Show>("all");
  const [search, setSearch] = useState("");
  const { refreshing, onRefresh } = useRefresh();
  const rows = useQuery(api.finance.stands.listStands, isStaff ? { overdueOnly: show === "overdue" || undefined } : "skip");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows;
    return rows.filter((r) => [r.buyerName, r.development, r.standNumber].some((s) => s.toLowerCase().includes(q)));
  }, [rows, search]);

  if (fin === undefined) return <Loading />;
  if (!isStaff) return <StaffOnly />;

  return (
    <View style={{ flex: 1 }}>
      <List
        data={shown}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Chips<Show>
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "All clients" },
                { value: "overdue", label: "Overdue" },
              ]}
            />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Client, development or stand" />
          </View>
        }
        empty={<EmptyState icon="calendar-outline" title={show === "overdue" ? "Nobody is overdue" : "No clients on instalments"} message={show === "overdue" ? "Every client is up to date." : "Developments and stands are set up on the website."} />}
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => (
          <Card onPress={() => router.push(`/finance/instalments/${r._id}` as Href)}>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{r.buyerName}</Text>
                <Body small muted numberOfLines={1}>
                  Stand {r.standNumber}, {r.development}
                </Body>
                <Body small muted>
                  Paid {money(r.paidToDate, r.currency)} of {money(r.price + r.interest, r.currency)}
                </Body>
                {r.nextDueDate && r.status !== "cancelled" ? (
                  <Body small muted>
                    Next {money(r.nextDueAmount, r.currency)} on {dateLabel(r.nextDueDate)}
                  </Body>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{money(r.balance, r.currency)}</Text>
                <Text style={{ fontSize: font.xs, color: colors.muted }}>balance</Text>
                {r.status === "cancelled" ? (
                  <Badge label="Cancelled" />
                ) : r.overdue > 0 ? (
                  <Badge tone="danger" label={`${money(r.overdue, r.currency)} overdue`} />
                ) : r.balance <= 0 ? (
                  <Badge tone="success" label="Paid up" />
                ) : null}
              </View>
            </Row>
          </Card>
        )}
      />
    </View>
  );
}
