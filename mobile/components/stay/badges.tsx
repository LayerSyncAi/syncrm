/** Status badges for units, leases and charges, the same tones as the website. */
import { Badge, type BadgeTone } from "../ui";
import { CHARGE_STATUS_LABELS, LEASE_STATUS_LABELS, UNIT_STATUS_LABELS } from "@/lib/stay/format";

const UNIT: Record<string, BadgeTone> = { vacant: "warning", occupied: "success", notice: "info" };
const LEASE: Record<string, BadgeTone> = { active: "success", ended: "neutral", renewed: "info" };
const CHARGE: Record<string, BadgeTone> = { unpaid: "danger", part_paid: "warning", paid: "success", cancelled: "neutral" };

export function UnitStatusBadge({ status }: { status: string }) {
  return <Badge tone={UNIT[status] ?? "neutral"} label={UNIT_STATUS_LABELS[status] ?? status} />;
}

export function LeaseStatusBadge({ status, notice }: { status: string; notice?: boolean }) {
  if (status === "active" && notice) return <Badge tone="info" label="Notice given" />;
  return <Badge tone={LEASE[status] ?? "neutral"} label={LEASE_STATUS_LABELS[status] ?? status} />;
}

export function ChargeStatusBadge({ status }: { status: string }) {
  return <Badge tone={CHARGE[status] ?? "neutral"} label={CHARGE_STATUS_LABELS[status] ?? status} />;
}
