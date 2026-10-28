import { esc, pdfShell } from "../files";
import { conditionChange, conditionLabel, formatDay, pairRooms, type Condition } from "@/lib/stay-ops/labels";

type Room = { name: string; condition?: Condition; note?: string; photoUrls: string[] };

export type ReportData = {
  typeLabel: string;
  date: string;
  unitLabel: string;
  propertyTitle: string;
  propertyLocation: string;
  tenantName?: string;
  inspectorName: string;
  rooms: Room[];
  meterReadings?: { water?: string; electricity?: string };
  comments?: string;
  addenda: { note: string; at: number; byName: string }[];
  moveIn?: { date: string; rooms: Room[]; meterReadings?: { water?: string; electricity?: string } } | null;
};

const photos = (urls: string[]) =>
  urls.length ? `<div class="photos">${urls.map((u) => `<img src="${esc(u)}"/>`).join("")}</div>` : "";

/** The branded inspection report as HTML for sharePdf. Photos are linked by URL. */
export function inspectionReportHtml(
  r: ReportData,
  org: { name: string; address?: string; phone?: string; email?: string; logoUrl?: string | null }
): string {
  const paired = r.moveIn ? pairRooms(r.rooms, r.moveIn.rooms) : null;
  const meters = [
    r.meterReadings?.water ? ["Water meter", r.meterReadings.water] : null,
    r.meterReadings?.electricity ? ["Electricity meter", r.meterReadings.electricity] : null,
    r.moveIn?.meterReadings?.water ? ["Move-in water meter", r.moveIn.meterReadings.water] : null,
    r.moveIn?.meterReadings?.electricity ? ["Move-in electricity meter", r.moveIn.meterReadings.electricity] : null,
  ].filter((x): x is string[] => !!x);
  const facts = [
    ["Property", `${r.propertyTitle}${r.propertyLocation ? `, ${r.propertyLocation}` : ""}`],
    ["Unit", r.unitLabel],
    ["Tenant", r.tenantName ?? ""],
    ["Date", formatDay(r.date)],
    ["Inspector", r.inspectorName],
    ...meters,
  ].filter((f) => f[1]);

  const roomTable = paired
    ? `<table><tr><th>Room</th><th>Move-in</th><th>Move-out</th><th>Change</th><th>Notes</th></tr>${paired
        .map((p) => {
          const c = conditionChange(p.in?.condition, p.out?.condition);
          const change = c === "worse" ? "Worse" : c === "better" ? "Better" : c === "same" ? "Unchanged" : "";
          return `<tr><td>${esc(p.name)}</td><td>${esc(conditionLabel(p.in?.condition))}</td><td>${esc(conditionLabel(p.out?.condition))}</td><td>${change}</td><td>${esc(p.out?.note ?? "")}</td></tr>`;
        })
        .join("")}</table>`
    : `<table><tr><th>Room</th><th>Condition</th><th>Notes</th></tr>${r.rooms
        .map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(conditionLabel(x.condition))}</td><td>${esc(x.note ?? "")}</td></tr>`)
        .join("")}</table>`;

  const roomPhotos = r.rooms
    .filter((x) => x.photoUrls.length)
    .map((x) => `<h2>${esc(x.name)}</h2>${photos(x.photoUrls)}`)
    .join("");

  const body = `
    <table>${facts.map((f) => `<tr><td><b>${esc(f[0])}</b></td><td>${esc(f[1])}</td></tr>`).join("")}</table>
    <h2>Rooms</h2>${roomTable}
    ${r.comments ? `<h2>Overall comments</h2><p>${esc(r.comments).replace(/\n/g, "<br/>")}</p>` : ""}
    ${roomPhotos ? `<h2>Photos</h2>${roomPhotos}` : ""}
    ${
      r.addenda.length
        ? `<h2>Addenda</h2>${r.addenda
            .map((a) => `<p>${esc(a.note)}<br/><span class="muted">${esc(a.byName)}, ${esc(new Date(a.at).toDateString())}</span></p>`)
            .join("")}`
        : ""
    }`;

  return pdfShell({
    title: `${r.typeLabel} inspection report`,
    agencyName: org.name,
    agencyLines: [org.address ?? "", [org.phone, org.email].filter(Boolean).join("  |  ")],
    logoUrl: org.logoUrl,
    body,
  });
}
