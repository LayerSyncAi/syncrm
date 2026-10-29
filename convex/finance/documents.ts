/**
 * Finance documents as data: the one A4 layout (src/lib/finance/pdf.ts) draws
 * them in the browser for download and on the server to attach to emails
 * (BRD §4: every document is emailed as a PDF). Pure: no Convex imports.
 */
import { dateLabel, formatAmount, type StayCurrency } from "../stay/ledger";

type Agency = { name: string; address?: string; phone?: string; email?: string; vatNumber?: string };

export type FinanceDocument = {
  agency: Agency;
  /** "Receipt", "Remittance advice", "Landlord statement"... */
  title: string;
  /** Number or period shown top right, e.g. "RC-00042" or "October 2026". */
  number?: string;
  date?: string;
  /** Who the document is for. */
  party?: { label: string; name: string; lines?: string[] };
  /** Label and value pairs under the heading. */
  facts?: Array<[string, string]>;
  /** The big figure, e.g. amount received. */
  highlight?: { label: string; value: string };
  tables?: Array<{ title?: string; head: string[]; body: string[][]; alignRight?: number[] }>;
  /** Totals block at the end, last row in bold. */
  totals?: Array<[string, string]>;
  notes?: string[];
  /** Stamp across the page, e.g. "REVERSED" or "CANCELLED". */
  stamp?: string;
  fileName: string;
};

const m = (n: number, c: string) => formatAmount(n, c as StayCurrency);

export function receiptDocument(d: {
  agency: Agency;
  kind: string;
  number: string;
  date: string;
  counterparty: string;
  description: string;
  method: string;
  reference: string;
  currency: string;
  amount: number;
  recordedBy: string;
  reversed: boolean;
}): FinanceDocument {
  const isReceipt = d.kind === "receipt";
  return {
    agency: d.agency,
    title: isReceipt ? "Receipt" : "Payment voucher",
    number: d.number,
    date: dateLabel(d.date),
    party: { label: isReceipt ? "Received from" : "Paid to", name: d.counterparty || "-" },
    facts: [
      ["For", d.description],
      ...(d.method ? ([["Method", d.method]] as Array<[string, string]>) : []),
      ...(d.reference ? ([["Reference", d.reference]] as Array<[string, string]>) : []),
    ],
    highlight: { label: isReceipt ? "Amount received" : "Amount paid", value: m(d.amount, d.currency) },
    notes: [`${isReceipt ? "Received" : "Paid"} by ${d.recordedBy}.`, ...(isReceipt ? ["Thank you."] : [])],
    stamp: d.reversed ? "REVERSED" : undefined,
    fileName: `${isReceipt ? "Receipt" : "Voucher"}_${d.number}_${d.counterparty}`,
  };
}

export function invoiceDocument(inv: {
  agency: Agency;
  number: string;
  clientName: string;
  clientEmail?: string;
  date: string;
  dueDate: string;
  currency: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number }>;
  vatRate: number;
  subtotal: number;
  vat: number;
  total: number;
  amountPaid: number;
  notes?: string;
  status: string;
}): FinanceDocument {
  const c = inv.currency;
  return {
    agency: inv.agency,
    title: "Invoice",
    number: inv.number,
    date: dateLabel(inv.date),
    party: { label: "Bill to", name: inv.clientName, lines: inv.clientEmail ? [inv.clientEmail] : [] },
    facts: [["Due date", dateLabel(inv.dueDate)]],
    tables: [
      {
        head: ["Description", "Qty", "Price", "Amount"],
        body: inv.lines.map((l) => [l.description, String(l.quantity), m(l.unitPrice, c), m(l.quantity * l.unitPrice, c)]),
        alignRight: [1, 2, 3],
      },
    ],
    totals: [
      ...(inv.vat > 0 ? ([["Subtotal", m(inv.subtotal, c)], [`VAT ${inv.vatRate}%`, m(inv.vat, c)]] as Array<[string, string]>) : []),
      ["Total", m(inv.total, c)],
      ...(inv.amountPaid > 0 ? ([["Paid", m(inv.amountPaid, c)], ["Still to pay", m(inv.total - inv.amountPaid, c)]] as Array<[string, string]>) : []),
    ],
    notes: inv.notes ? [inv.notes] : undefined,
    stamp: inv.status === "cancelled" ? "CANCELLED" : inv.status === "paid" ? "PAID" : undefined,
    fileName: `Invoice_${inv.number}_${inv.clientName}`,
  };
}

export function remittanceDocument(r: {
  agency: Agency;
  number: string;
  date: string;
  payeeName: string;
  currency: string;
  amount: number;
  method: string;
  reference: string;
  account: string;
  lines: Array<{ date: string; description: string; amount: number }>;
  received: number;
  deducted: number;
}): FinanceDocument {
  const c = r.currency;
  return {
    agency: r.agency,
    title: "Remittance advice",
    number: r.number,
    date: dateLabel(r.date),
    party: { label: "Paid to", name: r.payeeName },
    facts: [
      ["Method", r.method],
      ...(r.reference ? ([["Reference", r.reference]] as Array<[string, string]>) : []),
      ["Paid from", r.account],
    ],
    tables: [{ title: "Since your last payment", head: ["Date", "Item", "Amount"], body: r.lines.map((l) => [dateLabel(l.date), l.description, m(l.amount, c)]), alignRight: [2] }],
    totals: [
      ["Received", m(r.received, c)],
      ["Commission and expenses", m(r.deducted, c)],
      ["Paid to you", m(r.amount, c)],
    ],
    fileName: `Remittance_${r.number}_${r.payeeName}`,
  };
}

