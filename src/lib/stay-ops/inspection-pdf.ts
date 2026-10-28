import { conditionLabel, formatDay, pairRooms, type Condition } from "./labels";
import { fetchForPdf } from "./photos";

export type ReportRoom = {
  name: string;
  condition?: Condition;
  note?: string;
  photoUrls: string[];
};

export type ReportData = {
  typeLabel: string;
  type: string;
  date: string;
  unitLabel: string;
  propertyTitle: string;
  propertyLocation: string;
  tenantName?: string;
  inspectorName: string;
  rooms: ReportRoom[];
  meterReadings?: { water?: string; electricity?: string };
  comments?: string;
  addenda: { note: string; at: number; byName: string }[];
  moveIn?: { date: string; rooms: ReportRoom[] } | null;
};

export type ReportOrg = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string | null;
};

const GREEN: [number, number, number] = [42, 89, 37];

/** Build the branded inspection report as a PDF and download it. */
export async function downloadInspectionPdf(r: ReportData, org: ReportOrg): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mx = 40;
  let y = 44;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (h: number) => {
    if (y + h > pageH - 40) {
      doc.addPage();
      y = 44;
    }
  };

  // Header: logo, agency details.
  const logo = org.logoUrl ? await fetchForPdf(org.logoUrl, 300) : null;
  let textX = mx;
  if (logo) {
    doc.addImage(logo, "JPEG", mx, y - 10, 48, 48);
    textX = mx + 58;
  }
  doc.setFontSize(14).setTextColor(0).text(org.name, textX, y + 4);
  doc.setFontSize(9).setTextColor(110);
  const contact = [org.address, org.phone, org.email].filter(Boolean).join("  |  ");
  if (contact) doc.text(contact, textX, y + 18, { maxWidth: pageW - textX - mx });
  y += 58;
  doc.setDrawColor(...GREEN).setLineWidth(1.5).line(mx, y, pageW - mx, y);
  y += 24;

  doc.setFontSize(18).setTextColor(0).text(`${r.typeLabel} inspection report`, mx, y);
  y += 10;
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 90 } },
    body: [
      ["Property", `${r.propertyTitle}${r.propertyLocation ? `, ${r.propertyLocation}` : ""}`],
      ["Unit", r.unitLabel],
      ["Tenant", r.tenantName ?? ""],
      ["Date", formatDay(r.date)],
      ["Inspector", r.inspectorName],
      ...(r.meterReadings?.water ? [["Water meter", r.meterReadings.water]] : []),
      ...(r.meterReadings?.electricity ? [["Electricity meter", r.meterReadings.electricity]] : []),
    ],
    margin: { left: mx, right: mx },
  });
  y = lastY() + 16;

  // Room table. A move-out adds the move-in condition beside it.
  const paired = r.moveIn ? pairRooms(r.rooms, r.moveIn.rooms) : null;
  autoTable(doc, {
    startY: y,
    head: [r.moveIn ? ["Room", "Move-in", "Move-out", "Notes"] : ["Room", "Condition", "Notes"]],
    body: paired
      ? paired.map((p) => [
          p.name,
          conditionLabel(p.in?.condition),
          conditionLabel(p.out?.condition),
          p.out?.note ?? "",
        ])
      : r.rooms.map((x) => [x.name, conditionLabel(x.condition), x.note ?? ""]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: GREEN },
    margin: { left: mx, right: mx },
  });
  y = lastY() + 20;

  if (r.comments) {
    ensure(50);
    doc.setFontSize(11).setTextColor(0).text("Overall comments", mx, y);
    doc.setFontSize(9).setTextColor(60);
    const lines = doc.splitTextToSize(r.comments, pageW - mx * 2) as string[];
    doc.text(lines, mx, y + 14);
    y += 14 + lines.length * 12 + 12;
  }

  // Photos, room by room, two per row.
  const withPhotos = r.rooms.filter((x) => x.photoUrls.length);
  if (withPhotos.length) {
    ensure(40);
    doc.setFontSize(12).setTextColor(0).text("Photos", mx, y);
    y += 14;
    const cellW = (pageW - mx * 2 - 12) / 2;
    const cellH = cellW * 0.72;
    for (const room of withPhotos) {
      ensure(24 + cellH);
      doc.setFontSize(10).setTextColor(0).text(room.name, mx, y + 8);
      y += 16;
      let col = 0;
      for (const url of room.photoUrls) {
        const data = await fetchForPdf(url);
        if (!data) continue;
        if (col === 0) ensure(cellH + 8);
        doc.addImage(data, "JPEG", mx + col * (cellW + 12), y, cellW, cellH);
        col++;
        if (col === 2) {
          col = 0;
          y += cellH + 8;
        }
      }
      if (col === 1) y += cellH + 8;
      y += 6;
    }
  }

  if (r.addenda.length) {
    ensure(50);
    doc.setFontSize(11).setTextColor(0).text("Addenda", mx, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Date", "By", "Note"]],
      body: r.addenda.map((a) => [
        new Date(a.at).toLocaleDateString("en-GB"),
        a.byName,
        a.note,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: GREEN },
      margin: { left: mx, right: mx },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(140).text(`${org.name}  |  Page ${i} of ${pages}`, mx, pageH - 20);
  }
  const slug = `${r.propertyTitle}-${r.unitLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const d = r.date.replace(/-/g, "").slice(2);
  doc.save(`${d}_inspection-${r.type.replace("_", "-")}-${slug}.pdf`);
}
