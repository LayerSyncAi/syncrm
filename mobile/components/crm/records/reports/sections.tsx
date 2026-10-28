/**
 * Report sections, one per tab, each calling the same api.reports query as
 * the website's src/components/reports. Wide tables become cards; charts are
 * the View-based ones in ./charts. Money stays grouped by currency.
 */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { leadSourceLabel } from "@/lib/lead-sources";
import { ACTIVITY_TYPE_OPTIONS, activityTypeLabel } from "@/lib/activity-types";
import { Badge, Button, Card, EmptyState, Loading, Row, Stat, StatGrid } from "../../../ui";
import { BarsCard, Footnote, FunnelCard, MetricCard, PALETTE, SectionHead, ShareCard } from "./charts";
import { SpendSheet } from "./SpendSheet";
import { currencyText, shareReportCsv, type ExportPayload } from "../../../../lib/crm/records/reports/export";
import { useRun } from "../../../../lib/useRun";
import { dateTimeLabel } from "../../../../lib/format";
import { colors, font, space } from "../../../../lib/theme";

export type SectionProps = { start: number; end: number; ownerUserId?: Id<"users">; periodLabel: string };

const fileName = (base: string, period: string) => `${base}-${period}`.replace(/\s+/g, "-");

function useExport() {
  const { run } = useRun();
  return (build: () => ExportPayload) => run(() => shareReportCsv(build()));
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: space.lg }}>{children}</View>;
}

// ── Agents ─────────────────────────────────────────────────────────────

