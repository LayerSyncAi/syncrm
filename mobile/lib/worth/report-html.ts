/**
 * The branded A4 valuation report (VW-50..53) as HTML for expo-print, built
 * from api.worth.valuation.reportData like the website's jsPDF report. Every
 * figure is read from the job record; nothing is typed into report text.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { esc } from "../files";
import { imageDataUri } from "./files";
import {
  CLASS_LABELS,
  METHOD_LABELS,
  PARTY_LABELS,
  PURPOSE_LABELS,
  VALUE_KEYS,
  VALUE_LABELS,
  formatArea,
  formatDay,
  formatMoney,
  formatNumber,
} from "./util";

export type ReportData = FunctionReturnType<typeof api.worth.valuation.reportData>;

const SERVICE_LABELS: Record<string, string> = {
  municipalWater: "Municipal water",
  borehole: "Borehole",
  electricity: "Mains electricity",
  solar: "Solar",
  sewer: "Mains sewer",
  septicTank: "Septic tank",
  tarredRoad: "Tarred road access",
  boundaryWall: "Boundary wall",
  electricFence: "Electric fence",
  pool: "Swimming pool",
};

const ROOM_LABELS: Record<string, string> = {
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  ensuites: "En-suites",
  lounges: "Lounges",
  diningRooms: "Dining rooms",
  kitchens: "Kitchens",
  studies: "Studies",
  garages: "Garages",
  carports: "Carports",
  staffQuarters: "Staff quarters",
};

const CONDITION_LABELS: Record<string, string> = { excellent: "Excellent", good: "Good", fair: "Fair", poor: "Poor" };

/**
 * What is stamped on every page after printing (see lib/pdfStamp.ts): the
 * running line from page 2, after the cover, and DRAFT until issued.
 */
export function reportStamp(data: ReportData): { header: string; headerFromPage: number; watermark?: string } {
  const job = data.job;
  const ref = `${job.reference}${job.version > 1 ? ` (version ${job.version})` : ""}`;
  return {
    header: `${data.org.name} | ${ref} | ${job.propertyAddress}`,
    headerFromPage: 2,
    watermark: job.status === "issued" ? undefined : "DRAFT",
  };
}

export function reportFilename(data: ReportData): string {
  return `${data.job.reference}${data.job.version > 1 ? `-v${data.job.version}` : ""}${data.job.status === "issued" ? "" : "-draft"}.pdf`;
}

/** Plain text with line breaks kept. */
function para(text: string | undefined | null, cls = ""): string {
  if (!text?.trim()) return "";
  return `<p class="${cls}">${esc(text).replace(/\n/g, "<br/>")}</p>`;
}

function kv(rows: Array<[string, string | undefined | null | false]>): string {
  const body = rows
    .filter((r): r is [string, string] => !!r[1])
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");
  return body ? `<table class="kv">${body}</table>` : "";
}

