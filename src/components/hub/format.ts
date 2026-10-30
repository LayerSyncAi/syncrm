import { MODULES, type ModuleKey } from "@/config/modules";

/** "5 min ago", "3 h ago", "2 d ago", then a short date. */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Display name for a notification's module ("hub" is the Hub itself). */
export function notificationModuleName(module: ModuleKey | "hub"): string {
  return module === "hub" ? "SyncEstate" : MODULES[module].name;
}
