/**
 * Sync Stay PDFs as HTML for expo-print: receipts, landlord statements,
 * tenant statements and reports. The phone counterpart of the website's
 * jsPDF builders in src/lib/stay/pdf.ts and tenant-statement-pdf.ts, with
 * the same content. Each returns a file name and HTML for sharePdf.
 */
import { dateLabel, datePrefix, fileSafe, money, type StayCurrency } from "@/lib/stay/format";
import { esc, pdfShell } from "../files";

export type Agency = { name: string; address?: string; phone?: string; email?: string; vatNumber?: string };

function shell(title: string, agency: Agency, logoUrl: string | null | undefined, body: string): string {
  return pdfShell({
    title,
    agencyName: agency.name,
    agencyLines: [agency.address ?? "", agency.phone ?? "", agency.email ?? "", agency.vatNumber ? `VAT ${agency.vatNumber}` : ""],
    logoUrl,
    body,
  });
}

function table(head: string[], rows: string[][], right: number[] = []): string {
  const cls = (i: number) => (right.includes(i) ? ' class="r"' : "");
  return `<table><thead><tr>${head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

// ── Receipt ────────────────────────────────────────────────────────────

export type ReceiptData = {
  agency: Agency;
  receiptNumber: string;
  paidOn: string;
  amount: number;
  currency: StayCurrency;
  method: string;
  reference: string;
  purpose: "rent" | "deposit";
  tenantName: string;
  propertyName: string;
  propertyAddress: string;
  unitLabel: string;
  allocations: Array<{ description: string; amount: number }>;
  creditAdded: number;
  balanceNow: number;
  recordedBy: string;
  reversed: boolean;
  reverseReason: string | null;
};

export function receiptPdf(r: ReceiptData, logoUrl?: string | null): { html: string; fileName: string } {
  const facts: string[][] = [
    ["Received from", r.tenantName],
    ["Property", `${r.propertyName}, ${r.unitLabel}`],
    ...(r.propertyAddress ? [["Address", r.propertyAddress]] : []),
    ["Method", r.method],
    ...(r.reference ? [["Reference", r.reference]] : []),
  ];
  let body = `<table style="width:auto">${facts.map(([k, v]) => `<tr><td class="muted" style="border:none;width:140px">${esc(k)}</td><td style="border:none">${esc(v)}</td></tr>`).join("")}</table>`;
  body += `<p style="margin:14px 0 2px" class="muted">Receipt ${esc(r.receiptNumber)}, ${esc(dateLabel(r.paidOn))}</p>`;
  body += `<div style="background:#ecfdf3;border-radius:6px;padding:12px 16px;margin:6px 0 14px"><div class="muted">Amount received</div><div style="font-size:22px;font-weight:700">${esc(money(r.amount, r.currency))}</div></div>`;
  if (r.purpose === "rent") {
    const rows = r.allocations.map((a) => [a.description, money(a.amount, r.currency)]);
    if (r.creditAdded > 0) rows.push(["Credit carried forward", money(r.creditAdded, r.currency)]);
    if (rows.length) body += table(["Paid against", "Amount"], rows, [1]);
    body += `<p>Balance on account after this payment: <b>${esc(money(r.balanceNow, r.currency))}</b></p>`;
  } else {
    body += `<p>Held as a deposit against the lease. It is not rent.</p>`;
  }
  body += `<p class="muted">Received by ${esc(r.recordedBy)}<br/>Thank you.</p>`;
  if (r.reversed) {
    body += `<div style="color:#dc2626;font-size:40px;font-weight:700;text-align:center;margin-top:24px;transform:rotate(-12deg)">REVERSED</div><p style="color:#dc2626">Reversed: ${esc(r.reverseReason ?? "")}</p>`;
  }
  return {
    html: shell(r.purpose === "deposit" ? "Deposit receipt" : "Receipt", r.agency, logoUrl, body),
    fileName: `${datePrefix()}Receipt_${fileSafe(r.receiptNumber)}_${fileSafe(r.tenantName)}.pdf`,
  };
}

// ── Landlord statement ─────────────────────────────────────────────────

export type LandlordStatementData = {
  agency: Agency;
  landlord: { name: string; email: string; phone: string; bankDetails: { bankName?: string; accountName?: string; accountNumber?: string; branch?: string } };
  month: string;
  monthLabel: string;
  properties: Array<{ name: string; feePct: number }>;
  sections: Array<{
    currency: StayCurrency;
    collected: number;
    depositApplied: number;
    fee: number;
    expenses: number;
    net: number;
    collections: Array<{ date: string; receiptNumber: string; propertyName: string; unitLabel: string; tenantName: string; amount: number; feePct: number; fee: number }>;
    depositLines: Array<{ date: string; propertyName: string; unitLabel: string; tenantName: string; amount: number }>;
    expenseLines: Array<{ date: string; propertyName: string; description: string; supplier: string; amount: number }>;
  }>;
};

export function landlordStatementPdf(st: LandlordStatementData, logoUrl?: string | null): { html: string; fileName: string } {
  const b = st.landlord.bankDetails;
  const bank = [b.bankName, b.branch, b.accountName, b.accountNumber].filter(Boolean).join(", ");
  let body = `<h2 style="margin-top:0">${esc(st.monthLabel)}</h2><p><b>${esc(st.landlord.name)}</b>${bank ? `<br/><span class="muted">Pay to: ${esc(bank)}</span>` : ""}<br/><span class="muted">Properties: ${esc(
    st.properties.map((p) => `${p.name} (fee ${p.feePct}%)`).join("; "),
  )}</span></p>`;
  if (!st.sections.length) body += `<p>No rent was collected and no expenses were recorded in this month.</p>`;
  for (const s of st.sections) {
    const m = (n: number) => money(n, s.currency);
    body += `<h2>${esc(s.currency)}</h2>`;
    if (s.collections.length) {
      body += table(
        ["Date", "Receipt", "Property", "Tenant", "Collected", "Fee"],
        s.collections.map((c) => [dateLabel(c.date), c.receiptNumber, `${c.propertyName} ${c.unitLabel}`, c.tenantName, m(c.amount), `${m(c.fee)} (${c.feePct}%)`]),
        [4, 5],
      );
    }
    if (s.depositLines.length) {
      body += table(
        ["Date", "Deposit applied to amounts owed", "Amount"],
        s.depositLines.map((d) => [dateLabel(d.date), `${d.propertyName} ${d.unitLabel}, ${d.tenantName}`, m(d.amount)]),
        [2],
      );
    }
    if (s.expenseLines.length) {
      body += table(
        ["Date", "Property", "Expense", "Supplier", "Amount"],
        s.expenseLines.map((e) => [dateLabel(e.date), e.propertyName, e.description, e.supplier, m(e.amount)]),
        [4],
      );
    }
    const totals: string[][] = [
      ["Rent collected", m(s.collected)],
      ...(s.depositApplied ? [["Deposit applied", m(s.depositApplied)]] : []),
      ["Less management fee", `-${m(s.fee)}`],
      ["Less expenses", `-${m(s.expenses)}`],
    ];
    body += `<table style="width:55%;margin-left:45%">${totals.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`).join("")}<tr class="total"><td>Net due to landlord</td><td class="r">${esc(m(s.net))}</td></tr></table>`;
  }
  return {
    html: shell("Landlord statement", st.agency, logoUrl, body),
    fileName: `${datePrefix()}Statement_${fileSafe(st.landlord.name)}_${st.month}.pdf`,
  };
}

