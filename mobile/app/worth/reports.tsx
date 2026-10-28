/**
 * Valuation reports (BRD §6): instruction register, turnaround, work by
 * instructing party, unpaid fees and evidence, shared as PDF or Excel.
 */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { ageBucket, fmtDays, turnaroundBy, workByParty } from "@/lib/worth/reporting";
import { api } from "../../../convex/_generated/api";
import type { WorthPartyType } from "../../../convex/worth/lib";
import { Body, Button, Card, Chips, DateField, EmptyState, Facts, Field, Loading, Screen } from "../../components/ui";
import { Actions, ModeSwitch, Pair } from "../../components/worth/bits";
import { esc, pdfShell } from "../../lib/files";
import { useSession } from "../../lib/session";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { printPdf, shareCsv, sharePdfFile } from "../../lib/worth/files";
import {
  PARTY_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  addDaysIso,
  formatArea,
  formatDay,
  formatMoney,
  formatTotals,
  todayIso,
  useDebounced,
  usePullRefresh,
} from "../../lib/worth/util";

type ReportKey = "register" | "turnaround" | "party" | "unpaid" | "evidence";
type Column = { key: string; label: string };
type Built = { title: string; columns: Column[]; rows: Record<string, string | number>[] };

const STAGES = ["new", "assigned", "inspected", "draft", "in_review"] as const;
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function WorthReports() {
  const params = useLocalSearchParams<{ report?: string }>();
  const { hub } = useSession();
  const settings = useQuery(api.worth.settings.get);
  const branding = useQuery(api.branding.get);
  const [report, setReport] = useState<ReportKey>((params.report as ReportKey) || "register");
  const [from, setFrom] = useState(addDaysIso(todayIso(), -90));
  const [to, setTo] = useState(todayIso());
  const [suburb, setSuburb] = useState("");
  const [turnBy, setTurnBy] = useState<"valuerName" | "clientName">("valuerName");
  const dSuburb = useDebounced(suburb, 300);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = usePullRefresh();
  const seesEvidence = settings?.caps.seesEvidence ?? false;
  const datesOk = isIso(from) && isIso(to);

  const reg = useQuery(api.worth.reports.register, settings && report !== "evidence" && datesOk ? { from, to } : "skip");
  const ev = useQuery(api.worth.reports.evidence, seesEvidence && report === "evidence" && datesOk ? { suburb: dSuburb, from, to } : "skip");

  const built: Built | null = useMemo(() => {
    if (report === "evidence") {
      if (!ev) return null;
      return {
        title: `Evidence${dSuburb ? `: ${dSuburb}` : ""}`,
        columns: [
          { key: "address", label: "Address" },
          { key: "date", label: "Date" },
          { key: "kind", label: "Kind" },
          { key: "suburb", label: "Suburb" },
          { key: "type", label: "Type" },
          { key: "land", label: "Land" },
          { key: "building", label: "Building" },
          { key: "amount", label: "Price, value or rent" },
        ],
        rows: ev.map((c) => ({
          address: c.address,
          date: formatDay(c.date),
          kind: c.kind === "sale" ? "Sale" : c.kind === "rental" ? "Rental" : "Valuation",
          suburb: c.suburb,
          type: c.propertyType,
          land: formatArea(c.landSizeM2),
          building: formatArea(c.buildingSizeM2),
          amount: c.price ? formatMoney(c.price, c.currency) : c.rent ? `${formatMoney(c.rent, c.currency)} pm` : "-",
        })),
      };
    }
    if (!reg) return null;
    if (report === "register") {
      return {
        title: "Instruction register",
        columns: [
          { key: "reference", label: "Reference" },
          { key: "received", label: "Received" },
          { key: "client", label: "Client" },
          { key: "purpose", label: "Purpose" },
          { key: "property", label: "Property" },
          { key: "valuer", label: "Valuer" },
          { key: "status", label: "Status" },
          { key: "fee", label: "Fee" },
          { key: "paid", label: "Paid" },
        ],
        rows: reg.register.map((r) => ({
          reference: r.reference,
          received: formatDay(r.receivedDate),
          client: r.clientName,
          purpose: PURPOSE_LABELS[r.purpose],
          property: `${r.propertyAddress}, ${r.suburb}`,
          valuer: r.valuerName || "-",
          status: STATUS_LABELS[r.status],
          fee: formatMoney(r.fee, r.currency),
          paid: r.paid ? "Yes" : r.invoiced ? "Invoiced" : "No",
        })),
      };
    }
    if (report === "turnaround") {
      return {
        title: `Turnaround by ${turnBy === "valuerName" ? "valuer" : "client"}`,
        columns: [
          { key: "key", label: turnBy === "valuerName" ? "Valuer" : "Client" },
          { key: "jobs", label: "Jobs" },
          { key: "issued", label: "Issued" },
          { key: "avg", label: "Average days to issue" },
          ...STAGES.map((s) => ({ key: s, label: `Days ${STATUS_LABELS[s].toLowerCase()}` })),
        ],
        rows: turnaroundBy(reg.register, turnBy).map((g) => ({
          key: g.key,
          jobs: g.jobs,
          issued: g.issued,
          avg: fmtDays(g.averageDays),
          ...Object.fromEntries(STAGES.map((s) => [s, fmtDays(g.stageDays[s])])),
        })),
      };
    }
    if (report === "party") {
      return {
        title: "Work by instructing party",
        columns: [
          { key: "client", label: "Instructing party" },
          { key: "type", label: "Type" },
          { key: "jobs", label: "Jobs" },
          { key: "issued", label: "Issued" },
          { key: "fees", label: "Fees" },
          { key: "unpaid", label: "Unpaid" },
        ],
        rows: workByParty(reg.register).map((g) => ({
          client: g.clientName,
          type: PARTY_LABELS[g.partyType as WorthPartyType] ?? g.partyType,
          jobs: g.jobs,
          issued: g.issued,
          fees: formatTotals(g.fees),
          unpaid: formatTotals(g.unpaid),
        })),
      };
    }
    return {
      title: "Unpaid fees",
      columns: [
        { key: "reference", label: "Reference" },
        { key: "client", label: "Client" },
        { key: "issued", label: "Issued" },
        { key: "age", label: "Age (days)" },
        { key: "bucket", label: "Age band" },
        { key: "fee", label: "Fee" },
      ],
      rows: reg.unpaid.map((u) => ({
        reference: u.reference,
        client: u.clientName,
        issued: formatDay(u.issuedDate),
        age: u.ageDays,
        bucket: ageBucket(u.ageDays),
        fee: formatMoney(u.fee, u.currency),
      })),
    };
  }, [report, reg, ev, turnBy, dSuburb]);

  if (settings === undefined) return <Loading />;

  const subtitle = report === "unpaid" ? `As at ${formatDay(todayIso())}` : `${formatDay(from)} to ${formatDay(to)}`;
  const filename = `worth-${report}-${todayIso()}`;

  const exportPdf = () =>
    run(async () => {
      if (!built) return;
      const table = `<p class="muted">${esc(subtitle)}</p><table><thead><tr>${built.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${built.rows
        .map((r) => `<tr>${built.columns.map((c) => `<td>${esc(r[c.key] ?? "")}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
      const html = pdfShell({ title: built.title, agencyName: hub?.orgName ?? branding?.orgName ?? "", logoUrl: branding?.logoUrl, body: table });
      await sharePdfFile(await printPdf(html, `${filename}.pdf`));
    });
  const exportCsv = () =>
    run(async () => {
      if (!built) return;
      await shareCsv(`${filename}.csv`, built.columns.map((c) => c.label), built.rows.map((r) => built.columns.map((c) => r[c.key] ?? "")));
    });

  const tabs: Array<{ value: ReportKey; label: string }> = [
    { value: "register", label: "Instruction register" },
    { value: "turnaround", label: "Turnaround" },
    { value: "party", label: "By instructing party" },
    { value: "unpaid", label: "Unpaid fees" },
    ...(seesEvidence ? [{ value: "evidence" as ReportKey, label: "Evidence" }] : []),
  ];
  const [first, ...rest] = built?.columns ?? [];

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: "Reports" }} />
      <Body muted small>
        {settings.caps.seesAllJobs ? "Every job in the agency." : "Your jobs."}
      </Body>
      <Chips options={tabs} value={report} onChange={setReport} />

      <View style={{ gap: space.md }}>
        {report !== "unpaid" && (
          <Pair>
            <DateField label={report === "evidence" ? "From" : "Received from"} value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
          </Pair>
        )}
        {report === "evidence" && <Field label="Suburb" value={suburb} onChangeText={setSuburb} placeholder="All suburbs" />}
        {report === "turnaround" && (
          <ModeSwitch
            value={turnBy}
            onChange={setTurnBy}
            options={[
              { value: "valuerName", label: "By valuer" },
              { value: "clientName", label: "By client" },
            ]}
          />
        )}
        <Actions>
          <Button small variant="secondary" icon="document-outline" title="Share PDF" loading={busy} disabled={!built || built.rows.length === 0} onPress={exportPdf} />
          <Button small variant="secondary" icon="grid-outline" title="Share Excel" disabled={busy || !built || built.rows.length === 0} onPress={exportCsv} />
        </Actions>
      </View>

      {!datesOk ? (
        <Body muted>Enter both dates as YYYY-MM-DD.</Body>
      ) : built === null ? (
        <Loading />
      ) : built.rows.length === 0 ? (
        <EmptyState icon="bar-chart-outline" title="Nothing to report" message="Try a wider date range." />
      ) : (
        <View style={{ gap: space.sm }}>
          <Body muted small>
            {built.rows.length} row{built.rows.length === 1 ? "" : "s"} · {subtitle}
          </Body>
          {built.rows.map((r, i) => (
            <Card key={i}>
              <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{String(r[first!.key] ?? "")}</Text>
              <Facts items={rest.map((c) => ({ label: c.label, value: String(r[c.key] ?? "") }))} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
