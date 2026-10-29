/**
 * The backend stores website links on notifications and dashboard figures
 * ("/app/stay/arrears"). The app mirrors the website's routes, so a link maps
 * across by prefix:
 *   /app/stay/...      -> /stay/...
 *   /app/worth/...     -> /worth/...
 *   /app/finance/...   -> /finance/... (by tab, see financeRoute)
 *   /app/dev/...       -> /dev/... (by tab, see devRoute)
 *   /app/syncmedia/... -> /media/...
 *   /app/admin/branding -> /media/brand-kit
 *   /app/admin/... and /app/settings -> /admin/...
 *   /app/dashboard     -> /crm
 *   any other /app/... -> /crm/...
 *   /portal/...        -> /portal/... (unchanged)
 */
export function appRoute(webHref: string | null | undefined): string | null {
  if (!webHref) return null;
  const href = webHref.split("?")[0]!;
  if (href.startsWith("/portal")) return href;
  if (!href.startsWith("/app")) return null;
  const rest = href.slice(4) || "/";
  if (rest === "/hub" || rest === "/") return "/hub";
  if (rest.startsWith("/stay") || rest.startsWith("/worth")) return rest;
  if (rest.startsWith("/finance")) return financeRoute(rest);
  if (rest === "/dev" || rest.startsWith("/dev/")) return devRoute(rest);
  if (rest.startsWith("/syncmedia")) return "/media" + rest.slice("/syncmedia".length);
  if (rest === "/admin/branding") return "/media/brand-kit";
  if (rest.startsWith("/admin")) return rest;
  if (rest === "/settings") return "/admin/settings";
  if (rest === "/platform") return "/platform";
  if (rest === "/dashboard") return "/crm";
  return "/crm" + rest;
}

/** The app keeps the main Finance pages as tabs, so only some web paths have a screen. */
function financeRoute(rest: string): string {
  const parts = rest.split("/").filter(Boolean); // ["finance", section, id?]
  const section = parts[1];
  const id = parts[2];
  if (section === "trust") return id ? `/finance/landlords/${id}` : "/finance/landlords";
  if (section === "instalments") return id ? `/finance/instalments/${id}` : "/finance/instalments";
  if (section === "money") return "/finance/money";
  if (section === "payouts") return "/finance/payouts";
  return "/finance";
}

/** Sync Dev keeps Developments and Buyers as tabs; the dashboard is the Developments tab. */
function devRoute(rest: string): string {
  const parts = rest.split("/").filter(Boolean); // ["dev", section, id?]
  const section = parts[1];
  const id = parts[2];
  if (section === "developments") return id ? `/dev/developments/${id}` : "/dev";
  if (section === "buyers") return id ? `/dev/buyers/${id}` : "/dev/buyers";
  return "/dev";
}
