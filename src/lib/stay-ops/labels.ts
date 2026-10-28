/** Labels and small pure helpers shared by the Stay maintenance and inspection screens. */

export type MaintenanceStatus = "new" | "in_progress" | "done";
export type Condition = "good" | "fair" | "poor" | "damaged";
export type InspectionType = "move_in" | "routine" | "move_out";
export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

export const MAINTENANCE_STATUSES: { value: MaintenanceStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export const maintenanceStatusVariant: Record<MaintenanceStatus, BadgeVariant> = {
  new: "warning",
  in_progress: "info",
  done: "success",
};

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "damaged", label: "Damaged" },
];

export const conditionLabel = (c?: Condition | null) =>
  CONDITIONS.find((x) => x.value === c)?.label ?? "Not rated";

export const conditionVariant: Record<Condition, BadgeVariant> = {
  good: "success",
  fair: "info",
  poor: "warning",
  damaged: "danger",
};

export const INSPECTION_TYPES: { value: InspectionType; label: string }[] = [
  { value: "move_in", label: "Move-in" },
  { value: "routine", label: "Routine" },
  { value: "move_out", label: "Move-out" },
];

export const inspectionTypeLabel = (t: InspectionType) =>
  INSPECTION_TYPES.find((x) => x.value === t)?.label ?? t;

const CONDITION_RANK: Record<Condition, number> = { good: 0, fair: 1, poor: 2, damaged: 3 };

/** How a room changed between move-in and move-out. */
export function conditionChange(
  before?: Condition | null,
  after?: Condition | null
): "worse" | "better" | "same" | "unknown" {
  if (!before || !after) return "unknown";
  const d = CONDITION_RANK[after] - CONDITION_RANK[before];
  return d > 0 ? "worse" : d < 0 ? "better" : "same";
}

/** Pair move-out rooms with the move-in room of the same name. */
export function pairRooms<T extends { name: string }, U extends { name: string }>(
  moveOut: T[],
  moveIn: U[]
): { name: string; out: T | null; in: U | null }[] {
  const key = (n: string) => n.trim().toLowerCase();
  const inMap = new Map(moveIn.map((r) => [key(r.name), r]));
  const seen = new Set<string>();
  const rows: { name: string; out: T | null; in: U | null }[] = moveOut.map((r) => {
    seen.add(key(r.name));
    return { name: r.name, out: r, in: inMap.get(key(r.name)) ?? null };
  });
  for (const r of moveIn) {
    if (!seen.has(key(r.name))) rows.push({ name: r.name, out: null, in: r });
  }
  return rows;
}

/** "2026-03-05" as "5 Mar 2026". */
export function formatDay(date?: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
