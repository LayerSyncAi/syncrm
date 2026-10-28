import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  CHARGE_STATUS_LABELS,
  LEASE_STATUS_LABELS,
  UNIT_STATUS_LABELS,
} from "@/lib/stay/format";

const UNIT_VARIANT: Record<string, BadgeProps["variant"]> = {
  vacant: "warning",
  occupied: "success",
  notice: "info",
};

export function UnitStatusBadge({ status }: { status: string }) {
  return <Badge variant={UNIT_VARIANT[status] ?? "neutral"}>{UNIT_STATUS_LABELS[status] ?? status}</Badge>;
}

const LEASE_VARIANT: Record<string, BadgeProps["variant"]> = {
  active: "success",
  ended: "neutral",
  renewed: "info",
};

export function LeaseStatusBadge({ status, notice }: { status: string; notice?: boolean }) {
  if (status === "active" && notice) return <Badge variant="info">Notice given</Badge>;
  return <Badge variant={LEASE_VARIANT[status] ?? "neutral"}>{LEASE_STATUS_LABELS[status] ?? status}</Badge>;
}

const CHARGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  unpaid: "danger",
  part_paid: "warning",
  paid: "success",
  cancelled: "neutral",
};

export function ChargeStatusBadge({ status }: { status: string }) {
  return <Badge variant={CHARGE_VARIANT[status] ?? "neutral"}>{CHARGE_STATUS_LABELS[status] ?? status}</Badge>;
}
