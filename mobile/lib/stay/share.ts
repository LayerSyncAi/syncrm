/** Sharing Stay files from the phone: receipts as PDF and reports as Excel. */
import { useCallback } from "react";
import { Alert } from "react-native";
import { useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/errors";
import { sharePdf } from "../files";
import { receiptPdf } from "./pdf";
import { csvRows, shareXlsx } from "../sheets";

/** Share report rows (built as CSV text) as an Excel workbook, as the website does. */
export async function shareCsv(text: string, fileName: string): Promise<void> {
  await shareXlsx(csvRows(text), fileName.replace(/\.csv$/i, ""));
}

/** The agency logo for PDFs; null when there is none or it cannot be read. */
export function useLogo() {
  const convex = useConvex();
  return useCallback(async () => {
    try {
      return (await convex.query(api.branding.get, {})).logoUrl ?? null;
    } catch {
      return null;
    }
  }, [convex]);
}

/** Build a receipt PDF from api.stay.payments.getReceipt and share it. */
export function useShareReceipt() {
  const convex = useConvex();
  const logo = useLogo();
  return useCallback(
    async (paymentId: Id<"stayPayments">) => {
      try {
        const [receipt, logoUrl] = await Promise.all([convex.query(api.stay.payments.getReceipt, { paymentId }), logo()]);
        if (!receipt) throw new Error("Receipt not found");
        const { html, fileName } = receiptPdf(receipt, logoUrl);
        await sharePdf(html, fileName);
      } catch (e) {
        Alert.alert("Could not create the receipt", getErrorMessage(e));
      }
    },
    [convex, logo],
  );
}
