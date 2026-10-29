import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/** Finance settings, accounts, categories, the agency's today and the caller's role. Undefined while loading. */
export function useFinance() {
  return useQuery(api.finance.settings.get);
}

/** { isDirector, isStaff, canApprove }, or undefined while loading. Staff-only queries must wait for this. */
export function useFinanceRole() {
  return useFinance()?.role;
}
