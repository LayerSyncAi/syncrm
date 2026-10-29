"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Download, FileText, Mail, Send } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { StayPageHeader, Section } from "@/components/stay/page-header";
import { dateLabel, money, periodLabel, todayLocal } from "@/lib/stay/format";
import { downloadLandlordStatementPdf } from "@/lib/stay/pdf";
import { cn } from "@/lib/utils";

/** Last month until the 10th (statements go out early in the month), then this month. */
function defaultMonth(): string {
  const today = todayLocal();
  const [y, m, d] = today.split("-").map(Number);
  if (d >= 10) return today.slice(0, 7);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return prev.toISOString().slice(0, 7);
}

export default function StatementsPage() {
  const [month, setMonth] = React.useState(defaultMonth);
  const [selected, setSelected] = React.useState<Id<"contacts"> | null>(null);
  const [confirmAll, setConfirmAll] = React.useState(false);
  const [sendingAll, setSendingAll] = React.useState(false);

  const validMonth = /^\d{4}-\d{2}$/.test(month);
  const overview = useQuery(api.stay.statements.overview, validMonth ? { month } : "skip");
  const emailAll = useMutation(api.stay.statements.emailAll);
  const hub = useQuery(api.hub.getContext);
  const financeOn = !!hub?.enabledModules.includes("finance");

  async function handleEmailAll() {
    setSendingAll(true);
    try {
      const res = await emailAll({ month });
      animatedToast.success("Statements sent", {
        description: `${res.sent} sent${res.skipped ? `, ${res.skipped} skipped (no email address or nothing to show)` : ""}.`,
      });
      setConfirmAll(false);
    } catch (e) {
      animatedToast.error("Could not send statements", { description: getErrorMessage(e) });
    } finally {
      setSendingAll(false);
    }
  }

  const withEmail = overview?.filter((o) => o.email).length ?? 0;

  return (
    <div className="space-y-6">
      {financeOn && (
        <div className="rounded-[12px] border border-border-strong bg-surface-2 p-3 text-sm">
          Landlord statements now come from Sync Finance.{" "}
          <Link href="/app/finance/trust" className="font-medium text-primary-600 hover:underline">
            Open Trust and landlords
          </Link>
        </div>
      )}
      <StayPageHeader
        title="Landlord statements"
        description="Rent collected in the month, less the management fee and recharged expenses. This is the simple statement used when Sync Finance is not switched on."
        actions={
          <Button onClick={() => setConfirmAll(true)} disabled={!overview?.length} className="gap-2">
            <Send className="h-4 w-4" />
            Email all landlords
          </Button>
        }
      />

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>Month</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setSelected(null);
              }}
              className="w-48"
            />
          </div>
          <p className="pb-2 text-sm text-text-muted">
            {validMonth ? periodLabel(month, true) : "Pick a month"}
            {overview ? `, ${overview.length} landlord${overview.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>

      {overview === undefined ? (
        <ListSkeleton />
      ) : overview.length === 0 ? (
        <EmptyState icon={FileText} title="No landlords yet" description="Statements appear here once you have properties under management." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Landlord</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net due</TableHead>
                </tr>
              </thead>
              <tbody>
                {overview.map((o) => (
                  <TableRow
                    key={o.landlordContactId}
                    className={cn("cursor-pointer", selected === o.landlordContactId && "bg-row-hover")}
                    onClick={() => setSelected(o.landlordContactId)}
                  >
                    <TableCell>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-text-muted">{o.email || "No email address"}</div>
                    </TableCell>
                    <TableCell>{o.propertyCount}</TableCell>
                    <TotalsCells totals={o.totals} />
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {overview.map((o) => (
              <button
                key={o.landlordContactId}
                type="button"
                onClick={() => setSelected(o.landlordContactId)}
                className={cn(
                  "w-full rounded-[12px] border bg-card-bg p-4 text-left",
                  selected === o.landlordContactId ? "border-primary" : "border-border-strong"
                )}
              >
                <p className="font-medium">{o.name}</p>
                <p className="text-xs text-text-muted">
                  {o.propertyCount} propert{o.propertyCount === 1 ? "y" : "ies"}
                  {o.email ? "" : ", no email address"}
                </p>
                {o.totals.length === 0 ? (
                  <p className="mt-2 text-sm text-text-muted">Nothing collected this month</p>
                ) : (
                  o.totals.map((t) => (
                    <p key={t.currency} className="mt-2 text-sm">
                      Net due <span className="font-semibold">{money(t.net, t.currency)}</span>
                      <span className="text-text-muted"> (collected {money(t.collected, t.currency)})</span>
                    </p>
                  ))
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {selected && validMonth && <StatementDetail landlordContactId={selected} month={month} />}

      <Modal
        open={confirmAll}
        title="Email all landlords"
        description={`Send the ${validMonth ? periodLabel(month, true) : ""} statement to every landlord with an email address (${withEmail} of ${overview?.length ?? 0}).`}
        onClose={() => setConfirmAll(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmAll(false)} disabled={sendingAll}>
              Cancel
            </Button>
            <Button onClick={handleEmailAll} disabled={sendingAll}>
              {sendingAll ? "Sending..." : "Send statements"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">Landlords without an email address are skipped. You can still download their PDF.</p>
      </Modal>
    </div>
  );
}

function TotalsCells({ totals }: { totals: Array<{ currency: "USD" | "ZiG"; collected: number; fee: number; expenses: number; net: number }> }) {
  if (!totals.length) {
    return (
      <>
        <TableCell className="text-right text-text-muted">-</TableCell>
        <TableCell className="text-right text-text-muted">-</TableCell>
        <TableCell className="text-right text-text-muted">-</TableCell>
        <TableCell className="text-right text-text-muted">-</TableCell>
      </>
    );
  }
  const col = (k: "collected" | "fee" | "expenses" | "net", bold = false) => (
    <TableCell className={cn("text-right whitespace-nowrap", bold && "font-semibold")}>
      {totals.map((t) => (
        <div key={t.currency}>{money(t[k], t.currency)}</div>
      ))}
    </TableCell>
  );
  return (
    <>
      {col("collected")}
      {col("fee")}
      {col("expenses")}
      {col("net", true)}
    </>
  );
}

function StatementDetail({ landlordContactId, month }: { landlordContactId: Id<"contacts">; month: string }) {
  const st = useQuery(api.stay.statements.get, { landlordContactId, month });
  const branding = useQuery(api.branding.get);
  const email = useMutation(api.stay.statements.email);
  const [busy, setBusy] = React.useState<"pdf" | "email" | null>(null);

  if (st === undefined) return <ListSkeleton />;
  if (st === null) return null;

  async function download() {
    if (!st) return;
    setBusy("pdf");
    try {
      await downloadLandlordStatementPdf(st, branding?.logoUrl);
    } catch (e) {
      animatedToast.error("Could not create the PDF", { description: getErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("email");
    try {
      await email({ landlordContactId, month });
      animatedToast.success("Statement emailed", { description: `Sent to ${st?.landlord.email}.` });
    } catch (e) {
      animatedToast.error("Could not email the statement", { description: getErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title={`${st.landlord.name}: ${st.monthLabel}`}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={download} disabled={busy !== null} className="gap-1.5">
            <Download className="h-4 w-4" />
            {busy === "pdf" ? "Preparing..." : "Download PDF"}
          </Button>
          <Button size="sm" onClick={send} disabled={busy !== null || !st.landlord.email} className="gap-1.5">
            <Mail className="h-4 w-4" />
            {busy === "email" ? "Sending..." : "Email to landlord"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-text-muted">
          {st.properties.map((p) => `${p.name} (fee ${p.feePct}%)`).join("; ")}
          {!st.landlord.email && ". No email address on file, so this statement can only be downloaded."}
        </p>

        {st.sections.length === 0 && <p className="text-sm text-text-muted">No rent was collected and no expenses were recorded in this month.</p>}

        {st.sections.map((s) => (
          <div key={s.currency} className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{s.currency}</h3>

            {s.collections.length > 0 && (
              <Lines
                title="Rent collected"
                head={["Date", "Receipt", "Property", "Tenant", "Fee", "Collected"]}
                rows={s.collections.map((c) => [
                  dateLabel(c.date),
                  c.receiptNumber,
                  `${c.propertyName} ${c.unitLabel}`,
                  c.tenantName,
                  `${money(c.fee, s.currency)} (${c.feePct}%)`,
                  money(c.amount, s.currency),
                ])}
              />
            )}
            {s.depositLines.length > 0 && (
              <Lines
                title="Deposit applied to amounts owed"
                head={["Date", "Property", "Tenant", "Amount"]}
                rows={s.depositLines.map((d) => [dateLabel(d.date), `${d.propertyName} ${d.unitLabel}`, d.tenantName, money(d.amount, s.currency)])}
              />
            )}
            {s.expenseLines.length > 0 && (
              <Lines
                title="Expenses recharged"
                head={["Date", "Property", "Expense", "Supplier", "Amount"]}
                rows={s.expenseLines.map((e) => [dateLabel(e.date), e.propertyName, e.description, e.supplier || "-", money(e.amount, s.currency)])}
              />
            )}

            <dl className="ml-auto max-w-sm space-y-1 text-sm">
              <TotalRow label="Rent collected" value={money(s.collected, s.currency)} />
              {s.depositApplied > 0 && <TotalRow label="Deposit applied" value={money(s.depositApplied, s.currency)} />}
              <TotalRow label="Less management fee" value={`-${money(s.fee, s.currency)}`} />
              <TotalRow label="Less expenses" value={`-${money(s.expenses, s.currency)}`} />
              <div className="border-t border-border pt-1">
                <TotalRow label="Net due to landlord" value={money(s.net, s.currency)} bold />
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", bold && "font-semibold")}>
      <dt className={bold ? "" : "text-text-muted"}>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}

/** A small table of statement lines; the last column is the amount. */
function Lines({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              {head.map((h, i) => (
                <th key={h} className={cn("py-2 pr-3", i >= head.length - 2 && i > 1 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60">
                {r.map((c, j) => (
                  <td key={j} className={cn("py-2 pr-3", j >= r.length - 2 && j > 1 && "text-right whitespace-nowrap")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm">
            <span className="min-w-0">
              <span className="block">{r.slice(1, -1).filter(Boolean).join(", ")}</span>
              <span className="block text-xs text-text-muted">{r[0]}</span>
            </span>
            <span className="shrink-0 font-medium">{r[r.length - 1]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
