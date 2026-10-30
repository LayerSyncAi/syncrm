/**
 * SyncEstate product icons for the website. The path data is shared with the
 * phone app (src/lib/product-icon-paths.ts); createLucideIcon gives them the
 * same props (className, strokeWidth, size) as every interface icon.
 */
import { createLucideIcon, type IconNode } from "lucide-react";
import { PRODUCT_ICON_PATHS, type ProductIconKey } from "../../lib/product-icon-paths";

const icon = (key: ProductIconKey) =>
  createLucideIcon(
    `sync-${key}`,
    PRODUCT_ICON_PATHS[key].map((d, i): IconNode[number] => ["path", { d, key: `${key}-${i}` }])
  );

export const SyncEstateIcon = icon("estate");
export const SynCrmIcon = icon("crm");
export const SyncStayIcon = icon("stay");
export const SyncWorthIcon = icon("worth");
export const SyncMediaIcon = icon("media");
export const SyncFinanceIcon = icon("finance");
export const SyncDevIcon = icon("dev");
export const SyncHrIcon = icon("hr");