// ── Tenant statement ───────────────────────────────────────────────────

export type TenantStatementData = {
  agency: Agency;
  tenant: { name: string; phone: string; email: string; idNumber: string };
  accounts: Array<{
    label: string;
    status: string;
    startDate: string;
    endDate: string;
    currency: StayCurrency;
    balance: number;
    lines: Array<{ date: string; description: string; debit: number; credit: number; balance: number }>;
  }>;
  asOf: string;
};

export function tenantStatementPdf(st: TenantStatementData, logoUrl?: string | null): { html: string; fileName: string } {
  const contact = [st.tenant.phone, st.tenant.email, st.tenant.idNumber ? `ID ${st.tenant.idNumber}` : ""].filter(Boolean).join(", ");
  let body = `<p><b>${esc(st.tenant.name)}</b>${contact ? `<br/><span class="muted">${esc(contact)}</span>` : ""}<br/><span class="muted">As at ${esc(dateLabel(st.asOf))}</span></p>`;
  if (!st.accounts.length) body += `<p>No leases on record.</p>`;
  for (const a of st.accounts) {
    const m = (n: number) => money(n, a.currency);
    body += `<h2>${esc(a.label)} (${esc(a.currency)})</h2><div class="muted">${esc(dateLabel(a.startDate))} to ${esc(dateLabel(a.endDate))}, ${esc(a.status)}</div>`;
    body += table(
      ["Date", "Details", "Charged", "Paid", "Balance"],
      a.lines.length
        ? a.lines.map((l) => [dateLabel(l.date), l.description, l.debit ? m(l.debit) : "", l.credit ? m(l.credit) : "", m(l.balance)])
        : [["", "No charges or payments yet", "", "", ""]],
      [2, 3, 4],
    );
    body += `<p class="r"><b>${a.balance < 0 ? "In credit" : "Balance due"}: ${esc(m(Math.abs(a.balance)))}</b></p>`;
  }
  return {
    html: shell("Tenant statement", st.agency, logoUrl, body),
    fileName: `${datePrefix()}Statement_${fileSafe(st.tenant.name)}.pdf`,
  };
}

// ── Reports ────────────────────────────────────────────────────────────

export type ReportTable = { name: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> };
export type ReportPayload = {
  /** File name without extension or date prefix. */
  filename: string;
  title: string;
  subtitle?: string;
  summary?: Array<{ label: string; value: string }>;
  tables: ReportTable[];
};

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function reportPdf(p: ReportPayload, agencyName: string): { html: string; fileName: string } {
  let body = p.subtitle ? `<p class="muted">${esc(p.subtitle)}</p>` : "";
  if (p.summary?.length) {
    body += `<table style="width:auto">${p.summary.map((s) => `<tr><td class="muted">${esc(s.label)}</td><td><b>${esc(s.value)}</b></td></tr>`).join("")}</table>`;
  }
  for (const t of p.tables) {
    body += `<h2>${esc(t.name)}</h2>`;
    body += t.rows.length
      ? table(
          t.columns.map((c) => c.label),
          t.rows.map((r) => t.columns.map((c) => cell(r[c.key]))),
        )
      : `<p class="muted">Nothing to show.</p>`;
  }
  return { html: pdfShell({ title: p.title, agencyName, body }), fileName: `${datePrefix()}${p.filename}.pdf` };
}

/** One CSV text with a block per table, the same layout as the website's CSV export. */
export function reportCsv(p: ReportPayload): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [q(p.title)];
  if (p.subtitle) lines.push(q(p.subtitle));
  for (const s of p.summary ?? []) lines.push([q(s.label), q(s.value)].join(","));
  for (const t of p.tables) {
    lines.push("", q(t.name), t.columns.map((c) => q(c.label)).join(","));
    for (const r of t.rows) lines.push(t.columns.map((c) => q(cell(r[c.key]))).join(","));
  }
  return lines.join("\n");
}
