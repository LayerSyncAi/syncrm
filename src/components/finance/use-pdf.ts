"use client";

import * as React from "react";
import { useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { downloadFinancePdf, type FinanceDocument } from "@/lib/finance/pdf";

/**
 * Download a finance document with the agency's logo. Pass a function that
 * builds the document (it may load data first); errors become a toast.
 */
export function useFinancePdf() {
  const convex = useConvex();
  return React.useCallback(
    async (build: () => Promise<FinanceDocument | null> | FinanceDocument | null) => {
      try {
        const [docData, branding] = await Promise.all([build(), convex.query(api.branding.get, {}).catch(() => null)]);
        if (!docData) throw new Error("Nothing to print");
        await downloadFinancePdf(docData, branding?.logoUrl);
      } catch (e) {
        animatedToast.error("Could not create the PDF", { description: getErrorMessage(e) });
      }
    },
    [convex]
  );
}
