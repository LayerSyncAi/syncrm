/**
 * SynCRM dashboard: headline figures and win rate (leads.dashboardStats),
 * today's agenda (activities.listTodosScheduledBetween), lead score insights
 * (leads.dashboardScoreStats) and the pipeline by stage. Admins see the whole
 * agency, agents their own leads.
 */
import { useState } from "react";
import { Text } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Button, Card, EmptyState, ListItem, Loading, Row, Screen, Section, Stat, StatGrid } from "../../../components/ui";
import { BarRow, ScoreBadge } from "../../../components/crm/leads/bits";
import { ActivityFormSheet } from "../../../components/crm/leads/ActivitySheets";
import { activityTypeLabel, startOfToday } from "../../../lib/crm/leads/helpers";
import { isEffectiveAdmin, useRefresh } from "../../../lib/crm/leads/useRefresh";
import { useSession } from "../../../lib/session";
import { colors, font, space } from "../../../lib/theme";

const DAY = 24 * 60 * 60 * 1000;
// Cold to on fire, as on the website.
const BUCKET_COLORS = [colors.danger, "#f97316", colors.warning, colors.primary, colors.success];

function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CrmDashboard() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = isEffectiveAdmin(user);
  const { refreshing, onRefresh } = useRefresh();
  const [newTask, setNewTask] = useState(false);
  const stats = useQuery(api.leads.dashboardStats, {});
  const scores = useQuery(api.leads.dashboardScoreStats, {});
  // Stable for the whole day, so the query does not restart on each render.
  const start = startOfToday();
  const agenda = useQuery(api.activities.listTodosScheduledBetween, { rangeStartMs: start, rangeEndMs: start + DAY - 1 });
  const go = (href: string) => router.push(href as Href);

  if (stats === undefined) return <Loading />;
  const s = stats.stats;
  const maxStage = Math.max(1, ...stats.stageBreakdown.map((x) => x.count));
  const maxBucket = Math.max(1, ...(scores?.distribution ?? []).map((d) => d.count));

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>Pipeline overview</Text>
          <Badge label={isAdmin ? "All leads" : "My leads"} tone="info" />
        </Row>
        <BarRow label="Win rate" value={`${stats.monthlyProgress}%`} percent={stats.monthlyProgress} />
      </Card>

      <StatGrid>
        <Stat label="Total leads" value={String(s.totalLeads)} onPress={() => go("/crm/leads")} />
        <Stat label="Open leads" value={String(s.openLeads)} hint="Not yet won or lost" onPress={() => go("/crm/leads")} />
        <Stat label="Won" value={String(s.totalWon)} tone="good" />
        <Stat label="Lost" value={String(s.totalLost)} tone={s.totalLost ? "danger" : undefined} />
      </StatGrid>

      <Row>
        <Button style={{ flex: 1 }} small icon="add" title="New lead" onPress={() => go("/crm/leads/new")} />
        <Button style={{ flex: 1 }} small variant="secondary" icon="checkbox-outline" title="New task" onPress={() => setNewTask(true)} />
      </Row>

      <Section title="Today's agenda" right={<Text onPress={() => go("/crm/tasks")} style={{ color: colors.brand, fontWeight: "600" }}>All tasks</Text>}>
        {agenda === undefined ? (
          <Loading />
        ) : agenda.items.length === 0 ? (
          <Card>
            <Body muted>Nothing scheduled for today.</Body>
          </Card>
        ) : (
          agenda.items.map((a) => (
            <ListItem
              key={a._id}
              icon="time-outline"
              title={a.title}
              subtitle={[a.scheduledAt ? timeOf(a.scheduledAt) : "", activityTypeLabel(a.type), a.leadName ?? ""].filter(Boolean).join(" · ")}
              meta={a.scheduledAt && a.scheduledAt < Date.now() ? "Overdue" : undefined}
              onPress={() => go(a.leadId ? `/crm/leads/${a.leadId}` : "/crm/tasks")}
            />
          ))
        )}
      </Section>

      <Section title="Leads by stage">
        <Card style={{ gap: space.md }}>
          {stats.stageBreakdown.length === 0 ? (
            <Body muted>No leads in the pipeline yet.</Body>
          ) : (
            stats.stageBreakdown.map((st) => <BarRow key={st.id} label={st.name} value={String(st.count)} percent={(st.count / maxStage) * 100} />)
          )}
        </Card>
      </Section>

      {scores === undefined ? (
        <Loading />
      ) : (
        <>
          <Section title="Lead score distribution">
            <Card style={{ gap: space.md }}>
              <Body muted small>
                {scores.scoredCount} of {scores.totalActive} leads scored{scores.scoredCount > 0 ? `, average ${scores.overallAvg}` : ""}
              </Body>
              {scores.totalActive === 0 ? (
                <Body muted>No leads to show.</Body>
              ) : (
                scores.distribution.map((b, i) => (
                  <BarRow key={b.label} label={b.label} hint={`(${b.range})`} value={String(b.count)} percent={(b.count / maxBucket) * 100} color={BUCKET_COLORS[i]} />
                ))
              )}
            </Card>
          </Section>

          <Section title="Average score by stage">
            <Card style={{ gap: space.md }}>
              {scores.avgScoreByStage.filter((x) => x.count > 0).length === 0 ? (
                <Body muted>No stage data yet.</Body>
              ) : (
                scores.avgScoreByStage
                  .filter((x) => x.count > 0)
                  .map((x) => (
                    <BarRow
                      key={x.id}
                      label={x.name}
                      hint={`(${x.count} lead${x.count === 1 ? "" : "s"})`}
                      value={String(x.avgScore)}
                      percent={x.avgScore}
                      color={x.avgScore >= 70 ? colors.success : x.avgScore >= 40 ? colors.warning : colors.danger}
                    />
                  ))
              )}
            </Card>
          </Section>

          {scores.topUnworked.length > 0 && (
            <Section title="Top unworked leads" right={<Text onPress={() => go("/crm/leads")} style={{ color: colors.brand, fontWeight: "600" }}>View all</Text>}>
              <Body muted small>
                High scores with no activity in the last 7 days.
              </Body>
              {scores.topUnworked.map((l) => (
                <ListItem key={l._id} title={l.fullName} subtitle={`Owner: ${l.ownerName}`} right={<ScoreBadge score={l.score} />} onPress={() => go(`/crm/leads/${l._id}`)} />
              ))}
            </Section>
          )}
        </>
      )}

      {stats.stageBreakdown.length === 0 && s.totalLeads === 0 && (
        <EmptyState icon="git-network-outline" title="No leads yet" message="Add your first lead or import a CSV." action={<Button title="Import leads" variant="secondary" onPress={() => go("/crm/leads/import")} />} />
      )}
      <ActivityFormSheet open={newTask} onClose={() => setNewTask(false)} />
    </Screen>
  );
}