export function AgentsSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.agentPerformance, { start, end, ownerUserId });
  const exportCsv = useExport();
  if (data === undefined) return <Loading />;
  if (data.rows.length === 0) return <EmptyState icon="people-outline" title="No agent activity in this period" />;

  const sum = (k: "leadsAssigned" | "leadsContacted" | "viewingsBooked" | "offersReceived" | "dealsClosed") => data.rows.reduce((a, r) => a + r[k], 0);
  const build = (): ExportPayload => ({
    filename: fileName("agent-performance", periodLabel),
    title: "Agent performance",
    subtitle: periodLabel,
    tables: [
      {
        name: "Agent performance",
        columns: [
          { key: "name", label: "Agent" },
          { key: "leadsAssigned", label: "Assigned" },
          { key: "leadsContacted", label: "Contacted" },
          { key: "viewingsBooked", label: "Viewings" },
          { key: "offersReceived", label: "Offers" },
          { key: "dealsClosed", label: "Closed" },
          { key: "conversionRate", label: "Conversion %" },
          { key: "salesValueText", label: "Sales value" },
          { key: "commissionText", label: "Commission" },
          { key: "tasksCreated", label: "Tasks created" },
          { key: "tasksCompleted", label: "Tasks completed" },
          { key: "tasksPending", label: "Tasks pending" },
          { key: "tasksOverdue", label: "Tasks overdue" },
          { key: "taskCompletionRateText", label: "Task completion %" },
        ],
        rows: data.rows.map((r) => ({
          ...r,
          salesValueText: currencyText(r.salesValue),
          commissionText: currencyText(r.commission),
          taskCompletionRateText: `${r.taskCompletionRate}%`,
        })),
      },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Agent performance" onExport={() => exportCsv(build)} />
      <FunnelCard
        title="Pipeline funnel"
        steps={[
          { name: "Assigned", value: sum("leadsAssigned") },
          { name: "Contacted", value: sum("leadsContacted") },
          { name: "Viewings", value: sum("viewingsBooked") },
          { name: "Offers", value: sum("offersReceived") },
          { name: "Closed", value: sum("dealsClosed") },
        ]}
      />
      <BarsCard
        title="Leads assigned and deals closed"
        data={data.rows.slice(0, 8).map((r) => ({ name: r.name, leadsAssigned: r.leadsAssigned, dealsClosed: r.dealsClosed }))}
        bars={[
          { key: "leadsAssigned", name: "Leads assigned", color: colors.info },
          { key: "dealsClosed", name: "Deals closed", color: colors.success },
        ]}
      />
      {data.rows.map((r) => (
        <MetricCard
          key={r.userId}
          title={r.name}
          right={<Badge label={`${r.conversionRate}% conv.`} tone="info" />}
          items={[
            ["Assigned", r.leadsAssigned],
            ["Contacted", r.leadsContacted],
            ["Viewings", r.viewingsBooked],
            ["Offers", r.offersReceived],
            ["Closed", r.dealsClosed],
            ["Tasks done", `${r.taskCompletionRate}%`],
            ["Sales value", currencyText(r.salesValue)],
            ["Commission", currencyText(r.commission)],
          ]}
        />
      ))}
      <Footnote>Conversion is won divided by won plus lost, for leads closed in the period. Sales value and commission are grouped by currency with no exchange-rate conversion.</Footnote>
    </Wrap>
  );
}

// ── Tasks ──────────────────────────────────────────────────────────────

export function TasksSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.taskSummary, { start, end, ownerUserId });
  const log = useQuery(api.reports.taskActivityLog, { start, end, ownerUserId });
  const exportCsv = useExport();
  if (data === undefined) return <Loading />;
  const { totals, byAgent } = data;
  if (!(totals.created || totals.completed || totals.pending || totals.overdue)) return <EmptyState icon="checkbox-outline" title="No task activity in this period" />;

  const typeRows = ACTIVITY_TYPE_OPTIONS.map((t) => ({
    name: t.label,
    created: totals.byType[t.value]?.created ?? 0,
    completed: totals.byType[t.value]?.completed ?? 0,
  })).filter((r) => r.created || r.completed);
  const items = log?.items ?? [];
  type Item = (typeof items)[number];
  const context = (i: Item) => {
    const parts: string[] = [];
    if (i.leadName) parts.push(`Lead: ${i.leadName}`);
    if (i.propertyTitle) parts.push(`Property: ${i.propertyTitle}`);
    if (i.contactName && i.contactName !== i.leadName) parts.push(`${i.contactOwnerType ? "Owner" : "Contact"}: ${i.contactName}`);
    return parts.join(" · ");
  };
  const timing = (onTime: boolean | null) => (onTime === null ? "No due date" : onTime ? "On time" : "Late");

  const build = (): ExportPayload => ({
    filename: fileName("tasks", periodLabel),
    title: "Task summary",
    subtitle: periodLabel,
    summary: [
      { label: "Tasks created", value: String(totals.created) },
      { label: "Tasks completed", value: String(totals.completed) },
      { label: "Tasks pending", value: String(totals.pending) },
      { label: "Tasks overdue", value: String(totals.overdue) },
      { label: "Completion rate", value: `${totals.completionRate}%` },
      { label: "Completed on time", value: String(totals.completedOnTime) },
      { label: "Completed late", value: String(totals.completedLate) },
      { label: "On-time rate", value: `${totals.onTimeRate}%` },
    ],
    tables: [
      { name: "Tasks by type", columns: [{ key: "name", label: "Type" }, { key: "created", label: "Created" }, { key: "completed", label: "Completed" }], rows: typeRows },
      {
        name: "Tasks by agent",
        columns: [
          { key: "name", label: "Agent" },
          { key: "created", label: "Created" },
          { key: "completed", label: "Completed" },
          { key: "pending", label: "Pending" },
          { key: "overdue", label: "Overdue" },
          { key: "completionRateText", label: "Completion %" },
          { key: "onTimeRateText", label: "On-time %" },
        ],
        rows: byAgent.map((r) => ({ ...r, completionRateText: `${r.completionRate}%`, onTimeRateText: `${r.onTimeRate}%` })),
      },
      {
        name: "Completed task log",
        columns: [
          { key: "completedAtText", label: "Completed" },
          { key: "typeLabel", label: "Type" },
          { key: "title", label: "Task" },
          { key: "context", label: "Related to" },
          { key: "agentName", label: "Agent" },
          { key: "timing", label: "Timing" },
          { key: "completionNotes", label: "Outcome" },
        ],
        rows: items.map((i) => ({
          completedAtText: dateTimeLabel(i.completedAt),
          typeLabel: activityTypeLabel(i.type),
          title: i.title,
          context: context(i),
          agentName: i.agentName,
          timing: timing(i.onTime),
          completionNotes: i.completionNotes,
        })),
      },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Task summary" onExport={() => exportCsv(build)} />
      <StatGrid>
        <Stat label="Created" value={String(totals.created)} />
        <Stat label="Completed" value={String(totals.completed)} tone="good" />
        <Stat label="Pending" value={String(totals.pending)} />
        <Stat label="Overdue" value={String(totals.overdue)} tone={totals.overdue ? "danger" : undefined} />
        <Stat label="Completion rate" value={`${totals.completionRate}%`} />
        <Stat label="On-time rate" value={`${totals.onTimeRate}%`} />
      </StatGrid>
      <BarsCard
        title="Tasks by type"
        data={typeRows}
        bars={[
          { key: "created", name: "Created", color: colors.info },
          { key: "completed", name: "Completed", color: colors.success },
        ]}
      />
      <BarsCard
        title="Tasks created and completed by agent"
        data={byAgent.slice(0, 8).map((r) => ({ name: r.name, created: r.created, completed: r.completed }))}
        bars={[
          { key: "created", name: "Created", color: colors.info },
          { key: "completed", name: "Completed", color: colors.success },
        ]}
      />
      {byAgent.map((r) => (
        <MetricCard
          key={r.userId}
          title={r.name}
          items={[
            ["Created", r.created],
            ["Completed", r.completed],
            ["Pending", r.pending],
            ["Overdue", r.overdue],
            ["Completion", `${r.completionRate}%`],
            ["On time", `${r.onTimeRate}%`],
          ]}
        />
      ))}

      <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>Completed task log</Text>
      {log === undefined ? (
        <Loading />
      ) : items.length === 0 ? (
        <Footnote>No tasks were completed in this period.</Footnote>
      ) : (
        <>
          {items.map((i) => (
            <Card key={i._id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "600", color: colors.text, flex: 1 }} numberOfLines={2}>
                  {i.title}
                </Text>
                {i.onTime === null ? <Badge label="No due date" /> : <Badge label={i.onTime ? "On time" : "Late"} tone={i.onTime ? "success" : "danger"} />}
              </Row>
              <Text style={{ fontSize: font.xs, color: colors.muted }}>
                {[activityTypeLabel(i.type), i.agentName, dateTimeLabel(i.completedAt)].join(" · ")}
              </Text>
              {context(i) ? <Text style={{ fontSize: font.xs, color: colors.muted }}>{context(i)}</Text> : null}
              {i.completionNotes ? <Text style={{ fontSize: font.sm, color: colors.text }}>{i.completionNotes}</Text> : null}
            </Card>
          ))}
          {log.truncated && (
            <Footnote>
              Showing the {log.limit} most recent of {log.totalCount} completed tasks. Narrow the period or filter by agent to see the rest.
            </Footnote>
          )}
        </>
      )}
      <Footnote>
        Created, completed and the by-type breakdown count tasks in the selected period. Pending and overdue are a current snapshot of open tasks. Completion rate is completed divided by completed, pending and overdue. On-time rate counts only completed tasks that had a due date.
      </Footnote>
    </Wrap>
  );
}

