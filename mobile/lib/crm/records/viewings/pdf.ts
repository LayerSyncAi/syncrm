/**
 * The viewing form as a PDF, the same layout as the website's printable form.
 * Signatures are fetched and embedded as data URLs so the PDF renders them
 * even when the print engine does not load remote images.
 */
import { dateLabel } from "../../../format";
import { esc, pdfShell } from "../../../files";

export type ViewingPdfForm = {
  viewingDate: string;
  viewingTime?: string;
  propertyAddress: string;
  clientName: string;
  clientCompany?: string;
  clientIdNumber?: string;
  clientSpouseName?: string;
  clientPhone?: string;
  clientEmail?: string;
  negotiatorName?: string;
  agentName: string;
  sellerName?: string;
  status: "draft" | "completed";
  clientSignatureUrl: string | null;
  negotiatorSignatureUrl: string | null;
  sellerSignatureUrl: string | null;
};

export type Agency = { name: string; address?: string; phone?: string; email?: string } | null | undefined;

/** Download an image and return it as a data URL, or the URL itself on failure. */
async function inline(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export async function viewingFormHtml(form: ViewingPdfForm, agency: Agency): Promise<string> {
  const [client, negotiator, seller] = await Promise.all([
    inline(form.clientSignatureUrl),
    inline(form.negotiatorSignatureUrl),
    inline(form.sellerSignatureUrl),
  ]);
  const negotiatorName = form.negotiatorName || form.agentName;
  const line = (label: string, value?: string) => `<tr><th style="width:40%">${esc(label)}</th><td>${esc(value) || "-"}</td></tr>`;
  const sig = (src: string | null, name: string | undefined, role: string) => `
    <div style="flex:1;text-align:center">
      <div style="height:70px;border:1px solid #ccc;display:flex;align-items:flex-end;justify-content:center;padding:4px">
        ${src ? `<img src="${esc(src)}" style="max-height:60px;max-width:100%"/>` : `<span class="muted">No signature</span>`}
      </div>
      <div style="font-weight:600;margin-top:4px">${esc(name) || "-"}</div>
      <div class="muted" style="text-transform:uppercase;font-size:9px">${esc(role)}</div>
    </div>`;
  const body = `
    <table>
      ${line("Date", dateLabel(form.viewingDate))}
      ${line("Time", form.viewingTime)}
      ${line("Property address", form.propertyAddress)}
      ${line("Client's name", form.clientName)}
      ${line("Client's company name", form.clientCompany)}
      ${line("Client's ID no.", form.clientIdNumber)}
      ${line("Client's spouse's name", form.clientSpouseName)}
      ${line("Client's telephone no.", form.clientPhone)}
      ${line("Client's email address", form.clientEmail)}
      ${line("Property negotiator", negotiatorName)}
      ${line("Status", form.status === "completed" ? "Completed" : "Draft")}
    </table>
    <div style="display:flex;gap:16px;margin-top:28px">
      ${sig(client, form.clientName, "Client signature")}
      ${sig(negotiator, negotiatorName, "Property negotiator")}
      ${sig(seller, form.sellerName, "Seller / caretaker")}
    </div>
    <p class="muted" style="margin-top:24px">This form confirms that the client named above was introduced to the property by the property negotiator on the date shown. Retained for audit and commission purposes.</p>`;
  return pdfShell({
    title: "Viewing form",
    agencyName: agency?.name ?? "",
    agencyLines: [agency?.address ?? "", [agency?.phone, agency?.email].filter(Boolean).join(" · ")],
    body,
  });
}
