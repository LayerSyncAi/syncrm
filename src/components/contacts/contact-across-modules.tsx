"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Building2, FileText, HandCoins, Home, KeyRound, Map as MapIcon, Scale } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/worth/ui";
import { CHARGE_STATUS_LABELS, LEASE_STATUS_LABELS, dateLabel, money } from "@/lib/stay/format";

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  prepared: "Prepared",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STAND_STATUS_LABELS: Record<string, string> = {
  active: "Paying",
  paid: "Paid up",
  cancelled: "Cancelled",
};

/**
 * HB-32: the contact's leases, payments, valuations and stand sales from the
 * other Sync Estate modules. Each block only appears when the viewer can open
 * that module; the server decides.
 */
export function ContactAcrossModules({ contactId }: { contactId: Id<"contacts"> }) {
  const data = useQuery(api.contacts.getAcrossModules, { contactId });

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  if (data === null) return null;

  const { stay, finance, worth, stands } = data;
  const sections = [
    stay && stay.properties.length > 0 && (
      <Section key="stay-props" icon={Home} title="Properties let through Sync Stay">
        {stay.properties.map((p) => (
          <Row key={p._id} href={`/app/stay/properties/${p._id}`} title={p.title}>
            {!p.isActive && <Badge variant="secondary">Inactive</Badge>}
          </Row>
        ))}
      </Section>
    ),
    stay && stay.leases.length > 0 && (
      <Section
        key="stay-leases"
        icon={KeyRound}
        title="Leases as tenant"
        action={<Link href={`/app/stay/tenants/${contactId}`} className="text-xs text-primary hover:underline">Tenant account</Link>}
      >
        {stay.leases.map((l) => (
          <Row
            key={l._id}
            href={`/app/stay/leases/${l._id}`}
            title={[l.property, l.unit].filter(Boolean).join(", ")}
            meta={`${dateLabel(l.startDate)} to ${dateLabel(l.endDate)} · ${money(l.rentAmount, l.currency)} a month`}
          >
            <Badge variant="secondary">{LEASE_STATUS_LABELS[l.status] ?? l.status}</Badge>
            {l.balance > 0 && <Badge variant="warning">Owes {money(l.balance, l.currency)}</Badge>}
          </Row>
        ))}
      </Section>
    ),
    finance?.invoices && finance.invoices.length > 0 && (
      <Section key="invoices" icon={FileText} title="Invoices">
        {finance.invoices.map((i) => (
          <Row
            key={i._id}
            href="/app/finance/invoices"
            title={i.number}
            meta={`${dateLabel(i.date)} · due ${dateLabel(i.dueDate)} · ${money(i.total, i.currency)}`}
          >
            <Badge variant={i.status === "paid" ? "success" : i.status === "cancelled" ? "secondary" : "warning"}>
              {CHARGE_STATUS_LABELS[i.status] ?? i.status}
            </Badge>
          </Row>
        ))}
      </Section>
    ),
    finance?.payouts && finance.payouts.length > 0 && (
      <Section key="payouts" icon={HandCoins} title="Landlord payouts">
        {finance.payouts.map((p) => (
          <Row key={p._id} href="/app/finance/payouts" title={p.number} meta={`${dateLabel(p.date)} · ${money(p.amount, p.currency)}`}>
            <Badge variant="secondary">{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Badge>
          </Row>
        ))}
      </Section>
    ),
    worth && worth.jobs.length > 0 && (
      <Section key="worth" icon={Scale} title="Valuations instructed">
        {worth.jobs.map((j) => (
          <Row
            key={j._id}
            href={`/app/worth/jobs/${j._id}`}
            title={`${j.reference} · ${j.propertyAddress}`}
            meta={j.issuedDate ? `Issued ${dateLabel(j.issuedDate)}` : `Due ${dateLabel(j.dueDate)}`}
          >
            <StatusBadge status={j.status} />
          </Row>
        ))}
      </Section>
    ),
    stands && stands.length > 0 && (
      <Section key="stands" icon={MapIcon} title="Stands bought">
        {stands.map((s) => (
          <Row
            key={s._id}
            href={s.href}
            title={`Stand ${s.standNumber}${s.development ? `, ${s.development}` : ""}`}
            meta={`${money(s.price, s.currency)} · balance ${money(s.balance, s.currency)}`}
          >
            <Badge variant="secondary">{STAND_STATUS_LABELS[s.status] ?? s.status}</Badge>
            {s.overdue > 0 && <Badge variant="warning">Overdue {money(s.overdue, s.currency)}</Badge>}
          </Row>
        ))}
      </Section>
    ),
  ].filter(Boolean);

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nothing in other modules yet"
        description="Leases, payments, valuations and stand sales for this contact show here once they exist in a module you can open."
      />
    );
  }
  return <div className="space-y-4">{sections}</div>;
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Home;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Icon className="h-4 w-4 text-text-muted" /> {title}
        </h3>
        {action}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

function Row({ href, title, meta, children }: { href: string; title: string; meta?: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-row-hover">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{title}</p>
        {meta && <p className="truncate text-xs text-text-muted">{meta}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">{children}</div>
    </Link>
  );
}
