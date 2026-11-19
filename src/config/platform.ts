/**
 * LayerSync Platform sections. Each has its own address so the sidebar, the
 * Platform page tabs and a page refresh all agree on where you are.
 */
export type PlatformSection = "organisations" | "enquiries" | "team";

export const PLATFORM_SECTION_HREFS: Record<PlatformSection, string> = {
  organisations: "/app/platform",
  enquiries: "/app/platform/enquiries",
  team: "/app/platform/team",
};

export const PLATFORM_NEW_ORG_HREF = "/app/platform/organizations/new";

export function platformSectionForPath(pathname: string): PlatformSection {
  if (pathname.startsWith(PLATFORM_SECTION_HREFS.enquiries)) return "enquiries";
  if (pathname.startsWith(PLATFORM_SECTION_HREFS.team)) return "team";
  return "organisations";
}