// ── Lead sources ───────────────────────────────────────────────────────

export function SourcesSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.leadSourceAnalytics, { start, end, ownerUserId });
  const exportCsv = useExport();
  if (data === undefined) return <Loading />;
  if (data.bySource.length === 0) return <EmptyState icon="funnel-outline" title="No leads or marketing spend in this period" />;

  const build = (): ExportPayload => ({
    filename: fileName("lead-sources", periodLabel),
    title: "Lead source analytics",
    subtitle: periodLabel,
    tables: [
      {
        name: "Lead source breakdown",
        columns: [
          { key: "sourceLabel", label: "Source" },
          { key: "leads", label: "Leads" },
          { key: "won", label: "Won" },
          { key: "conversionRate", label: "Conversion %" },
          { key: "salesValueText", label: "Sales value" },
          { key: "spendText", label: "Marketing spend" },
        ],
        rows: data.bySource.map((s) => ({ ...s, sourceLabel: leadSourceLabel(s.source), salesValueText: currencyText(s.salesValue), spendText: currencyText(s.spend) })),
      },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Lead sources" onExport={() => exportCsv(build)} />
      <ShareCard title="Leads by source" data={data.bySource.map((s) => ({ name: leadSourceLabel(s.source), value: s.leads }))} />
      <BarsCard
        title="Conversion rate by source"
        suffix="%"
        data={data.bySource.map((s) => ({ name: leadSourceLabel(s.source), conversionRate: s.conversionRate }))}
        bars={[{ key: "conversionRate", name: "Conversion %", color: colors.success }]}
      />
      {data.bySource.map((s) => (
        <MetricCard
          key={s.source}
          title={leadSourceLabel(s.source)}
          items={[
            ["Leads", s.leads],
            ["Won", s.won],
            ["Conversion", `${s.conversionRate}%`],
            ["Sales value", currencyText(s.salesValue)],
            ["Marketing spend", currencyText(s.spend)],
          ]}
        />
      ))}
      <Footnote>Marketing spend is matched to a source by channel name. Admins log spend from the Properties tab.</Footnote>
    </Wrap>
  );
}

// ── Properties ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = { available: "Available", under_offer: "Under offer", let: "Let", sold: "Sold", off_market: "Off market" };

export function PropertiesSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.propertyPerformance, { start, end, ownerUserId });
  const exportCsv = useExport();
  const [spendOpen, setSpendOpen] = useState(false);
  const options = useMemo(() => (data?.rows ?? []).map((r) => ({ _id: r.propertyId, title: r.title })), [data]);
  if (data === undefined) return <Loading />;

  const counts = data.statusCounts as Record<string, number>;
  const build = (): ExportPayload => ({
    filename: fileName("property-performance", periodLabel),
    title: "Property performance",
    subtitle: periodLabel,
    summary: Object.entries(counts).map(([s, n]) => ({ label: STATUS_LABELS[s] ?? s, value: String(n) })),
    tables: [
      {
        name: "Property engagement",
        columns: [
          { key: "title", label: "Property" },
          { key: "status", label: "Status" },
          { key: "inquiries", label: "Inquiries" },
          { key: "viewings", label: "Viewings" },
          { key: "offers", label: "Offers" },
          { key: "daysOnMarket", label: "Days on market" },
          { key: "spendText", label: "Marketing spend" },
        ],
        rows: data.rows.map((r) => ({ ...r, status: STATUS_LABELS[r.status] ?? r.status, spendText: currencyText(r.spend) })),
      },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Property performance" onExport={() => exportCsv(build)} />
      <StatGrid>
        {(["available", "under_offer", "sold", "let"] as const).map((s) => (
          <Stat key={s} label={STATUS_LABELS[s]!} value={String(counts[s] ?? 0)} />
        ))}
      </StatGrid>
      {data.isAdmin && <Button variant="secondary" icon="megaphone-outline" title="Log marketing spend" onPress={() => setSpendOpen(true)} />}
      {data.rows.length === 0 ? (
        <EmptyState icon="business-outline" title="No properties to report on yet" />
      ) : (
        <>
          <ShareCard title="Listings by status" data={Object.entries(counts).map(([s, n]) => ({ name: STATUS_LABELS[s] ?? s, value: n }))} />
          {data.rows.slice(0, 30).map((r) => (
            <MetricCard
              key={r.propertyId}
              title={r.title}
              right={<Badge label={STATUS_LABELS[r.status] ?? r.status} />}
              items={[
                ["Inquiries", r.inquiries],
                ["Viewings", r.viewings],
                ["Offers", r.offers],
                ["Days on market", r.daysOnMarket],
                ["Spend", currencyText(r.spend)],
              ]}
            />
          ))}
          {data.rows.length > 30 && <Footnote>Showing 30 of {data.rows.length} properties. Export to Excel for the full list.</Footnote>}
        </>
      )}
      <Footnote>Days on market is approximate: from listing creation to the last update for sold or let listings, otherwise to today.</Footnote>
      <SpendSheet open={spendOpen} onClose={() => setSpendOpen(false)} properties={options} />
    </Wrap>
  );
}

// ── Revenue ────────────────────────────────────────────────────────────

export function RevenueSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.revenueSummary, { start, end, ownerUserId });
  const exportCsv = useExport();
  if (data === undefined) return <Loading />;

  const build = (): ExportPayload => ({
    filename: fileName("revenue", periodLabel),
    title: "Revenue and pipeline",
    subtitle: periodLabel,
    summary: [
      { label: "Sales value (closed)", value: currencyText(data.salesValue) },
      { label: "Commission earned", value: currencyText(data.commission) },
      { label: "Forecast (open pipeline)", value: currencyText(data.forecast) },
    ],
    tables: [
      {
        name: "Pipeline by stage",
        columns: [
          { key: "name", label: "Stage" },
          { key: "openCount", label: "Open" },
          { key: "winProbabilityText", label: "Win %" },
          { key: "estimatedText", label: "Estimated" },
          { key: "weightedText", label: "Weighted" },
        ],
        rows: data.pipelineByStage.map((s) => ({
          name: s.name,
          openCount: s.openCount,
          winProbabilityText: s.winProbability !== null ? `${s.winProbability}%` : "-",
          estimatedText: currencyText(s.estimatedValue),
          weightedText: currencyText(s.weightedValue),
        })),
      },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Revenue and pipeline" onExport={() => exportCsv(build)} />
      <StatGrid>
        <Stat label="Sales value (closed)" value={currencyText(data.salesValue)} />
        <Stat label="Commission earned" value={currencyText(data.commission)} />
        <Stat label="Forecast (open pipeline)" value={currencyText(data.forecast)} hint="Estimated value × stage win probability" />
      </StatGrid>
      <BarsCard
        title="Open leads by stage"
        data={data.pipelineByStage.map((s) => ({ name: s.name, openCount: s.openCount }))}
        bars={[{ key: "openCount", name: "Open leads", color: colors.info }]}
      />
      {data.pipelineByStage.map((s) => (
        <MetricCard
          key={s.stageId}
          title={s.name}
          items={[
            ["Open", s.openCount],
            ["Win %", s.winProbability !== null ? `${s.winProbability}%` : "-"],
            ["Estimated", currencyText(s.estimatedValue)],
            ["Weighted", currencyText(s.weightedValue)],
          ]}
        />
      ))}
      <Footnote>
        Forecast estimates open-lead value from deal value or budget, weighted by each stage's win probability (set by an admin under pipeline stages). Values are grouped by currency with no exchange-rate conversion.
      </Footnote>
    </Wrap>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────

type BoardRow = { userId: string; name: string; value: number; mixedCurrency?: boolean };

function Board({ title, rows, fmt, index }: { title: string; rows: BoardRow[]; fmt: (v: number) => string; index: number }) {
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: font.sm }}>No data for this period</Text>
      ) : (
        rows.map((r, i) => (
          <Row key={r.userId} style={{ justifyContent: "space-between" }}>
            <Row style={{ flex: 1 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: i === 0 ? PALETTE[index % PALETTE.length] : colors.surface }}>
                <Text style={{ fontSize: font.xs, fontWeight: "700", color: i === 0 ? "#fff" : colors.muted }}>{i + 1}</Text>
              </View>
              <Text style={{ fontSize: font.sm, color: colors.text, flex: 1 }} numberOfLines={1}>
                {r.name}
              </Text>
            </Row>
            <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>
              {fmt(r.value)}
              {r.mixedCurrency ? " *" : ""}
            </Text>
          </Row>
        ))
      )}
    </Card>
  );
}

