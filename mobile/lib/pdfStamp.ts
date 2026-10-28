/**
 * Stamps finished PDFs. The phone's print engine (expo-print) has no page
 * counters and repeats nothing per page, so page numbers, a running header
 * and a DRAFT watermark are drawn onto every page afterwards with pdf-lib.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import * as LegacyFS from "expo-file-system/legacy";

export type StampOptions = {
  /** "Page 2 of 9" centred in the footer. On by default. */
  pageNumbers?: boolean;
  /** Small running line at the top of each page. */
  header?: string;
  /** First page that gets the header (1-based); a cover usually skips it. */
  headerFromPage?: number;
  /** Large faint diagonal word, e.g. "DRAFT". */
  watermark?: string;
};

/** Rewrite the PDF at `uri` in place with the stamps applied. */
export async function stampPdf(uri: string, opts: StampOptions = {}): Promise<void> {
  const { pageNumbers = true, header, headerFromPage = 1, watermark } = opts;
  if (!pageNumbers && !header && !watermark) return;
  const b64 = await LegacyFS.readAsStringAsync(uri, { encoding: LegacyFS.EncodingType.Base64 });
  const doc = await PDFDocument.load(b64);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const grey = rgb(0.39, 0.45, 0.55);
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    if (pageNumbers) {
      const text = `Page ${i + 1} of ${pages.length}`;
      const size = 8;
      page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y: 18, size, font, color: grey });
    }
    if (header && i + 1 >= headerFromPage) {
      const size = 7.5;
      const max = width - 80;
      let text = header;
      while (text.length > 4 && font.widthOfTextAtSize(text, size) > max) text = text.slice(0, -2);
      if (text !== header) text = `${text.trimEnd()}…`;
      page.drawText(text, { x: 40, y: height - 22, size, font, color: grey });
    }
    if (watermark) {
      const size = 96;
      const w = bold.widthOfTextAtSize(watermark, size);
      page.drawText(watermark, {
        x: width / 2 - (w / 2) * Math.cos(Math.PI / 5),
        y: height / 2 - (w / 2) * Math.sin(Math.PI / 5),
        size,
        font: bold,
        color: rgb(0, 0, 0),
        opacity: 0.06,
        rotate: degrees(36),
      });
    }
  });
  const out = await doc.saveAsBase64();
  await LegacyFS.writeAsStringAsync(uri, out, { encoding: LegacyFS.EncodingType.Base64 });
}
