/** Reports: agents, tasks, lead sources, properties, revenue and (admins) leaderboards, by period. */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Card, Chips, Ionicons, Row, Screen, Select } from "../../../components/ui";
import {
  AgentsSection,
  LeaderboardSection,
  PropertiesSection,
  RevenueSection,
  SourcesSection,
  TasksSection,
} from "../../../components/crm/records/reports/sections";
import { getPeriodRange, PERIOD_OPTIONS, shiftPeriod, type ReportPeriod } from "../../../lib/crm/records/reports/periods";
import { useSession } from "../../../lib/session";
import { colors, font, space } from "../../../lib/theme";

const TABS = [
  { value: "agents", label: "Agents" },
  { value: "tasks", label: "Tasks" },
  { value: "sources", label: "Lead sources" },
  { value: "properties", label: "Properties" },
  { value: "revenue", label: "Revenue" },
  { value: "leaderboard", label: "Leaderboard" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Arrow({ icon, label, onPress }: { icon: "chevron-back" | "chevron-forward"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={22} color={colors.brand} />
    </Pressable>
  );
}

export default function Reports() {
  const { user } = useSession();
  // A real admin in Agent Mode is treated as an agent, as on the website.
  const isAdmin = user?.role === "admin" && !user?.agentMode;
  const tabs = isAdmin ? TABS : TABS.filter((t) => t.value !== "leaderboard");

  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [ref, setRef] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>("agents");
  const [agentId, setAgentId] = useState("");
  const agents = useQuery(api.users.listActiveUsers, isAdmin ? {} : "skip");

  const range = useMemo(() => getPeriodRange(period, ref), [period, ref]);
  const active: Tab = tabs.some((t) => t.value === tab) ? tab : "agents";
  const props = { start: range.start, end: range.end, ownerUserId: (agentId || undefined) as Id<"users"> | undefined, periodLabel: range.label };

  return (
    <Screen>
      <Stack.Screen options={{ title: "Reports" }} />
      <Card style={{ gap: space.md }}>
        <Chips<ReportPeriod>
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setRef(new Date());
          }}
          options={PERIOD_OPTIONS}
        />
        {period !== "all" && (
          <Row style={{ justifyContent: "space-between" }}>
            <Arrow icon="chevron-back" label="Previous period" onPress={() => setRef((d) => shiftPeriod(period, d, -1))} />
            <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text, flex: 1, textAlign: "center" }}>{range.label}</Text>
            <Arrow icon="chevron-forward" label="Next period" onPress={() => setRef((d) => shiftPeriod(period, d, 1))} />
          </Row>
        )}
        {isAdmin && (
          <Select label="Agent" value={agentId} onChange={setAgentId} options={[{ value: "", label: "All agents" }, ...(agents ?? []).map((a) => ({ value: a._id as string, label: a.name }))]} />
        )}
      </Card>

      <Chips<Tab> value={active} onChange={setTab} options={[...tabs]} />

      <View>
        {active === "agents" && <AgentsSection {...props} />}
        {active === "tasks" && <TasksSection {...props} />}
        {active === "sources" && <SourcesSection {...props} />}
        {active === "properties" && <PropertiesSection {...props} />}
        {active === "revenue" && <RevenueSection {...props} />}
        {active === "leaderboard" && <LeaderboardSection {...props} />}
      </View>
    </Screen>
  );
}