export function LeaderboardSection({ start, end, ownerUserId, periodLabel }: SectionProps) {
  const data = useQuery(api.reports.leaderboards, { start, end, ownerUserId });
  const exportCsv = useExport();
  if (data === undefined) return <Loading />;
  if (!data.available) return <EmptyState icon="trophy-outline" title="Leaderboards" message="Leaderboards compare agents across the agency and are available to admins viewing all agents." />;

  const num = (v: number) => v.toLocaleString("en-GB");
  const pct = (v: number) => `${v}%`;
  const two = (label: string) => [{ key: "name", label: "Agent" }, { key: "value", label }];
  const build = (): ExportPayload => ({
    filename: fileName("leaderboards", periodLabel),
    title: "Leaderboards",
    subtitle: periodLabel,
    tables: [
      { name: "Most leads managed", columns: two("Leads"), rows: data.leadsManaged },
      { name: "Most viewings conducted", columns: two("Viewings"), rows: data.viewings },
      { name: "Most deals closed", columns: two("Deals"), rows: data.dealsClosed },
      { name: "Highest revenue", columns: two("Revenue (mixed currency)"), rows: data.revenue },
      { name: "Highest conversion rate", columns: two("Conversion %"), rows: data.conversionRate },
    ],
  });

  return (
    <Wrap>
      <SectionHead title="Leaderboards" onExport={() => exportCsv(build)} />
      <Board index={0} title="Most leads managed" rows={data.leadsManaged} fmt={num} />
      <Board index={1} title="Most viewings conducted" rows={data.viewings} fmt={num} />
      <Board index={2} title="Most deals closed" rows={data.dealsClosed} fmt={num} />
      <Board index={3} title="Highest revenue" rows={data.revenue} fmt={(v) => Math.round(v).toLocaleString("en-GB")} />
      <Board index={4} title="Highest conversion rate" rows={data.conversionRate} fmt={pct} />
      <Footnote>Rankings reflect the selected period. Revenue adds deal values across currencies for ranking only; * marks agents with deals in more than one currency.</Footnote>
    </Wrap>
  );
}
