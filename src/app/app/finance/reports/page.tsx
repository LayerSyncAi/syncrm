"use client";

import * as React from "react";
import { useConvex, useQuery } from "convex/react";
import { BookOpen, FileBarChart, FileSpreadsheet, FileText, Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { type ExportPayload } from "@/lib/report-export";
import { exportReportXlsx } from "@/lib/stay/export";
import { downloadBlob, generateCSV } from "@/lib/csv";
import { FormError, StayPageHeader } from "@/components/stay/page-header";
import { AGE_BUCKET_LABELS } from "@/lib/stay/format";
import {
  addMonths,
  dateLabel,
  datePrefix,
  formatTotals,
  money,
  periodLabel,
  periodRange,
  type CurrencyTotals,
  type FinCurrency,
} from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type ReportKey = "schedule" | "cashbook" | "trust" | "income" | "debtors" | "commission" | "stands" | "developer";

const REPORTS: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: "schedule", label: "Receipts and payments", description: "Every receipt and payment in the period, by account and category. What auditors ask for." },
  { key: "cashbook", label: "Cash book", description: "One account's money in and money out with a running balance." },
  { key: "trust", label: "Trust report", description: "Client money held on a date: landlords, tenant deposits, sale deposits and developers." },
  { key: "income", label: "Income and expense", description: "The agency's own income and spending by month and category." },
  { key: "debtors", label: "Debtors", description: "Unpaid invoices, tenant arrears and overdue instalments, by age." },
  { key: "commission", label: "Commission", description: "Sales commission earned and paid, by agent and month." },
  { key: "stands", label: "Stand sales", description: "Per development: collected in the month, outstanding and overdue buyers." },
  { key: "developer", label: "Developer report", description: "One development: stands sold, money collected and owed, by buyer." },
];

const BUCKET_LABELS: Record<string, string> = { current: "Not yet due", ...AGE_BUCKET_LABELS, overdue: "Instalments overdue" };
const BUCKET_ORDER = ["current", "0_30", "31_60", "61_90", "90_plus", "overdue"];

type Col = { key: string; label: string; kind?: "money" | "date" | "number"; currencyKey?: string };
type Row = Record<string, string | number | null>;
type RTable = { name: string; columns: Col[]; rows: Row[] };
type Built = { columns: Col[]; rows: Row[]; summary: Array<{ label: string; value: string }>; groups?: Array<{ name: string; rows: Row[] }>; extra?: RTable[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const add = (t: CurrencyTotals, c: FinCurrency, n: number) => {
  t[c] = r2((t[c] ?? 0) + n);
};
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function display(row: Row, c: Col): string {
  const v = row[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "money") return money(Number(v), (row[c.currencyKey ?? "currency"] as FinCurrency) ?? "USD");
  if (c.kind === "date") return dateLabel(String(v));
  return String(v);
}

const SCHEDULE_COLS: Col[] = [
  { key: "date", label: "Date", kind: "date" },
  { key: "number", label: "Number" },
  { key: "type", label: "Type" },
  { key: "description", label: "Description" },
  { key: "party", label: "Paid by or to" },
  { key: "account", label: "Account" },
  { key: "category", label: "Category" },
  { key: "method", label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "currency", label: "Currency" },
  { key: "moneyIn", label: "Money in", kind: "money" },
  { key: "moneyOut", label: "Money out", kind: "money" },
];

const CASHBOOK_COLS: Col[] = [
  { key: "date", label: "Date", kind: "date" },
  { key: "number", label: "Number" },
  { key: "description", label: "Description" },
  { key: "party", label: "Paid by or to" },
  { key: "currency", label: "Currency" },
  { key: "moneyIn", label: "Money in", kind: "money" },
  { key: "moneyOut", label: "Money out", kind: "money" },
  { key: "balance", label: "Balance", kind: "money" },
];

/** Raw values for Excel: numbers stay numbers, dates stay YYYY-MM-DD. */
function toExport(t: RTable, formatted = false) {
  return {
    name: t.name,
    columns: t.columns.map(({ key, label }) => ({ key, label })),
    rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.key, formatted ? display(r, c) : r[c.key] ?? ""]))),
  };
}

