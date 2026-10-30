/** SyncWorth dashboard: my jobs, open jobs by status, due dates, workload, turnaround and fees. */
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { OPEN_STATUSES } from "../../../../convex/worth/lib";
import { Body, Button, Card, Loading, Row, Screen, Section, Stat, StatGrid } from "../../../components/ui";
import { Actions } from "../../../components/worth/bits";
import { JobCard, type JobRow } from "../../../components/worth/JobCard";
import { STATUS_LABELS, formatNumber, formatTotals, usePullRefresh } from "../../../lib/worth/util";
import { colors, font, space } from "../../../lib/theme";

export default function WorthDashboard() {
  const router = useRouter();
  const data = useQuery(api.worth.dashboard.overview);
  const { refreshing, onRefresh } = usePullRefresh();
  if (data === undefined) return <Loading />;
  const { caps, fees } = data;
  const feesOnly = !caps.seesValues;
  const open = (id: string, tab?: string) => router.push(`/worth/jobs/${id}${tab ? `?tab=${tab}` : ""}` as Href);

  const jobList = (rows: JobRow[], empty: string, mine = false) =>
    rows.length === 0 ? (
      <Body muted small>
        {empty}
      </Body>
    ) : (
      rows.map((j) => (
        <JobCard
          key={j._id}
          job={j}
          showValuer={!mine}
          onPress={() => open(j._id)}
          action={
            mine && (j.status === "assigned" || j.status === "new") ? (
              <Button small title="Start inspection" onPress={() => open(j._id, "inspection")} />
            ) : undefined
          }
        />
      ))
    );

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {(caps.canManageJobs || (caps.canWorkAssigned && !caps.canAdmin)) && (
        <Actions>
          {caps.canManageJobs && <Button small icon="add" title="Log instruction" onPress={() => router.push("/worth/jobs/new" as Href)} />}
          {caps.canWorkAssigned && !caps.canAdmin && (
            <Button small variant="secondary" icon="person-outline" title="My valuer profile" onPress={() => router.push("/worth/settings" as Href)} />
          )}
        </Actions>
      )}

      {!feesOnly && data.myJobs.length > 0 && (
        <Section title="My jobs by due date">{jobList(data.myJobs, "", true)}</Section>
      )}

      {!feesOnly && (
        <StatGrid>
          <Stat label="Open jobs" value={String(data.openCount)} onPress={() => router.push("/worth/jobs" as Href)} />
          <Stat label="Overdue" value={String(data.overdue.length)} tone={data.overdue.length ? "warning" : "good"} />
          <Stat label="Due this week" value={String(data.dueThisWeek.length)} />
          <Stat
            label="Average turnaround"
            value={data.averageTurnaroundDays === null ? "-" : `${formatNumber(data.averageTurnaroundDays, 1)} days`}
            hint={`Last 90 days (${data.turnaroundSample} jobs)`}
          />
        </StatGrid>
      )}

      {(caps.seesAllJobs || caps.canManageFees) && (
        <Section title="Fees">
          <StatGrid>
            <Stat label="Issued this month" value={formatTotals(fees.issuedThisMonth)} />
            <Stat label="Invoiced this month" value={formatTotals(fees.invoicedThisMonth)} />
            <Stat
              label="Unpaid fees"
              value={formatTotals(fees.unpaid)}
              hint={`${fees.unpaidCount} job${fees.unpaidCount === 1 ? "" : "s"}`}
              tone={fees.unpaidCount ? "warning" : undefined}
              onPress={() => router.push("/worth/reports?report=unpaid" as Href)}
            />
          </StatGrid>
        </Section>
      )}

      {!feesOnly && (
        <>
          <Section title="Open jobs by status">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {OPEN_STATUSES.map((s) => (
                <Card key={s} onPress={() => router.push(`/worth/jobs?status=${s}` as Href)} style={{ paddingVertical: space.sm, paddingHorizontal: space.md, gap: 0, minWidth: 96 }}>
                  <Text style={{ fontSize: font.xs, color: colors.muted }}>{STATUS_LABELS[s]}</Text>
                  <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{data.byStatus[s] ?? 0}</Text>
                </Card>
              ))}
            </View>
          </Section>

          <Section title="Overdue">{jobList(data.overdue, "Nothing overdue.")}</Section>
          <Section title="Due this week">{jobList(data.dueThisWeek, "Nothing due in the next seven days.")}</Section>

          {data.workload.length > 0 && (
            <Section title="Workload per valuer">
              <Card style={{ gap: 0, paddingVertical: space.sm }}>
                {data.workload.map((w, i) => (
                  <Row key={w.userId} style={{ justifyContent: "space-between", paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Text style={{ flex: 1, fontSize: font.md, color: colors.text }}>{w.name}</Text>
                    <Text style={{ fontSize: font.sm, color: colors.muted }}>
                      {w.open} open · {w.issuedThisMonth} issued this month
                    </Text>
                  </Row>
                ))}
              </Card>
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
