/**
 * The backend stores website links on notifications and dashboard figures
 * ("/app/stay/arrears"). The app mirrors the website's routes, so a link maps
 * across by prefix:
 *   /app/stay/...      -> /stay/...
 *   /app/worth/...     -> /worth/...
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
  if (rest.startsWith("/syncmedia")) return "/media" + rest.slice("/syncmedia".length);
  if (rest === "/admin/branding") return "/media/brand-kit";
  if (rest.startsWith("/admin")) return rest;
  if (rest === "/settings") return "/admin/settings";
  if (rest === "/platform") return "/platform";
  if (rest === "/dashboard") return "/crm";
  return "/crm" + rest;
}
