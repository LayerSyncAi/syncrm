/**
 * Buyers paying for stands on a plan, overdue first. Shared by Sync Dev
 * (Buyers) and Sync Finance (Instalments); the caller says where a row opens.
 */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Card, Chips, EmptyState, List, Row, SearchBar } from "../ui";
import { useRefresh } from "../../lib/stay/hooks";
import { colors, font, space } from "../../lib/theme";
import { dateLabel, money } from "@/lib/finance/format";

type Show = "all" | "overdue";

export function BuyersList({ hrefFor, emptyHint }: { hrefFor: (standId: Id<"finStands">) => string; emptyHint: string }) {
  const router = useRouter();
  const [show, setShow] = useState<Show>("all");
  const [search, setSearch] = useState("");
  const { refreshing, onRefresh } = useRefresh();
  const rows = useQuery(api.dev.sales.listStands, { overdueOnly: show === "overdue" || undefined });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows;
    return rows.filter((r) => [r.buyerName, r.development, r.standNumber, r.buyerPhone].some((s) => s.toLowerCase().includes(q)));
  }, [rows, search]);

  return (
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
              { value: "all", label: "All buyers" },
              { value: "overdue", label: "Overdue" },
            ]}
          />
          <SearchBar value={search} onChangeText={setSearch} placeholder="Buyer, development or stand" />
        </View>
      }
      empty={
        <EmptyState
          icon="people-outline"
          title={show === "overdue" ? "Nobody is overdue" : search ? "No buyer matches" : "No buyers yet"}
          message={show === "overdue" ? "Every buyer is up to date." : search ? "Try another name or stand." : emptyHint}
        />
      }
      keyExtractor={(r) => r._id}
      renderItem={({ item: r }) => (
        <Card onPress={() => router.push(hrefFor(r._id) as Href)}>
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
  );
}