export default function FinanceReportsPage() {
  const fin = useQuery(api.finance.settings.get);
  const staff = !!fin?.role.isStaff;

  const today = fin?.today ?? "";
  const [report, setReport] = React.useState<ReportKey>("schedule");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [asAt, setAsAt] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [developmentId, setDevelopmentId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [auditOpen, setAuditOpen] = React.useState(false);
  const [csvOpen, setCsvOpen] = React.useState(false);

  // Defaults wait for the agency's own "today".
  React.useEffect(() => {
    if (!today) return;
    setFrom((v) => v || periodRange(today.slice(0, 7)).from);
    setTo((v) => v || today);
    setAsAt((v) => v || today);
    setMonth((v) => v || today.slice(0, 7));
  }, [today]);

  const accounts = React.useMemo(() => (fin?.accounts ?? []).map((a) => ({ _id: a._id, name: a.name, currency: a.currency, isActive: a.isActive })), [fin]);
  React.useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0]._id);
  }, [accounts, accountId]);

  const validRange = validDate(from) && validDate(to) && from <= to;
  const on = (k: ReportKey) => staff && report === k;
  const schedule = useQuery(api.finance.reports.schedule, on("schedule") && validRange ? { from, to } : "skip");
  const cashBook = useQuery(api.finance.reports.cashBook, on("cashbook") && validRange && accountId ? { accountId: accountId as Id<"finAccounts">, from, to } : "skip");
  const trust = useQuery(api.finance.reports.trustReport, on("trust") && validDate(asAt) ? { asAt } : "skip");
  const income = useQuery(api.finance.reports.incomeExpense, on("income") && validRange ? { from, to } : "skip");
  const debtors = useQuery(api.finance.reports.debtors, on("debtors") ? {} : "skip");
  const commission = useQuery(api.finance.reports.commissionReport, on("commission") && validRange ? { from, to } : "skip");
  const stands = useQuery(api.finance.reports.standSales, on("stands") && /^\d{4}-\d{2}$/.test(month) ? { month } : "skip");
  const devs = useQuery(api.finance.stands.listDevelopments, staff && report === "developer" ? {} : "skip");
  React.useEffect(() => {
    if (!developmentId && devs?.length) setDevelopmentId(devs[0]._id);
  }, [devs, developmentId]);
  const developer = useQuery(api.finance.stands.developerReport, on("developer") && developmentId ? { developmentId: developmentId as Id<"finDevelopments"> } : "skip");

  const built: Built | undefined = React.useMemo(() => {
    switch (report) {
      case "schedule": {
        if (!schedule) return undefined;
        const moneyIn: CurrencyTotals = {};
        const moneyOut: CurrencyTotals = {};
        for (const r of schedule) {
          add(moneyIn, r.currency, r.moneyIn);
          add(moneyOut, r.currency, r.moneyOut);
        }
        return {
          columns: SCHEDULE_COLS,
          rows: schedule,
          summary: [
            { label: "Lines", value: String(schedule.length) },
            { label: "Money in", value: formatTotals(moneyIn) },
            { label: "Money out", value: formatTotals(moneyOut) },
          ],
        };
      }
      case "cashbook": {
        if (!cashBook) return undefined;
        const c = cashBook.account.currency;
        let mIn = 0;
        let mOut = 0;
        for (const r of cashBook.rows) {
          mIn = r2(mIn + r.moneyIn);
          mOut = r2(mOut + r.moneyOut);
        }
        return {
          columns: CASHBOOK_COLS,
          rows: [
            { date: from, number: "", description: "Opening balance", party: "", currency: c, moneyIn: null, moneyOut: null, balance: cashBook.opening },
            ...cashBook.rows.map((r) => ({ ...r, currency: c })),
          ],
          summary: [
            { label: "Account", value: `${cashBook.account.name} (${c})` },
            { label: "Opening balance", value: money(cashBook.opening, c) },
            { label: "Money in", value: money(mIn, c) },
            { label: "Money out", value: money(mOut, c) },
            { label: "Closing balance", value: money(cashBook.closing, c) },
          ],
        };
      }
      case "trust": {
        if (!trust) return undefined;
        const total: CurrencyTotals = {};
        const byType = new Map<string, CurrencyTotals>();
        for (const r of trust) {
          add(total, r.currency, r.balance);
          const t = byType.get(r.type) ?? {};
          add(t, r.currency, r.balance);
          byType.set(r.type, t);
        }
        return {
          columns: [
            { key: "type", label: "Held for" },
            { key: "name", label: "Name" },
            { key: "currency", label: "Currency" },
            { key: "balance", label: "Balance", kind: "money" },
          ],
          rows: trust,
          summary: [{ label: "Total held", value: formatTotals(total) }, ...[...byType].map(([k, t]) => ({ label: k, value: formatTotals(t) }))],
        };
      }
      case "income": {
        if (!income) return undefined;
        const inc: CurrencyTotals = {};
        const exp: CurrencyTotals = {};
        const byCat = new Map<string, Row>();
        for (const r of income) {
          add(r.kind === "income" ? inc : exp, r.currency, r.amount);
          const k = `${r.kind}|${r.category}|${r.currency}`;
          const row = byCat.get(k) ?? { kind: r.kind === "income" ? "Income" : "Expense", category: r.category, currency: r.currency, amount: 0 };
          row.amount = r2(Number(row.amount) + r.amount);
          byCat.set(k, row);
        }
        const net: CurrencyTotals = {};
        for (const c of ["USD", "ZiG"] as const) if (inc[c] !== undefined || exp[c] !== undefined) net[c] = r2((inc[c] ?? 0) - (exp[c] ?? 0));
        return {
          columns: [
            { key: "month", label: "Month" },
            { key: "kind", label: "Type" },
            { key: "category", label: "Category" },
            { key: "currency", label: "Currency" },
            { key: "amount", label: "Amount", kind: "money" },
          ],
          rows: income.map((r) => ({ month: periodLabel(r.month), kind: r.kind === "income" ? "Income" : "Expense", category: r.category, currency: r.currency, amount: r.amount })),
          summary: [
            { label: "Income", value: formatTotals(inc) },
            { label: "Expenses", value: formatTotals(exp) },
            { label: "Income less expenses", value: formatTotals(net) },
          ],
          extra: [
            {
              name: "Totals by category",
              columns: [
                { key: "kind", label: "Type" },
                { key: "category", label: "Category" },
                { key: "currency", label: "Currency" },
                { key: "amount", label: "Total", kind: "money" },
              ],
              rows: [...byCat.values()].sort((a, b) => (a.kind === b.kind ? String(a.category).localeCompare(String(b.category)) : a.kind === "Income" ? -1 : 1)),
            },
          ],
        };
      }
      case "debtors": {
        if (!debtors) return undefined;
        const total: CurrencyTotals = {};
        const byBucket = new Map<string, { rows: Row[]; total: CurrencyTotals }>();
        for (const r of debtors) {
          add(total, r.currency, r.amount);
          const g = byBucket.get(r.bucket) ?? { rows: [], total: {} };
          g.rows.push({ ...r, age: BUCKET_LABELS[r.bucket] ?? r.bucket, days: r.days || "" });
          add(g.total, r.currency, r.amount);
          byBucket.set(r.bucket, g);
        }
        const order = [...byBucket.keys()].sort((a, b) => BUCKET_ORDER.indexOf(a) - BUCKET_ORDER.indexOf(b));
        return {
          columns: [
            { key: "type", label: "Type" },
            { key: "name", label: "Name" },
            { key: "reference", label: "Reference" },
            { key: "dueDate", label: "Due", kind: "date" },
            { key: "days", label: "Days overdue", kind: "number" },
            { key: "age", label: "Age" },
            { key: "currency", label: "Currency" },
            { key: "amount", label: "Amount", kind: "money" },
          ],
          rows: order.flatMap((b) => byBucket.get(b)!.rows),
          groups: order.map((b) => ({ name: `${BUCKET_LABELS[b] ?? b}: ${formatTotals(byBucket.get(b)!.total)}`, rows: byBucket.get(b)!.rows })),
          summary: [{ label: "Total owed", value: formatTotals(total) }, ...order.map((b) => ({ label: BUCKET_LABELS[b] ?? b, value: formatTotals(byBucket.get(b)!.total) }))],
        };
      }
      case "commission": {
        if (!commission) return undefined;
        const earned: CurrencyTotals = {};
        const paid: CurrencyTotals = {};
        for (const r of commission) {
          add(earned, r.currency, r.earned);
          add(paid, r.currency, r.paid);
        }
        return {
          columns: [
            { key: "agent", label: "Agent" },
            { key: "month", label: "Month" },
            { key: "currency", label: "Currency" },
            { key: "earned", label: "Earned", kind: "money" },
            { key: "paid", label: "Paid", kind: "money" },
            { key: "owed", label: "Not yet paid", kind: "money" },
          ],
          rows: commission.map((r) => ({ agent: r.agent, month: periodLabel(r.month), currency: r.currency, earned: r.earned, paid: r.paid, owed: r2(r.earned - r.paid) })),
          summary: [
            { label: "Earned on deals closed", value: formatTotals(earned) },
            { label: "Paid to agents", value: formatTotals(paid) },
          ],
        };
      }
      case "stands": {
        if (!stands) return undefined;
        const collected: CurrencyTotals = {};
        const outstanding: CurrencyTotals = {};
        const overdue: CurrencyTotals = {};
        for (const d of stands) {
          add(collected, d.currency, d.collected);
          add(outstanding, d.currency, d.outstanding);
          add(overdue, d.currency, d.overdue);
        }
        return {
          columns: [
            { key: "development", label: "Development" },
            { key: "stands", label: "Stands sold", kind: "number" },
            { key: "currency", label: "Currency" },
            { key: "collected", label: "Collected in month", kind: "money" },
            { key: "outstanding", label: "Outstanding", kind: "money" },
            { key: "overdue", label: "Overdue", kind: "money" },
            { key: "overdueBuyers", label: "Buyers overdue", kind: "number" },
          ],
          rows: stands.map((d) => ({ development: d.development, stands: d.stands, currency: d.currency, collected: d.collected, outstanding: d.outstanding, overdue: d.overdue, overdueBuyers: d.overdueBuyers.length })),
          summary: [
            { label: "Collected in month", value: formatTotals(collected) },
            { label: "Outstanding", value: formatTotals(outstanding) },
            { label: "Overdue", value: formatTotals(overdue) },
          ],
          extra: [
            {
              name: "Overdue buyers",
              columns: [
                { key: "development", label: "Development" },
                { key: "standNumber", label: "Stand" },
                { key: "buyerName", label: "Buyer" },
                { key: "phone", label: "Phone" },
                { key: "currency", label: "Currency" },
                { key: "overdue", label: "Overdue", kind: "money" },
              ],
              rows: stands.flatMap((d) => d.overdueBuyers.map((b) => ({ development: d.development, currency: d.currency, ...b }))),
            },
          ],
        };
      }
      case "developer": {
        if (!developer) return undefined;
        const c = developer.development.currency;
        const inTrust = developer.development.moneyHeldBy === "agency_trust";
        return {
          columns: [
            { key: "standNumber", label: "Stand" },
            { key: "buyerName", label: "Buyer" },
            { key: "currency", label: "Currency" },
            { key: "price", label: "Price", kind: "money" },
            { key: "paidToDate", label: "Paid to date", kind: "money" },
            { key: "balance", label: "Balance", kind: "money" },
            { key: "overdue", label: "Overdue", kind: "money" },
            { key: "nextDueDate", label: "Next due", kind: "date" },
          ],
          rows: developer.buyers.map((b) => ({ ...b, currency: c })),
          summary: [
            { label: "Development", value: `${developer.development.name} (${developer.development.developerName})` },
            { label: "Stands sold", value: String(developer.sold) },
            { label: "Contracted", value: money(developer.contracted, c) },
            { label: "Collected", value: money(developer.collected, c) },
            { label: "Outstanding", value: money(developer.outstanding, c) },
            { label: "Overdue", value: money(developer.overdue, c) },
            ...(inTrust
              ? [
                  { label: "Our commission", value: money(developer.commission, c) },
                  { label: "Paid to the developer", value: money(developer.paidOut, c) },
                  { label: "Held in trust for the developer", value: money(developer.held, c) },
                ]
              : []),
          ],
        };
      }
    }
  }, [report, schedule, cashBook, trust, income, debtors, commission, stands, developer, from]);

  if (fin === undefined) return <ListSkeleton />;
  if (!staff) {
    return <EmptyState icon={Lock} title="Finance reports are for directors and accounts staff" description="Ask your director if you need access." />;
  }

  const meta = REPORTS.find((r) => r.key === report)!;
  const subtitle =
    report === "trust"
      ? `As at ${dateLabel(asAt)}`
      : report === "debtors"
        ? `As at ${dateLabel(today)}`
        : report === "stands"
          ? periodLabel(month, true)
          : report === "developer"
            ? `As at ${dateLabel(today)}`
            : `${dateLabel(from)} to ${dateLabel(to)}`;

  const exportExcel = async () => {
    if (!built) return;
    setBusy(true);
    try {
      const sheetName = report === "cashbook" && cashBook ? cashBook.account.name : meta.label;
      await exportReportXlsx({
        filename: `${datePrefix()}Finance_${meta.label.replace(/\s+/g, "_")}`,
        title: meta.label,
        subtitle,
        summary: built.summary,
        tables: [toExport({ name: sheetName, columns: built.columns, rows: built.rows }), ...(built.extra ?? []).map((t) => toExport(t))],
      });
    } catch (e) {
      animatedToast.error("Export failed", { description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const needsRange = report === "schedule" || report === "cashbook" || report === "income" || report === "commission";

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Finance reports"
        description="Export to Excel. Amounts are shown per currency and never converted."
        actions={
          <>
            <Button variant="secondary" className="gap-2" onClick={() => setAuditOpen(true)}>
              <BookOpen className="h-4 w-4" />
              Year-end auditor pack
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => setCsvOpen(true)}>
              <FileText className="h-4 w-4" />
              Export for QuickBooks or Pastel
            </Button>
            <Button className="gap-2" onClick={exportExcel} disabled={!built || busy}>
              <FileSpreadsheet className="h-4 w-4" />
              {busy ? "Preparing..." : "Excel"}
            </Button>
          </>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReport(r.key)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
              report === r.key ? "border-primary-600 bg-primary-600 text-white" : "border-border-strong hover:bg-surface-2"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <p className="text-sm text-text-muted">{meta.description}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report === "cashbook" && (
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.currency}){a.isActive ? "" : ", closed"}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {needsRange && (
            <>
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {report === "trust" && (
            <div className="space-y-2">
              <Label>As at</Label>
              <Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
            </div>
          )}
          {report === "stands" && (
            <div className="space-y-2">
              <Label>Month</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          )}
          {report === "developer" && (
            <div className="space-y-2">
              <Label>Development</Label>
              <Select value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
                {(devs ?? []).map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        {needsRange && !validRange && from && to && <p className="mt-2 text-sm text-danger">The start date must be on or before the end date.</p>}
        {report === "cashbook" && !accounts.length && <p className="mt-2 text-sm text-text-muted">There are no accounts yet.</p>}
        {report === "developer" && devs && !devs.length && <p className="mt-2 text-sm text-text-muted">There are no developments yet.</p>}
      </div>

      {!built ? (
        (needsRange && !validRange) || (report === "cashbook" && !accounts.length) || (report === "developer" && devs && !devs.length) ? null : <ListSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {built.summary.map((s) => (
              <div key={s.label} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{s.label}</p>
                <p className="mt-1 font-semibold break-words">{s.value}</p>
              </div>
            ))}
          </div>
          {built.rows.length === 0 ? (
            <EmptyState icon={FileBarChart} title="Nothing to show" description="This report has no rows for what you picked." />
          ) : built.groups ? (
            built.groups.map((g) => (
              <div key={g.name} className="space-y-2">
                <h2 className="text-base font-semibold">{g.name}</h2>
                <ReportTable columns={built.columns.filter((c) => c.key !== "age")} rows={g.rows} />
              </div>
            ))
          ) : (
            <ReportTable columns={built.columns} rows={built.rows} />
          )}
          {built.extra?.map((t) =>
            t.rows.length ? (
              <div key={t.name} className="space-y-2">
                <h2 className="text-base font-semibold">{t.name}</h2>
                <ReportTable columns={t.columns} rows={t.rows} />
              </div>
            ) : null
          )}
        </div>
      )}

      {auditOpen && <AuditorPackModal today={today} accounts={accounts} onClose={() => setAuditOpen(false)} />}
      {csvOpen && <CsvModal defaultFrom={from} defaultTo={to} onClose={() => setCsvOpen(false)} />}
    </div>
  );

}

/** Split a date range into calendar-month pieces, clipped to the range. */
function monthChunks(from: string, to: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let month = from.slice(0, 7);
  while (month <= to.slice(0, 7)) {
    const r = periodRange(month);
    out.push({ from: r.from < from ? from : r.from, to: r.to > to ? to : r.to });
    month = addMonths(month, 1);
  }
  return out;
}

function AuditorPackModal({
  today: t,
  accounts: accs,
  onClose,
}: {
  today: string;
  accounts: Array<{ _id: Id<"finAccounts">; name: string; currency: FinCurrency }>;
  onClose: () => void;
}) {
  const thisYear = Number(t.slice(0, 4));
  const [startMonth, setStartMonth] = React.useState("01");
  const [year, setYear] = React.useState(String(thisYear - 1));
  const convex = useConvex();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const start = `${year}-${startMonth}`;
  const end = addMonths(start, 11);
  const range = { from: `${start}-01`, to: periodRange(end).to };

  const build = async () => {
    setError(null);
    setWorking(true);
    try {
      // A month per request keeps each read small for busy agencies; the
      // months are joined here. Each month's cash book opens where the last closed.
      const months = monthChunks(range.from, range.to);
      const sched = (await Promise.all(months.map((m) => convex.query(api.finance.reports.schedule, m)))).flat();
      const books = await Promise.all(
        accs.map(async (a) => {
          const parts = await Promise.all(months.map((m) => convex.query(api.finance.reports.cashBook, { accountId: a._id, ...m })));
          return { account: parts[0].account, opening: parts[0].opening, closing: parts[parts.length - 1].closing, rows: parts.flatMap((p) => p.rows) };
        })
      );
      const payload: ExportPayload = {
        filename: `${datePrefix()}Auditor_pack_${periodLabel(start).replace(/\s+/g, "_")}_to_${periodLabel(end).replace(/\s+/g, "_")}`,
        title: "Year-end auditor pack",
        subtitle: `${periodLabel(start, true)} to ${periodLabel(end, true)}`,
        summary: books.map((b) => ({
          label: `${b.account.name} (${b.account.currency})`,
          value: `Opening ${money(b.opening, b.account.currency)}, closing ${money(b.closing, b.account.currency)}`,
        })),
        tables: [
          toExport({ name: "Receipts and payments", columns: SCHEDULE_COLS, rows: sched }),
          ...books.map((b) =>
            toExport({
              name: b.account.name,
              columns: CASHBOOK_COLS,
              rows: [
                { date: range.from, number: "", description: "Opening balance", party: "", currency: b.account.currency, moneyIn: null, moneyOut: null, balance: b.opening },
                ...b.rows.map((r) => ({ ...r, currency: b.account.currency })),
              ],
            })
          ),
        ],
      };
      await exportReportXlsx(payload);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open
      title="Year-end auditor pack"
      description="One Excel file: the receipts and payments schedule for the year, plus a cash book sheet for every account."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button onClick={build} disabled={working}>
            {working ? "Preparing..." : "Download"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Financial year starts in</Label>
            <Select value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                <option key={m} value={m}>
                  {periodLabel(`2000-${m}`, true).replace(" 2000", "")}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Year it starts</Label>
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              {Array.from({ length: 6 }, (_, i) => String(thisYear - i)).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-sm text-text-muted">
          Covers {dateLabel(range.from)} to {dateLabel(range.to)}.
        </p>
      </div>
    </Modal>
  );
}

function CsvModal({ defaultFrom, defaultTo, onClose }: { defaultFrom: string; defaultTo: string; onClose: () => void }) {
  const [f, setF] = React.useState(defaultFrom);
  const [tt, setT] = React.useState(defaultTo);
  const convex = useConvex();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  const build = async () => {
    setError(null);
    if (!validDate(f) || !validDate(tt) || f > tt) return setError("Pick a valid date range.");
    setWorking(true);
    try {
      const rows = (await Promise.all(monthChunks(f, tt).map((m) => convex.query(api.finance.reports.schedule, m)))).flat();
      const csv = generateCSV(
        ["Date", "Reference", "Description", "Account", "Category", "Amount", "Currency"],
        rows.map((r) => [
          r.date,
          r.number || r.reference,
          r.party ? `${r.description} (${r.party})` : r.description,
          r.account,
          r.category,
          r2(r.moneyIn - r.moneyOut).toFixed(2),
          r.currency,
        ])
      );
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${datePrefix()}Finance_accounting_export_${f}_to_${tt}.csv`);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open
      title="Export for QuickBooks or Pastel"
      description="A CSV of every receipt and payment. Money in is positive and money out is negative. Import it as a bank statement per account and currency."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button onClick={build} disabled={working}>
            {working ? "Preparing..." : "Download CSV"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={tt} onChange={(e) => setT(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}


function ReportTable({ columns, rows }: { columns: Col[]; rows: Row[] }) {
  const right = (c: Col) => c.kind === "money" || c.kind === "number";
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(right(c) && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(right(c) && "text-right whitespace-nowrap", c.kind === "date" && "whitespace-nowrap")}>
                    {display(r, c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((r, i) => (
          <div key={i} className="rounded-[12px] border border-border-strong bg-card-bg p-4 text-sm">
            <p className="font-medium">{display(r, columns[0])}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {columns.slice(1).map((c) => {
                const v = display(r, c);
                if (!v || c.key === "currency") return null;
                return (
                  <React.Fragment key={c.key}>
                    <dt className="text-text-muted">{c.label}</dt>
                    <dd className="text-right">{v}</dd>
                  </React.Fragment>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