function grid(head: string[], rows: string[][], cls = ""): string {
  if (!rows.length) return "";
  return `<table class="grid ${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

const h = (text: string) => `<h2>${esc(text)}</h2>`;
const sub = (text: string) => `<h3>${esc(text)}</h3>`;

export async function buildReportHtml(data: ReportData, logoUrl?: string | null): Promise<string> {
  const job = data.job;
  const short = job.reportForm === "short";
  const issued = job.status === "issued";
  const maxPhotos = short ? 4 : 24;

  const [logo, photos, prepSig, signSig] = await Promise.all([
    imageDataUri(logoUrl, { maxDim: 600, png: true }),
    Promise.all((data.inspection?.photos ?? []).slice(0, maxPhotos).map((p) => imageDataUri(p.url, { maxDim: 1200 }))),
    imageDataUri(data.preparedBy?.signatureUrl, { maxDim: 600, png: true }),
    imageDataUri(data.signedBy?.signatureUrl, { maxDim: 600, png: true }),
  ]);

  const valueRows = VALUE_KEYS.filter((k) => job.values[k]).map((k) => [VALUE_LABELS[k], formatMoney(job.values[k]!.amount, job.values[k]!.currency)]);
  const valuationDate = job.issuedDate ? formatDay(job.issuedDate) : "Draft, not yet issued";
  const purpose = job.purpose === "other" && job.purposeNote ? job.purposeNote : PURPOSE_LABELS[job.purpose];
  const out: string[] = [];

  // ---------- Cover ----------
  const orgLines = [data.org.name, data.org.address, [data.org.phone, data.org.email].filter(Boolean).join("  ")].filter(Boolean);
  const coverPhoto = photos.find((p): p is string => !!p);
  out.push(`<section class="cover">
    <div class="cover-head">
      <div>${logo ? `<img class="logo" src="${logo}"/>` : `<div class="org">${esc(data.org.name)}</div>`}</div>
      <div class="org-lines">${orgLines.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
    </div>
    <div class="eyebrow">${short ? "VALUATION REPORT (SHORT FORM)" : "VALUATION REPORT"}</div>
    <div class="address">${esc(job.propertyAddress)}</div>
    <div class="suburb">${esc(job.suburb)}</div>
    ${coverPhoto ? `<img class="cover-photo" src="${coverPhoto}"/>` : ""}
    ${kv([
      ["Prepared for", data.client?.company || job.clientName],
      ["Purpose", purpose],
      ["Reference", `${job.reference}${job.version > 1 ? ` (version ${job.version})` : ""}`],
      ["Date of valuation", valuationDate],
    ])}
  </section>`);


  // ---------- Summary of values ----------
  out.push(h("Summary of values"));
  out.push(valueRows.length ? grid(["Basis of value", "Amount"], valueRows) : para("No values have been recorded yet.", "muted"));
  if (job.correctionReason && job.version > 1) {
    out.push(para(`This version replaces version ${job.version - 1}. Reason: ${job.correctionReason}`, "muted small"));
  }

  // ---------- Instruction and purpose ----------
  out.push(h("Instruction and purpose"));
  out.push(
    kv([
      ["Instructing party", `${job.clientName} (${PARTY_LABELS[job.partyType]})`],
      ["Contact person", job.contactPerson],
      ["Purpose of valuation", purpose],
      ["Instruction received", formatDay(job.receivedDate)],
      ["Date of inspection", formatDay(data.inspection?.inspectionDate)],
      ["Date of valuation", valuationDate],
    ])
  );

  // ---------- Property description ----------
  out.push(h("Property description"));
  out.push(
    kv([
      ["Address", job.propertyAddress],
      ["Suburb", job.suburb],
      ["Category", CLASS_LABELS[job.propertyClass]],
      ["Land size", formatArea(data.inspection?.landSizeM2 ?? data.property?.area)],
    ])
  );
  if (job.narrative.location) out.push(sub("Location"), para(job.narrative.location));
  if (job.narrative.description) out.push(sub("Description"), para(job.narrative.description));

  // ---------- Inspection ----------
  const insp = data.inspection;
  if (insp) {
    const c = insp.construction;
    out.push(h("Inspection"));
    out.push(
      kv([
        ["Inspected on", formatDay(insp.inspectionDate)],
        ["Present", insp.attendees],
        ["Property type", insp.propertyType],
        ["Overall condition", insp.condition ? CONDITION_LABELS[insp.condition] : ""],
        ["Walls", !short && c.walls],
        ["Roof", !short && c.roof],
        ["Floors", !short && c.floors],
        ["Ceilings", !short && c.ceilings],
        ["Windows", !short && c.windows],
        ["Year built (approx.)", c.yearBuilt ? String(c.yearBuilt) : ""],
        ["Storeys", c.storeys ? String(c.storeys) : ""],
      ])
    );
    const rooms = Object.entries(ROOM_LABELS)
      .map(([k, label]) => [label, insp.accommodation[k as keyof typeof insp.accommodation]] as const)
      .filter(([, n]) => typeof n === "number" && n > 0)
      .map(([label, n]) => `${n} ${label.toLowerCase()}`);
    if (rooms.length || insp.accommodation.other) {
      out.push(sub("Accommodation"), para([rooms.join(", "), insp.accommodation.other].filter(Boolean).join(". ")));
    }
    const services = Object.entries(SERVICE_LABELS)
      .filter(([k]) => insp.services[k as keyof typeof insp.services] === true)
      .map(([, label]) => label);
    if (services.length || insp.services.notes) {
      out.push(sub("Services"), para([services.join(", "), insp.services.notes].filter(Boolean).join(". ")));
    }
    if (insp.buildingAreas.length) {
      const total = insp.buildingAreas.reduce((s, b) => s + b.areaM2, 0);
      out.push(
        sub("Building areas"),
        grid(["Building", "Area"], [...insp.buildingAreas.map((b) => [b.name || "Building", formatArea(b.areaM2)]), ["Total", formatArea(total)]])
      );
    }
    if (insp.notes) out.push(sub("Inspection notes"), para(insp.notes));
  }

  // ---------- Photos ----------
  const shown = photos
    .map((src, i) => (src ? { src, caption: data.inspection?.photos[i]?.caption ?? "" } : null))
    .filter((p): p is { src: string; caption: string } => !!p);
  if (shown.length) {
    out.push(h("Photographs"));
    out.push(
      `<div class="photos">${shown
        .map((p) => `<figure><img src="${p.src}"/>${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`)
        .join("")}</div>`
    );
  }

  // ---------- Market commentary ----------
  if (!short && job.narrative.market) out.push(h("Market commentary"), para(job.narrative.market));

  // ---------- Evidence ----------
  if (data.comparables.length) {
    const comps = short ? data.comparables.slice(0, 6) : data.comparables;
    out.push(h("Comparable evidence"));
    out.push(
      grid(
        ["Address", "Date", "Type", "Land", "Building", "Price / rent", "Adj.", "Adj. rate/m²"],
        comps.map((c) => {
          const amount = c.price ?? c.rent ?? 0;
          const size = c.buildingSizeM2 || c.landSizeM2;
          const rate = c.price && size ? (c.price / size) * (1 + c.adjustmentPct / 100) : null;
          return [
            `${c.address}, ${c.suburb}`,
            formatDay(c.date),
            `${c.kind === "rental" ? "Rental" : c.kind === "valuation" ? "Valuation" : "Sale"}, ${c.propertyType}`,
            formatArea(c.landSizeM2),
            formatArea(c.buildingSizeM2),
            `${formatMoney(amount, c.currency)}${c.price ? "" : " pm"}`,
            `${c.adjustmentPct > 0 ? "+" : ""}${formatNumber(c.adjustmentPct, 1)}%`,
            rate ? formatMoney(rate, c.currency) : "-",
          ];
        }),
        "small"
      )
    );
    const notes = comps.filter((c) => c.adjustmentNote).map((c) => `${c.address}: ${c.adjustmentNote}`);
    if (notes.length) out.push(para(notes.join("\n"), "muted small"));
  }

  // ---------- Valuation and workings ----------
  out.push(h("Valuation and workings"));
  if (job.methods.length) out.push(para(`Method: ${job.methods.map((m) => METHOD_LABELS[m]).join(", ")}.`));
  const calc = job.calculations;
  const ccy = job.values.market?.currency ?? job.currency;
  if (calc?.comparison) {
    out.push(
      para(
        `Comparison: average adjusted rate ${formatMoney(calc.comparison.averageRateM2, ccy)} per m² of ${calc.comparison.basis} area × ${formatArea(calc.comparison.subjectAreaM2)} = ${formatMoney(calc.comparison.result, ccy)}.`
      )
    );
  }
  if (calc?.income) {
    const net = calc.income.monthlyRent * 12 - calc.income.annualOutgoings;
    out.push(
      para(
        `Income: net annual rent ${formatMoney(net, ccy)} capitalised at ${formatNumber(calc.income.yieldPct, 2)}% = ${formatMoney(calc.income.result, ccy)}.`
      )
    );
  }
  if (calc?.cost) {
    const bld = calc.cost.buildings.reduce((s, b) => s + b.areaM2 * b.rateM2, 0) + calc.cost.externalWorks;
    out.push(
      para(
        `Cost: land ${formatMoney(calc.cost.landValue, ccy)} plus replacement cost ${formatMoney(bld, ccy)} less ${formatNumber(calc.cost.depreciationPct, 1)}% depreciation = ${formatMoney(calc.cost.result, ccy)}.`
      )
    );
  }
  out.push(para(job.workings));

  // ---------- Values ----------
  out.push(h("Values"));
  if (valueRows.length) out.push(grid(["Basis of value", "Amount"], valueRows));
  out.push(para(`In our opinion the values of the property described, as at ${valuationDate}, are as stated above.`));

  // ---------- Assumptions ----------
  out.push(h("Assumptions and limiting conditions"));
  if (data.wording.assumptions) out.push(sub("Assumptions"), para(data.wording.assumptions, "small"));
  if (data.wording.limitingConditions) out.push(sub("Limiting conditions"), para(data.wording.limitingConditions, "small"));
  out.push(para(data.wording.disclaimer, "muted small"));

  // ---------- Signatures ----------
  const sigBlock = (title: string, person: ReportData["preparedBy"], sig: string | null) => `<div class="sig">
    <div class="sig-title">${esc(title.toUpperCase())}</div>
    ${sig ? `<img src="${sig}"/>` : `<div class="sig-line"></div>`}
    <div class="sig-name">${esc(person?.name ?? (issued ? "" : "Pending sign-off"))}</div>
    ${person?.qualifications ? `<div>${esc(person.qualifications)}</div>` : ""}
    ${person?.registrationNumber ? `<div>Registration no. ${esc(person.registrationNumber)}</div>` : ""}
  </div>`;
  out.push(`<div class="keep">${h("Signatures")}<div class="sigs">${sigBlock("Prepared by", data.preparedBy, prepSig)}${sigBlock("Signed by", data.signedBy, signSig)}</div></div>`);
  out.push(para(issued ? `Issued ${valuationDate}.` : "Draft for review. Not valid until signed and issued.", "muted small"));
  out.push(`<div class="foot">Confidential. Prepared for the instructing party only.</div>`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 16mm 18mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10.5px; line-height: 1.45; margin: 0; }
  h2 { color: #b45309; font-size: 14px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; page-break-after: avoid; }
  h3 { font-size: 11px; margin: 12px 0 4px; page-break-after: avoid; }
  p { margin: 0 0 8px; } .muted { color: #64748b; } .small { font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  table.kv th { text-align: left; width: 34%; color: #64748b; font-weight: 600; padding: 4px 6px 4px 0; vertical-align: top; }
  table.kv td { padding: 4px 0; vertical-align: top; }
  table.grid th { background: #b45309; color: #fff; text-align: left; padding: 5px; font-weight: 600; }
  table.grid td { border: 0.5px solid #e2e8f0; padding: 5px; vertical-align: top; }
  table.grid tbody tr:nth-child(even) td { background: #f8fafc; }
  table.small { font-size: 8px; }
  .cover { page-break-after: always; }
  .cover-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 90px; }
  .cover-head .org { font-size: 18px; font-weight: 700; }
  .logo { max-width: 180px; max-height: 70px; }
  .org-lines { text-align: right; color: #64748b; font-size: 9px; }
  .eyebrow { color: #b45309; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; }
  .address { font-size: 26px; font-weight: 700; margin: 14px 0 6px; line-height: 1.2; }
  .suburb { font-size: 15px; color: #64748b; margin-bottom: 20px; }
  .cover-photo { width: 100%; max-height: 330px; object-fit: cover; margin-bottom: 22px; }
  .photos { display: flex; flex-wrap: wrap; gap: 12px; }
  .photos figure { width: calc(50% - 6px); margin: 0; page-break-inside: avoid; }
  .photos img { width: 100%; height: 190px; object-fit: cover; }
  .photos figcaption { color: #64748b; font-size: 8.5px; margin-top: 3px; }
  .keep { page-break-inside: avoid; }
  .sigs { display: flex; gap: 24px; }
  .sig { flex: 1; font-size: 9px; }
  .sig-title { color: #64748b; font-weight: 700; margin-bottom: 6px; }
  .sig img { max-width: 160px; max-height: 50px; display: block; margin-bottom: 6px; }
  .sig-line { border-bottom: 1px solid #e2e8f0; width: 180px; height: 44px; margin-bottom: 8px; }
  .sig-name { font-weight: 700; font-size: 10px; }
  .foot { margin-top: 24px; color: #64748b; font-size: 8px; }
  </style></head><body>${out.join("\n")}</body></html>`;
}
