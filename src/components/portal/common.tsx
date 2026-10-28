"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/currency";
import { formatDay } from "@/lib/stay-ops/labels";

export type PortalKind = "tenant" | "landlord";

export function usePortal() {
  return useQuery(api.portal.context.get);
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold text-text">{title}</h1>
      {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
    </div>
  );
}

export function PortalLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export function NotAvailable() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="font-medium text-text">Not available</p>
        <p className="mt-1 text-sm text-text-muted">This page is not part of your portal.</p>
      </CardContent>
    </Card>
  );
}

/**
 * Renders children only for the expected kind. Children mount after the check
 * so their queries never run for the wrong kind.
 */
export function KindGuard({ kind, children }: { kind: PortalKind; children: React.ReactNode }) {
  const portal = usePortal();
  if (portal === undefined) return <PortalLoading />;
  if (!portal || portal.kind !== kind) return <NotAvailable />;
  return <>{children}</>;
}

/** One line per currency, never summed across currencies. */
export function MoneyMap({ value }: { value: Partial<Record<string, number>> }) {
  const entries = Object.entries(value).filter(([, n]) => n);
  if (entries.length === 0) return <span>{formatMoney(0, "USD")}</span>;
  return (
    <span className="flex flex-col">
      {entries.map(([c, n]) => (
        <span key={c}>{formatMoney(n, c)}</span>
      ))}
    </span>
  );
}

export function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-text-muted">{label}</p>
        <div className={`mt-1 text-xl font-semibold ${tone === "danger" ? "text-danger" : "text-text"}`}>{children}</div>
      </CardContent>
    </Card>
  );
}

export function DocumentList({
  docs,
}: {
  docs: { _id: string; name: string; kind: string; url: string | null; propertyTitle?: string }[];
}) {
  if (docs.length === 0) return <p className="text-sm text-text-muted">No documents have been shared yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {docs.map((d) => (
        <li key={d._id}>
          {d.url ? (
            <a href={d.url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 py-2 text-sm text-primary-600">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.name}</span>
                {d.propertyTitle && <span className="block truncate text-xs text-text-muted">{d.propertyTitle}</span>}
              </span>
            </a>
          ) : (
            <span className="flex min-h-12 items-center text-sm text-text-muted">{d.name} (unavailable)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

type LeaseOption = { _id: string; propertyTitle: string; unitLabel: string };

/** Hidden when there is a single lease. */
export function LeaseSelect({
  leases,
  value,
  onChange,
}: {
  leases: LeaseOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (leases.length < 2) return null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="mb-4 h-12" aria-label="Lease">
      {leases.map((l) => (
        <option key={l._id} value={l._id}>
          {l.propertyTitle}, {l.unitLabel}
        </option>
      ))}
    </Select>
  );
}

/** Selected id, falling back to the first lease. */
export function useSelectedLease<T extends { _id: string }>(leases: T[] | undefined) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const id = picked && leases?.some((l) => l._id === picked) ? picked : (leases?.[0]?._id ?? "");
  return [id, setPicked] as const;
}

export const dayLabel = formatDay;
export const errText = (e: unknown) => {
  const data = (e as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  return e instanceof Error ? e.message.split("\n")[0] : "Something went wrong.";
};
