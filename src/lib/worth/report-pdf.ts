/**
 * SyncWorth branded A4 valuation report (VW-50..53), generated in the
 * browser from `api.worth.valuation.reportData`. Every figure is read from the
 * job record; nothing is typed into the report text (VW-43).
 *
 * jsPDF and jspdf-autotable load on demand.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
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
} from "./format";
import { loadImageForPdf, type LoadedImage } from "./image";

export type ReportData = FunctionReturnType<typeof api.worth.valuation.reportData>;

type RGB = [number, number, number];
const INK: RGB = [15, 23, 42];
const MUTED: RGB = [100, 116, 139];
const ACCENT: RGB = [180, 83, 9];
const RULE: RGB = [226, 232, 240];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;
const TOP = 70;
const BOTTOM = PAGE_H - 56;

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

const CONDITION_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export async function buildReportPdf(data: ReportData, logoUrl?: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const short = data.job.reportForm === "short";
  const issued = data.job.status === "issued";
  const maxPhotos = short ? 4 : 24;

  const [logo, photos, prepSig, signSig] = await Promise.all([
    loadImageForPdf(logoUrl, { maxDim: 600, png: true }),
    Promise.all((data.inspection?.photos ?? []).slice(0, maxPhotos).map((p) => loadImageForPdf(p.url, { maxDim: 1200 }))),
    loadImageForPdf(data.preparedBy?.signatureUrl, { maxDim: 600, png: true }),
    loadImageForPdf(data.signedBy?.signatureUrl, { maxDim: 600, png: true }),
  ]);

  let y = TOP;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  const newPage = () => {
    doc.addPage();
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  const heading = (text: string) => {
    ensure(48);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...ACCENT);
    doc.text(text, M, y);
    y += 6;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.8);
    doc.line(M, y, PAGE_W - M, y);
    y += 16;
    doc.setTextColor(...INK);
  };
  const subheading = (text: string) => {
    ensure(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(text, M, y);
    y += 14;
  };
  const paragraph = (text: string, opts: { size?: number; color?: RGB } = {}) => {
    if (!text.trim()) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? INK));
    const lh = (opts.size ?? 10) * 1.45;
    for (const block of text.split(/\n/)) {
      const lines = doc.splitTextToSize(block || " ", CONTENT_W) as string[];
      for (const line of lines) {
        ensure(lh);
        doc.text(line, M, y);
        y += lh;
      }
    }
    y += 6;
    doc.setTextColor(...INK);
  };
  const table = (head: string[] | null, body: (string | number)[][], opts: { keyValue?: boolean; fontSize?: number } = {}) => {
    if (body.length === 0) return;
    ensure(40);
    autoTable(doc, {
      startY: y,
      head: head ? [head] : undefined,
      body: body.map((r) => r.map((c) => String(c))),
      margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
      styles: { fontSize: opts.fontSize ?? 9.5, cellPadding: 5, textColor: INK, lineColor: RULE, lineWidth: 0.5 },
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: opts.keyValue ? undefined : { fillColor: [248, 250, 252] },
      columnStyles: opts.keyValue ? { 0: { fontStyle: "bold", cellWidth: 170, textColor: MUTED } } : undefined,
      theme: opts.keyValue ? "plain" : "grid",
    });
    y = lastY() + 14;
  };
  const fitImage = (img: LoadedImage, x: number, top: number, maxW: number, maxH: number) => {
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    doc.addImage(img.dataUrl, img.format, x, top, w, h, undefined, "FAST");
    return { w, h };
  };

  const valueRows = VALUE_KEYS.filter((k) => data.job.values[k]).map((k) => [
    VALUE_LABELS[k],
    formatMoney(data.job.values[k]!.amount, data.job.values[k]!.currency),
  ]);
  const valuationDate = data.job.issuedDate ? formatDay(data.job.issuedDate) : "Draft, not yet issued";
  const purpose = data.job.purpose === "other" && data.job.purposeNote ? data.job.purposeNote : PURPOSE_LABELS[data.job.purpose];

  // ---------- Cover ----------
  if (logo) fitImage(logo, M, 48, 180, 70);
  else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(data.org.name, M, 80);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const orgLines = [data.org.name, data.org.address, [data.org.phone, data.org.email].filter(Boolean).join("  ")].filter(Boolean);
  orgLines.forEach((l, i) => doc.text(l, PAGE_W - M, 60 + i * 12, { align: "right" }));

  y = 190;
  doc.setTextColor(...ACCENT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(short ? "VALUATION REPORT (SHORT FORM)" : "VALUATION REPORT", M, y);
  y += 30;
  doc.setTextColor(...INK);
  doc.setFontSize(24);
  for (const line of doc.splitTextToSize(data.job.propertyAddress, CONTENT_W) as string[]) {
    doc.text(line, M, y);
    y += 30;
  }
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(data.job.suburb, M, y);
  y += 30;

  const coverPhoto = photos.find((p): p is LoadedImage => !!p);
  if (coverPhoto) {
    const { h } = fitImage(coverPhoto, M, y, CONTENT_W, 280);
    y += h + 24;
  }
  const coverRows: Array<[string, string]> = [
    ["Prepared for", data.client?.company || data.job.clientName],
    ["Purpose", purpose],
    ["Reference", `${data.job.reference}${data.job.version > 1 ? ` (version ${data.job.version})` : ""}`],
    ["Date of valuation", valuationDate],
  ];
  doc.setFontSize(10.5);
  for (const [k, v] of coverRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(v, M + 130, y);
    y += 18;
  }

  // ---------- Summary of values ----------
  newPage();
  heading("Summary of values");
  if (valueRows.length) table(["Basis of value", "Amount"], valueRows);
  else paragraph("No values have been recorded yet.", { color: MUTED });
  if (data.job.correctionReason && data.job.version > 1) {
    paragraph(`This version replaces version ${data.job.version - 1}. Reason: ${data.job.correctionReason}`, {
      size: 9,
      color: MUTED,
    });
  }

  // ---------- Instruction and purpose ----------
  heading("Instruction and purpose");
  table(
    null,
    [
      ["Instructing party", `${data.job.clientName} (${PARTY_LABELS[data.job.partyType]})`],
      ...(data.job.contactPerson ? [["Contact person", data.job.contactPerson]] : []),
      ["Purpose of valuation", purpose],
      ["Instruction received", formatDay(data.job.receivedDate)],
      ["Date of inspection", formatDay(data.inspection?.inspectionDate)],
      ["Date of valuation", valuationDate],
    ],
    { keyValue: true }
  );

  // ---------- Property description ----------
  heading("Property description");
  table(
    null,
    [
      ["Address", data.job.propertyAddress],
      ["Suburb", data.job.suburb],
      ["Category", CLASS_LABELS[data.job.propertyClass]],
      ["Land size", formatArea(data.inspection?.landSizeM2 ?? data.property?.area)],
    ],
    { keyValue: true }
  );
  if (data.job.narrative.location) {
    subheading("Location");
    paragraph(data.job.narrative.location);
  }
  if (data.job.narrative.description) {
    subheading("Description");
    paragraph(data.job.narrative.description);
  }

  // ---------- Inspection ----------
  const insp = data.inspection;
  if (insp) {
    heading("Inspection");
    const c = insp.construction;
    table(
      null,
      [
        ["Inspected on", formatDay(insp.inspectionDate)],
        ...(insp.attendees ? [["Present", insp.attendees]] : []),
        ...(insp.propertyType ? [["Property type", insp.propertyType]] : []),
        ...(insp.condition ? [["Overall condition", CONDITION_LABELS[insp.condition]]] : []),
        ...(!short && c.walls ? [["Walls", c.walls]] : []),
        ...(!short && c.roof ? [["Roof", c.roof]] : []),
        ...(!short && c.floors ? [["Floors", c.floors]] : []),
        ...(!short && c.ceilings ? [["Ceilings", c.ceilings]] : []),
        ...(!short && c.windows ? [["Windows", c.windows]] : []),
        ...(c.yearBuilt ? [["Year built (approx.)", String(c.yearBuilt)]] : []),
        ...(c.storeys ? [["Storeys", String(c.storeys)]] : []),
      ],
      { keyValue: true }
    );
    const rooms = Object.entries(ROOM_LABELS)
      .map(([k, label]) => [label, insp.accommodation[k as keyof typeof insp.accommodation]] as const)
      .filter(([, n]) => typeof n === "number" && n > 0)
      .map(([label, n]) => `${n} ${label.toLowerCase()}`);
    if (rooms.length || insp.accommodation.other) {
      subheading("Accommodation");
      paragraph([rooms.join(", "), insp.accommodation.other].filter(Boolean).join(". "));
    }
    const services = Object.entries(SERVICE_LABELS)
      .filter(([k]) => insp.services[k as keyof typeof insp.services] === true)
      .map(([, label]) => label);
    if (services.length || insp.services.notes) {
      subheading("Services");
      paragraph([services.join(", "), insp.services.notes].filter(Boolean).join(". "));
    }
    if (insp.buildingAreas.length) {
      subheading("Building areas");
      const total = insp.buildingAreas.reduce((s, b) => s + b.areaM2, 0);
      table(
        ["Building", "Area"],
        [...insp.buildingAreas.map((b) => [b.name || "Building", formatArea(b.areaM2)]), ["Total", formatArea(total)]]
      );
    }
    if (insp.notes) {
      subheading("Inspection notes");
      paragraph(insp.notes);
    }
  }

  // ---------- Photos ----------
  const shown = photos
    .map((img, i) => (img ? { img, caption: data.inspection?.photos[i]?.caption ?? "" } : null))
    .filter((p): p is { img: LoadedImage; caption: string } => !!p);
  if (shown.length) {
    heading("Photographs");
    const gap = 14;
    const cellW = (CONTENT_W - gap) / 2;
    const cellH = 180;
    for (let i = 0; i < shown.length; i += 2) {
      ensure(cellH + 26);
      for (let j = 0; j < 2 && i + j < shown.length; j++) {
        const { img, caption } = shown[i + j];
        const x = M + j * (cellW + gap);
        const { w, h } = fitImage(img, x, y, cellW, cellH);
        void w;
        if (caption) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...MUTED);
          doc.text(doc.splitTextToSize(caption, cellW)[0] as string, x, y + h + 11);
        }
      }
      y += cellH + 26;
    }
    doc.setTextColor(...INK);
  }

  // ---------- Market commentary ----------
  if (!short && data.job.narrative.market) {
    heading("Market commentary");
    paragraph(data.job.narrative.market);
  }

  // ---------- Evidence ----------
  if (data.comparables.length) {
    heading("Comparable evidence");
    const comps = short ? data.comparables.slice(0, 6) : data.comparables;
    table(
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
      { fontSize: 8 }
    );
    const notes = comps.filter((c) => c.adjustmentNote).map((c) => `${c.address}: ${c.adjustmentNote}`);
    if (notes.length) paragraph(notes.join("\n"), { size: 8.5, color: MUTED });
  }

  // ---------- Valuation and workings ----------
  heading("Valuation and workings");
  if (data.job.methods.length) {
    paragraph(`Method: ${data.job.methods.map((m) => METHOD_LABELS[m]).join(", ")}.`);
  }
  const calc = data.job.calculations;
  const ccy = data.job.values.market?.currency ?? data.job.currency;
  if (calc?.comparison) {
    paragraph(
      `Comparison: average adjusted rate ${formatMoney(calc.comparison.averageRateM2, ccy)} per m² of ${calc.comparison.basis} area × ${formatArea(calc.comparison.subjectAreaM2)} = ${formatMoney(calc.comparison.result, ccy)}.`
    );
  }
  if (calc?.income) {
    const net = calc.income.monthlyRent * 12 - calc.income.annualOutgoings;
    paragraph(
      `Income: net annual rent ${formatMoney(net, ccy)} capitalised at ${formatNumber(calc.income.yieldPct, 2)}% = ${formatMoney(calc.income.result, ccy)}.`
    );
  }
  if (calc?.cost) {
    const bld = calc.cost.buildings.reduce((s, b) => s + b.areaM2 * b.rateM2, 0) + calc.cost.externalWorks;
    paragraph(
      `Cost: land ${formatMoney(calc.cost.landValue, ccy)} plus replacement cost ${formatMoney(bld, ccy)} less ${formatNumber(calc.cost.depreciationPct, 1)}% depreciation = ${formatMoney(calc.cost.result, ccy)}.`
    );
  }
  if (data.job.workings) paragraph(data.job.workings);

  // ---------- Values ----------
  heading("Values");
  if (valueRows.length) table(["Basis of value", "Amount"], valueRows);
  paragraph(
    `In our opinion the values of the property described, as at ${valuationDate}, are as stated above.`,
    { size: 9.5 }
  );

  // ---------- Assumptions ----------
  heading("Assumptions and limiting conditions");
  if (data.wording.assumptions) {
    subheading("Assumptions");
    paragraph(data.wording.assumptions, { size: 9 });
  }
  if (data.wording.limitingConditions) {
    subheading("Limiting conditions");
    paragraph(data.wording.limitingConditions, { size: 9 });
  }
  if (data.wording.disclaimer) paragraph(data.wording.disclaimer, { size: 9, color: MUTED });

  // ---------- Signatures ----------
  heading("Signatures");
  ensure(150);
  const sigBlock = (
    title: string,
    person: ReportData["preparedBy"],
    sig: LoadedImage | null,
    x: number
  ) => {
    let sy = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), x, sy);
    sy += 8;
    if (sig) {
      const { h } = fitImage(sig, x, sy, 160, 50);
      sy += h + 6;
    } else {
      sy += 44;
      doc.setDrawColor(...RULE);
      doc.line(x, sy, x + 180, sy);
      sy += 12;
    }
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(person?.name ?? (issued ? "" : "Pending sign-off"), x, sy);
    sy += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (person?.qualifications) {
      doc.text(person.qualifications, x, sy);
      sy += 12;
    }
    if (person?.registrationNumber) {
      doc.text(`Registration no. ${person.registrationNumber}`, x, sy);
      sy += 12;
    }
    return sy;
  };
  const colW = CONTENT_W / 2;
  const endA = sigBlock("Prepared by", data.preparedBy, prepSig, M);
  const endB = sigBlock("Signed by", data.signedBy, signSig, M + colW);
  y = Math.max(endA, endB) + 10;
  paragraph(issued ? `Issued ${valuationDate}.` : "Draft for review. Not valid until signed and issued.", {
    size: 9,
    color: MUTED,
  });

  // ---------- Header, footer and draft mark on every page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    if (i > 1) {
      doc.text(`${data.org.name}  |  ${data.job.reference}${data.job.version > 1 ? ` v${data.job.version}` : ""}`, M, 36);
      doc.text(data.job.propertyAddress, PAGE_W - M, 36, { align: "right" });
      doc.setDrawColor(...RULE);
      doc.line(M, 44, PAGE_W - M, 44);
    }
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 28, { align: "right" });
    doc.text("Confidential. Prepared for the instructing party only.", M, PAGE_H - 28);
    if (!issued) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(80);
      doc.setTextColor(235, 235, 235);
      doc.text("DRAFT", PAGE_W / 2, PAGE_H / 2, { align: "center", angle: 35 });
    }
  }
  return doc.output("blob");
}

export function reportFilename(data: ReportData): string {
  return `${data.job.reference}${data.job.version > 1 ? `-v${data.job.version}` : ""}${data.job.status === "issued" ? "" : "-draft"}.pdf`;
}