export function landlordStatementDocument(st: {
  agency: Agency;
  landlord: { name: string; email: string };
  month: string;
  monthLabel: string;
  sections: Array<{
    currency: string;
    opening: number;
    closing: number;
    movements: Array<{ date: string; description: string; property: string; amount: number }>;
    properties: Array<{ name: string; charged: number; received: number; arrears: number; commission: number; expenses: number; payouts: number }>;
    totals: { received: number; commission: number; expenses: number; payouts: number };
  }>;
}): FinanceDocument {
  return {
    agency: st.agency,
    title: "Landlord statement",
    number: st.monthLabel,
    party: { label: "Statement for", name: st.landlord.name, lines: st.landlord.email ? [st.landlord.email] : [] },
    tables: st.sections.flatMap((s) => [
      {
        title: `${s.currency}: by property`,
        head: ["Property", "Rent charged", "Received", "Arrears", "Commission", "Expenses", "Paid to you"],
        body: s.properties.map((p) => [p.name, m(p.charged, s.currency), m(p.received, s.currency), m(p.arrears, s.currency), m(p.commission, s.currency), m(p.expenses, s.currency), m(p.payouts, s.currency)]),
        alignRight: [1, 2, 3, 4, 5, 6],
      },
      {
        title: `${s.currency}: every movement`,
        head: ["Date", "Item", "Property", "Amount"],
        body: s.movements.map((mv) => [dateLabel(mv.date), mv.description, mv.property, m(mv.amount, s.currency)]),
        alignRight: [3],
      },
    ]),
    totals: st.sections.flatMap((s) => [
      [`${s.currency} brought forward`, m(s.opening, s.currency)] as [string, string],
      [`${s.currency} received`, m(s.totals.received, s.currency)] as [string, string],
      [`${s.currency} commission`, m(-s.totals.commission, s.currency)] as [string, string],
      [`${s.currency} expenses`, m(-s.totals.expenses, s.currency)] as [string, string],
      [`${s.currency} paid to you`, m(-s.totals.payouts, s.currency)] as [string, string],
      [`${s.currency} balance held for you`, m(s.closing, s.currency)] as [string, string],
    ]),
    notes: st.sections.length ? undefined : [`No activity on your account in ${st.monthLabel}.`],
    fileName: `Statement_${st.landlord.name}_${st.month}`,
  };
}

export function standStatementDocument(d: {
  agency: Agency;
  stand: { standNumber: string; currency: string; price: number; status: string };
  development: { name: string };
  buyer: { name: string; email: string; phone: string };
  interest: number;
  paidToDate: number;
  balance: number;
  overdue: number;
  nextDueDate?: string;
  nextDueAmount?: number;
  rows: Array<{ dueDate: string; label: string; amount: number; paid: number; status: string }>;
  payments: Array<{ date: string; number: string; amount: number }>;
  refunds: Array<{ date: string; number: string; amount: number }>;
}): FinanceDocument {
  const c = d.stand.currency;
  return {
    agency: d.agency,
    title: "Statement",
    number: `Stand ${d.stand.standNumber}`,
    party: { label: "Buyer", name: d.buyer.name, lines: [d.development.name, d.buyer.email, d.buyer.phone].filter(Boolean) },
    facts: [
      ["Price", m(d.stand.price, c)],
      ...(d.interest > 0 ? ([["Interest charged", m(d.interest, c)]] as Array<[string, string]>) : []),
      ...(d.nextDueDate ? ([["Next payment", `${m(d.nextDueAmount ?? 0, c)} on ${dateLabel(d.nextDueDate)}`]] as Array<[string, string]>) : []),
    ],
    tables: [
      { title: "Payment plan", head: ["Due", "Item", "Amount", "Paid", "Status"], body: d.rows.map((r) => [dateLabel(r.dueDate), r.label, m(r.amount, c), m(r.paid, c), r.status.replace("_", " ")]), alignRight: [2, 3] },
      {
        title: "Payments",
        head: ["Date", "Receipt", "Amount"],
        body: [...d.payments.map((p) => [dateLabel(p.date), p.number, m(p.amount, c)]), ...d.refunds.map((p) => [dateLabel(p.date), `${p.number} refund`, m(-p.amount, c)])],
        alignRight: [2],
      },
    ],
    totals: [
      ["Paid to date", m(d.paidToDate, c)],
      ["Overdue", m(d.overdue, c)],
      ["Balance", m(d.balance, c)],
    ],
    stamp: d.stand.status === "cancelled" ? "CANCELLED" : undefined,
    fileName: `Statement_Stand_${d.stand.standNumber}_${d.buyer.name}`,
  };
}
