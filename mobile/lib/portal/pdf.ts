/**
 * PDFs a portal user can share: receipts, the landlord statement and
 * inspection reports. Same content as the website's jsPDF versions, built as
 * HTML for expo-print.
 */
import { esc, pdfShell, sharePdf } from "../files";
import { dateLabel, money } from "../format";
import { conditionLabel, pairRooms, type Condition } from "@/lib/stay-ops/labels";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

type Receipt = FunctionReturnType<typeof api.portal.tenant.receipt>;
type Statement = NonNullable<FunctionReturnType<typeof api.portal.landlord.statement>>;
type Report = FunctionReturnType<typeof api.portal.tenant.inspection>;

type Agency = { name: string; address?: string; phone?: string; email?: string; vatNumber?: string };

const lines = (a: Agency) => [a.address, a.phone, a.email, a.vatNumber ? `VAT ${a.vatNumber}` : ""].filter((s): s is string => !!s);
const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const stamp = () => {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_`;
};

export async function shareReceiptPdf(r: Receipt, logoUrl?: string | null) {
  const body = `
  <table><tr><td class="muted" style="width:130px">Receipt</td><td><b>${esc(r.receiptNumber)}</b> on ${esc(dateLabel(r.paidOn))}</td></tr>
  <tr><td class="muted">Received from</td><td>${esc(r.tenantName)}</td></tr>
  <tr><td class="muted">Property</td><td>${esc(r.propertyName)}, ${esc(r.unitLabel)}</td></tr>
  ${r.propertyAddress ? `<tr><td class="muted">Address</td><td>${esc(r.propertyAddress)}</td></tr>` : ""}
  <tr><td class="muted">Method</td><td>${esc(r.method)}</td></tr>
  ${r.reference ? `<tr><td class="muted">Reference</td><td>${esc(r.reference)}</td></tr>` : ""}</table>
  <p class="muted" style="margin:16px 0 0">Amount received</p>
  <p style="font-size:22px;font-weight:700;margin:2px 0 14px">${esc(money(r.amount, r.currency))}</p>
  ${
    r.purpose === "rent"
      ? `<table><tr><th>Paid against</th><th class="r">Amount</th></tr>
      ${r.allocations.map((a) => `<tr><td>${esc(a.description)}</td><td class="r">${esc(money(a.amount, r.currency))}</td></tr>`).join("")}
      ${r.creditAdded > 0 ? `<tr><td>Credit carried forward</td><td class="r">${esc(money(r.creditAdded, r.currency))}</td></tr>` : ""}</table>
      <p>Balance on account after this payment: <b>${esc(money(r.balanceNow, r.currency))}</b></p>`
      : `<p>Held as a deposit against the lease. It is not rent.</p>`
  }
  ${r.reversed ? `<p style="color:#dc2626"><b>REVERSED.</b> ${esc(r.reverseReason ?? "")}</p>` : ""}
  <p class="muted">Thank you.</p>`;
  const html = pdfShell({
    title: r.purpose === "deposit" ? "Deposit receipt" : "Receipt",
    agencyName: r.agency.name,
    agencyLines: lines(r.agency),
    logoUrl,
    body,
  });
  await sharePdf(html, `${stamp()}Receipt_${safe(r.receiptNumber)}.pdf`);
}

export async function shareStatementPdf(st: Statement, logoUrl?: string | null) {
  const b = st.landlord.bankDetails;
  const bank = [b.bankName, b.branch, b.accountName, b.accountNumber].filter(Boolean).join(", ");
  const sections = st.sections
    .map((s) => {
      const c = s.currency;
      return `<h2>${esc(c)}</h2>
      ${
        s.collections.length
          ? `<table><tr><th>Date</th><th>Receipt</th><th>Property</th><th>Tenant</th><th class="r">Collected</th><th class="r">Fee</th></tr>
          ${s.collections
            .map(
              (x) =>
                `<tr><td>${esc(dateLabel(x.date))}</td><td>${esc(x.receiptNumber)}</td><td>${esc(x.propertyName)} ${esc(x.unitLabel)}</td><td>${esc(x.tenantName)}</td><td class="r">${esc(money(x.amount, c))}</td><td class="r">${esc(money(x.fee, c))} (${x.feePct}%)</td></tr>`
            )
            .join("")}</table>`
          : ""
      }
      ${
        s.depositLines.length
          ? `<table><tr><th>Date</th><th>Deposit applied to amounts owed</th><th class="r">Amount</th></tr>
          ${s.depositLines.map((d) => `<tr><td>${esc(dateLabel(d.date))}</td><td>${esc(d.propertyName)} ${esc(d.unitLabel)}, ${esc(d.tenantName)}</td><td class="r">${esc(money(d.amount, c))}</td></tr>`).join("")}</table>`
          : ""
      }
      ${
        s.expenseLines.length
          ? `<table><tr><th>Date</th><th>Property</th><th>Expense</th><th>Supplier</th><th class="r">Amount</th></tr>
          ${s.expenseLines.map((e) => `<tr><td>${esc(dateLabel(e.date))}</td><td>${esc(e.propertyName)}</td><td>${esc(e.description)}</td><td>${esc(e.supplier)}</td><td class="r">${esc(money(e.amount, c))}</td></tr>`).join("")}</table>`
          : ""
      }
      <table style="width:55%;margin-left:45%">
        <tr><td>Rent collected</td><td class="r">${esc(money(s.collected, c))}</td></tr>
        ${s.depositApplied ? `<tr><td>Deposit applied</td><td class="r">${esc(money(s.depositApplied, c))}</td></tr>` : ""}
        <tr><td>Less management fee</td><td class="r">-${esc(money(s.fee, c))}</td></tr>
        <tr><td>Less expenses</td><td class="r">-${esc(money(s.expenses, c))}</td></tr>
        <tr class="total"><td>Net due to landlord</td><td class="r">${esc(money(s.net, c))}</td></tr>
      </table>`;
    })
    .join("");
  const body = `<p><b>${esc(st.landlord.name)}</b> &middot; ${esc(st.monthLabel)}</p>
  ${bank ? `<p class="muted">Pay to: ${esc(bank)}</p>` : ""}
  <p class="muted">Properties: ${esc(st.properties.map((p) => `${p.name} (fee ${p.feePct}%)`).join("; "))}</p>
  ${st.sections.length ? sections : "<p>No rent was collected and no expenses were recorded in this month.</p>"}`;
  const html = pdfShell({ title: "Landlord statement", agencyName: st.agency.name, agencyLines: lines(st.agency), logoUrl, body });
  await sharePdf(html, `${stamp()}Statement_${safe(st.landlord.name)}_${st.month}.pdf`);
}

export async function shareInspectionPdf(r: Report, org: { name: string; phone?: string | null; email?: string | null; logoUrl?: string | null }) {
  const paired = r.moveIn ? pairRooms(r.rooms, r.moveIn.rooms) : null;
  const rows = paired
    ? `<tr><th>Room</th><th>Move-in</th><th>Move-out</th><th>Notes</th></tr>` +
      paired.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(conditionLabel(p.in?.condition as Condition | undefined))}</td><td>${esc(conditionLabel(p.out?.condition as Condition | undefined))}</td><td>${esc(p.out?.note ?? "")}</td></tr>`).join("")
    : `<tr><th>Room</th><th>Condition</th><th>Notes</th></tr>` +
      r.rooms.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(conditionLabel(x.condition as Condition | undefined))}</td><td>${esc(x.note ?? "")}</td></tr>`).join("");
  const withPhotos = r.rooms.filter((x) => x.photoUrls.length);
  const body = `<table>
  <tr><td class="muted" style="width:110px">Property</td><td>${esc(r.propertyTitle)}${r.propertyLocation ? `, ${esc(r.propertyLocation)}` : ""}</td></tr>
  <tr><td class="muted">Unit</td><td>${esc(r.unitLabel)}</td></tr>
  ${r.tenantName ? `<tr><td class="muted">Tenant</td><td>${esc(r.tenantName)}</td></tr>` : ""}
  <tr><td class="muted">Date</td><td>${esc(dateLabel(r.date))}</td></tr>
  <tr><td class="muted">Inspector</td><td>${esc(r.inspectorName)}</td></tr>
  ${r.meterReadings?.water ? `<tr><td class="muted">Water meter</td><td>${esc(r.meterReadings.water)}</td></tr>` : ""}
  ${r.meterReadings?.electricity ? `<tr><td class="muted">Electricity meter</td><td>${esc(r.meterReadings.electricity)}</td></tr>` : ""}</table>
  <table>${rows}</table>
  ${r.comments ? `<h2>Overall comments</h2><p>${esc(r.comments)}</p>` : ""}
  ${withPhotos.length ? `<h2>Photos</h2>${withPhotos.map((x) => `<p><b>${esc(x.name)}</b></p><div class="photos">${x.photoUrls.map((u) => `<img src="${esc(u)}"/>`).join("")}</div>`).join("")}` : ""}
  ${r.addenda.length ? `<h2>Addenda</h2><table><tr><th>Date</th><th>By</th><th>Note</th></tr>${r.addenda.map((a) => `<tr><td>${esc(dateLabel(a.at))}</td><td>${esc(a.byName)}</td><td>${esc(a.note)}</td></tr>`).join("")}</table>` : ""}`;
  const html = pdfShell({
    title: `${r.typeLabel} inspection report`,
    agencyName: org.name,
    agencyLines: [org.phone ?? "", org.email ?? ""],
    logoUrl: org.logoUrl,
    body,
  });
  const slug = `${r.propertyTitle}-${r.unitLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await sharePdf(html, `${r.date.replace(/-/g, "").slice(2)}_inspection-${r.type.replace("_", "-")}-${slug}.pdf`);
}
