/** Stay reports, shared as PDF or Excel. Amounts are shown per currency and never converted. */
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Card, Chips, DateField, EmptyState, Loading, Notice, Row, Screen, Section, Stat, StatGrid } from "../../components/ui";
import { REPORTS, buildReport, display, reportPayload, type Col, type ReportKey, type ReportRow } from "../../lib/stay/reports";
import { reportCsv, reportPdf } from "../../lib/stay/pdf";
import { shareCsv } from "../../lib/stay/share";
import { useSession } from "../../lib/session";
import { sharePdf } from "../../lib/files";
import { colors, font, space } from "../../lib/theme";
import { getErrorMessage } from "@/lib/errors";
import { dateLabel, datePrefix, todayLocal } from "@/lib/stay/format";

type Days = "30" | "60" | "90";

function RowCard({ columns, row }: { columns: Col[]; row: ReportRow }) {
  return (
    <Card>
      <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{display(row, columns[0])}</Text>
      {columns.slice(1).map((c) => {
        const v = display(row, c);
        if (!v || c.key === "currency") return null;
        return (
          <Row key={c.key} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <Body small muted>
              {c.label}
            </Body>
            <Body small style={{ flex: 1, textAlign: "right" }}>
              {v}
            </Body>
          </Row>
        );
      })}
    </Card>
  );
}

export default function StayReports() {
  const { hub } = useSession();
  const [report, setReport] = useState<ReportKey>("rent_roll");
  const [days, setDays] = useState<Days>("60");
  const [from, setFrom] = useState(`${todayLocal().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayLocal());
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [limit, setLimit] = useState(50);
  const expiryDays = Number(days);

  const needsUnits = report === "rent_roll" || report === "vacancy";
  const units = useQuery(api.stay.reports.units, needsUnits ? {} : "skip");
  const arrears = useQuery(api.stay.arrears.list, report === "arrears" ? {} : "skip");
  const expiry = useQuery(api.stay.leases.list, report === "expiry" ? { status: "active", expiringWithinDays: expiryDays } : "skip");
  const deposits = useQuery(api.stay.deposits.list, report === "deposits" ? { status: "held" } : "skip");
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const payments = useQuery(api.stay.payments.list, report === "payments" && validRange ? { from, to, includeReversed: false } : "skip");

  const built = useMemo(() => buildReport(report, { units, arrears, expiry, deposits, payments, expiryDays }), [report, units, arrears, expiry, deposits, payments, expiryDays]);
  const meta = REPORTS.find((r) => r.key === report)!;
  const subtitle =
    report === "payments"
      ? `${dateLabel(from)} to ${dateLabel(to)}`
      : report === "expiry"
        ? `Ending within ${expiryDays} days, as at ${dateLabel(todayLocal())}`
        : `As at ${dateLabel(todayLocal())}`;

  async function doExport(kind: "pdf" | "csv") {
    if (!built) return;
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const { html, fileName } = reportPdf(reportPayload(report, built, subtitle, true), hub?.orgName ?? "");
        await sharePdf(html, fileName);
      } else {
        const p = reportPayload(report, built, subtitle, false);
        await shareCsv(reportCsv(p), `${datePrefix()}${p.filename}.csv`);
      }
    } catch (e) {
      Alert.alert("Export failed", getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Reports" }} />
      <Chips<ReportKey>
        value={report}
        onChange={(r) => {
          setReport(r);
          setLimit(50);
        }}
        options={REPORTS.map((r) => ({ value: r.key, label: r.label }))}
      />
      <Card>
        <Body small muted>
          {meta.description}
        </Body>
        {report === "expiry" && (
          <Chips<Days>
            value={days}
            onChange={setDays}
            options={[
              { value: "30", label: "30 days" },
              { value: "60", label: "60 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        )}
        {report === "payments" && (
          <>
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
            {!validRange && <Notice tone="danger">Pick a valid date range.</Notice>}
          </>
        )}
      </Card>
      <Row>
        <Button
          variant="secondary"
          icon="document-outline"
          title="Share PDF"
          onPress={() => doExport("pdf")}
          loading={busy === "pdf"}
          disabled={!built || busy !== null}
          style={{ flex: 1 }}
        />
        <Button
          variant="secondary"
          icon="grid-outline"
          title="Share Excel"
          onPress={() => doExport("csv")}
          loading={busy === "csv"}
          disabled={!built || busy !== null}
          style={{ flex: 1 }}
        />
      </Row>

      {!built ? (
        report === "payments" && !validRange ? null : (
          <Loading />
        )
      ) : (
        <>
          <StatGrid>
            {built.summary.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </StatGrid>
          {built.rows.length === 0 ? (
            <EmptyState icon="bar-chart-outline" title="Nothing to show" message="This report has no rows right now." />
          ) : (
            <View style={{ gap: space.sm }}>
              {built.rows.slice(0, limit).map((r, i) => (
                <RowCard key={i} columns={built.columns} row={r} />
              ))}
              {built.rows.length > limit && (
                <Button variant="ghost" title={`Show ${Math.min(50, built.rows.length - limit)} more of ${built.rows.length - limit}`} onPress={() => setLimit((l) => l + 50)} />
              )}
            </View>
          )}
          {built.extra?.map((t) =>
            t.rows.length ? (
              <Section key={t.name} title={t.name}>
                {t.rows.map((r, i) => (
                  <RowCard key={i} columns={t.columns} row={r} />
                ))}
              </Section>
            ) : null,
          )}
        </>
      )}
    </Screen>
  );
}
